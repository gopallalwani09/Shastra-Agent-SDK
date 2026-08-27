import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import "dotenv/config";
import type { RunContext } from "../../types/types.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { executeQueries, executeQuery, type QueryExecutionResult } from "./queryExecutor.js";
import { GuardrailError } from "../../guardrails/guardrailError.js";

const openai = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL
});

/**
 * Zod Schema for structured memory extraction from LLM
 */
export const MemoryExtractionSchema = z.object({
    entities: z.array(z.object({
        name: z.string().describe("Name of the entity, preference, technology, or project"),
        type: z.enum(["Preference_Like", "Preference_Dislike", "Project", "Technology", "Topic", "Person", "Other"]),
        description: z.string().nullable().describe("Short description or context about the entity, or null if none"),
        relationshipToUser: z.enum(["LIKES", "DISLIKES", "WORKS_ON", "WORKS_WITH", "INTERESTED_IN", "KNOWS", "RELATED_TO"]).describe("Relationship connecting User to this entity")
    })).describe("List of extracted knowledge graph entities and their relationship to the user"),
    queries: z.array(z.string()).describe("Executable Cypher queries using MERGE to create/update nodes and relationships in Neo4j without duplication")
});

export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export interface MemoryMakerResult {
    success: boolean;
    extracted: MemoryExtraction;
    queryResults: QueryExecutionResult[];
    error?: string;
}

import { globalContext } from "../../Agent/Runner.js";

/**
 * Formats various context inputs (string, RunContext, array of messages) into a clean text prompt.
 * If no context is passed, automatically uses the inbuilt globalContext from Runner.
 */
function normalizeContext(context?: string | RunContext | ChatCompletionMessageParam[]): string {
    const target = context ?? globalContext;

    if (typeof target === "string") {
        return target;
    }

    const messages: ChatCompletionMessageParam[] =
        "messages" in target && Array.isArray(target.messages)
            ? target.messages
            : Array.isArray(target)
                ? target
                : [];

    if (messages.length > 0) {
        console.log(`[MemoryMaker] Inbuilt LLM Context: ${messages.length} messages found`);
        messages.forEach((msg, idx) => {
            const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
            console.log(`  [${idx + 1}] (${msg.role}): ${contentStr.substring(0, 80)}${contentStr.length > 80 ? "..." : ""}`);
        });

        return messages
            .map(m => `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
            .join("\n");
    }

    return JSON.stringify(target);
}

/**
 * Guardrail: Checks if a node with a given label and property value already exists in Neo4j.
 * 
 * @param label - Neo4j node label (e.g. "User", "Preference", "Technology", "Project")
 * @param propertyName - Property to match (e.g. "name", "id")
 * @param propertyValue - Value of the property
 * @returns boolean indicating if the node exists
 */
export async function checkNodeExists(
    label: string,
    propertyName: string,
    propertyValue: string
): Promise<boolean> {
    // Sanitize label and property name to avoid injection
    const cleanLabel = label.replace(/[^a-zA-Z0-9_]/g, "");
    const cleanProp = propertyName.replace(/[^a-zA-Z0-9_]/g, "");
    const query = `MATCH (n:\`${cleanLabel}\` {\`${cleanProp}\`: $value}) RETURN count(n) > 0 AS nodeExists`;

    const result = await executeQuery(query, { value: propertyValue });
    if (result.success && result.records && result.records.length > 0) {
        const firstRecord = result.records[0];
        return Boolean(firstRecord?.["nodeExists"]);
    }
    return false;
}

/**
 * Guardrail: Validates generated Cypher queries to ensure they do not use raw 'CREATE' statements
 * for nodes or relationships, enforcing idempotent 'MERGE' clauses to prevent duplicate creation.
 * 
 * @param queries - Array of Cypher query strings to check
 */
export function validateDuplicatePreventionGuardrail(queries: string[]): void {
    for (const query of queries) {
        // Look for unconstrained CREATE (e.g., CREATE (n:Label...)) that isn't part of ON CREATE SET
        const rawCreatePattern = /(?<!ON\s+)CREATE\s+\([a-zA-Z0-9_]*\s*:/i;
        if (rawCreatePattern.test(query)) {
            throw new GuardrailError(
                "Duplicate prevention guardrail failed",
                `Query uses raw 'CREATE' instead of idempotent 'MERGE', which can cause duplicate nodes: "${query}"`
            );
        }
    }
}

/**
 * Analyzes conversation context using an LLM, generates Cypher queries representing user memory
 * (preferences, dislikes, current work, tools/technologies, topics, and relationships),
 * validates duplicate-prevention guardrails, and executes the queries in Neo4j database using queryExecutor.
 * 
 * @param context - Optional conversation context (string, RunContext, or message array). Defaults to globalContext.
 * @param userId - Optional identifier for the user node (defaults to "default_user")
 * @returns Result containing extracted entities and Cypher query execution outputs
 */
export async function makeMemory(
    context?: string | RunContext | ChatCompletionMessageParam[],
    userId: string = "default_user"
): Promise<MemoryMakerResult> {
    const formattedContext = normalizeContext(context);

    const systemPrompt = `
You are an expert Knowledge Graph & Memory Extraction agent for an AI Assistant SDK.
Your task is to analyze the conversation context and generate Neo4j Cypher queries that build a rich, persistent, and clean memory graph of the user.

Analyze the context and extract facts stated by or relating to the USER:
1. User Preferences (Likes):
   - What the user likes/prefers -> (:Preference {name, category}) with (:User)-[:LIKES]->(:Preference)
2. User Dislikes:
   - What the user dislikes/avoids -> (:Preference {name, category}) with (:User)-[:DISLIKES]->(:Preference)
3. User Activities & Projects:
   - What the user is working on -> (:Project {name, description}) with (:User)-[:WORKS_ON]->(:Project)
4. Tools & Technologies:
   - What the user is working with -> (:Technology {name, type}) with (:User)-[:WORKS_WITH]->(:Technology)
   - Connect projects to technologies where applicable -> (:Project)-[:USES]->(:Technology)
5. Other relevant topics, people, or concepts mentioned.

======================================================================
DUPLICATE PREVENTION & CANONICAL NAMING RULES:
======================================================================
1. The user's ID is "${userId}". Always match the user node first:
   MERGE (u:User {id: '${userId}'})
2. CANONICAL NAMES: Entity 'name' MUST be a concise, canonical noun phrase in Title Case (e.g., "Vanilla Ice Cream", "Rust", "Kubernetes", "YAML", "Server Deployments", "Analytics Engine").
   - NEVER use long sentence fragments or verbs (e.g. use "Boilerplate YAML", NOT "Writing boilerplate YAML and server deployments").
3. SINGLE PRIMARY LABELS: Always use consistent single base labels for MERGE:
   - (:Preference {name: '...'})
   - (:Technology {name: '...'})
   - (:Project {name: '...'})
   - (:Topic {name: '...'})
   - (:Person {name: '...'})
4. NEVER use raw 'CREATE'. ALWAYS use 'MERGE' on a unique property ({name: ...} or {id: ...}) so existing nodes are matched and updated, not duplicated.
5. Use 'ON CREATE SET' for creation timestamps/types, and 'ON MATCH SET' for update timestamps.
6. FOCUS ON USER STATEMENTS: Extract memories declared by the USER. Do not extract general tools or concepts suggested by the ASSISTANT unless the user explicitly adopted them.
7. If there is no memory or factual knowledge to extract from the context, return an empty queries list.

======================================================================
CONCRETE EXAMPLES:
======================================================================

--- Example 1: User Likes ---
Context: "I really love vanilla ice cream and mint chocolate chip."
Extracted Cypher Queries:
[
  "MERGE (u:User {id: '${userId}'}) MERGE (p:Preference {name: 'Vanilla Ice Cream'}) ON CREATE SET p.category = 'Food & Beverage', p.type = 'Like', p.createdAt = datetime() ON MATCH SET p.updatedAt = datetime() MERGE (u)-[r:LIKES]->(p) ON CREATE SET r.createdAt = datetime()",
  "MERGE (u:User {id: '${userId}'}) MERGE (p:Preference {name: 'Mint Chocolate Chip Ice Cream'}) ON CREATE SET p.category = 'Food & Beverage', p.type = 'Like', p.createdAt = datetime() ON MATCH SET p.updatedAt = datetime() MERGE (u)-[r:LIKES]->(p) ON CREATE SET r.createdAt = datetime()"
]

--- Example 2: User Dislikes ---
Context: "I hate spicy food and doing tax paperwork."
Extracted Cypher Queries:
[
  "MERGE (u:User {id: '${userId}'}) MERGE (p:Preference {name: 'Spicy Food'}) ON CREATE SET p.category = 'Food & Beverage', p.type = 'Dislike', p.createdAt = datetime() ON MATCH SET p.updatedAt = datetime() MERGE (u)-[r:DISLIKES]->(p) ON CREATE SET r.createdAt = datetime()",
  "MERGE (u:User {id: '${userId}'}) MERGE (p:Preference {name: 'Tax Paperwork'}) ON CREATE SET p.category = 'Administrative', p.type = 'Dislike', p.createdAt = datetime() ON MATCH SET p.updatedAt = datetime() MERGE (u)-[r:DISLIKES]->(p) ON CREATE SET r.createdAt = datetime()"
]

--- Example 3: Working On (Projects) and Working With (Technologies) ---
Context: "Currently I am building an E-Commerce Platform using Next.js and PostgreSQL."
Extracted Cypher Queries:
[
  "MERGE (u:User {id: '${userId}'}) MERGE (proj:Project {name: 'E-Commerce Platform'}) ON CREATE SET proj.description = 'Online e-commerce platform', proj.createdAt = datetime() ON MATCH SET proj.updatedAt = datetime() MERGE (u)-[r:WORKS_ON]->(proj) ON CREATE SET r.createdAt = datetime()",
  "MERGE (u:User {id: '${userId}'}) MERGE (t:Technology {name: 'Next.js'}) ON CREATE SET t.type = 'Framework', t.createdAt = datetime() ON MATCH SET t.updatedAt = datetime() MERGE (u)-[r:WORKS_WITH]->(t) ON CREATE SET r.createdAt = datetime()",
  "MERGE (u:User {id: '${userId}'}) MERGE (t:Technology {name: 'PostgreSQL'}) ON CREATE SET t.type = 'Database', t.createdAt = datetime() ON MATCH SET t.updatedAt = datetime() MERGE (u)-[r:WORKS_WITH]->(t) ON CREATE SET r.createdAt = datetime()",
  "MERGE (proj:Project {name: 'E-Commerce Platform'}) MERGE (t1:Technology {name: 'Next.js'}) MERGE (t2:Technology {name: 'PostgreSQL'}) MERGE (proj)-[:USES]->(t1) MERGE (proj)-[:USES]->(t2)"
]
`;

    try {
        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Context to extract memory from:\n\n${formattedContext}` }
            ],
            response_format: zodResponseFormat(MemoryExtractionSchema, "memory_extraction")
        });

        const rawContent = response.choices[0]?.message?.content;
        if (!rawContent) {
            throw new Error("Failed to receive structured memory output from LLM");
        }

        const extracted: MemoryExtraction = JSON.parse(rawContent);

        // Guardrail: Validate that all queries adhere to duplicate prevention rules
        validateDuplicatePreventionGuardrail(extracted.queries);

        // Execute all generated Cypher queries on Neo4j
        const queryResults = await executeQueries(extracted.queries);

        return {
            success: queryResults.every(r => r.success),
            extracted,
            queryResults
        };
    } catch (error) {
        return {
            success: false,
            extracted: { entities: [], queries: [] },
            queryResults: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export default makeMemory;

// make a function which takes the context as the input and makes an LLM call 
// and this call should contain the cypher queries to make nodes of the likings
// ans dislikings of the user this nodes should should also be of whatever user 
// tells and is working on or working with then there should also be cypher
// queries for the relations of the nodes. then this queries would be executed 
// by the queryExecutor function.