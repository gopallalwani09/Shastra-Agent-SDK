import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import "dotenv/config";
import { executeQuery, type QueryExecutionResult } from "../core/queryExecutor.js";
import { isNeo4jInitialized } from "../core/Neo4jconnect.js";
import { isGraphUpdaterRunning, getActiveUserId } from "./graphUpdater.js";

const openai = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL
});

/**
 * Zod schema for structured context retrieval query generation
 */
export const ContextRetrievalSchema = z.object({
    queries: z.array(z.string()).describe("List of READ-ONLY Cypher queries using MATCH and RETURN (never CREATE, MERGE, SET, or DELETE) to fetch relevant nodes and relationships for the user"),
    relevantTopics: z.array(z.string()).describe("Keywords, topics, or entity concepts identified in the user query")
});

export type ContextRetrieval = z.infer<typeof ContextRetrievalSchema>;

// Manual toggle if needed
let manualGraphDbEnabled: boolean | null = null;

/**
 * Checks if GraphDB is currently being used in the application.
 * Returns true if the background graph updater is running, Neo4j driver is active,
 * or if manually enabled.
 */
export function isUsingGraphDb(): boolean {
    if (manualGraphDbEnabled !== null) {
        return manualGraphDbEnabled;
    }
    return isGraphUpdaterRunning() || isNeo4jInitialized();
}

/**
 * Manually enables or disables GraphDB usage check.
 *
 * @param enabled - boolean or null to revert to automatic detection
 */
export function setGraphDbEnabled(enabled: boolean | null): void {
    manualGraphDbEnabled = enabled;
}

/**
 * Validates that generated Cypher queries are strictly read-only.
 * Prevents write or destructive statements.
 */
function validateReadOnlyQuery(query: string): boolean {
    const writeKeywords = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|ALTER)\b/i;
    return !writeKeywords.test(query);
}

/**
 * Formats raw Neo4j record rows into a concise, readable context string for LLMs.
 */
function formatGraphRecords(records: Record<string, unknown>[]): string {
    if (!records || records.length === 0) {
        return "";
    }

    const formattedLines = new Set<string>();

    for (const record of records) {
        const relationship = record["relationship"] as string | undefined;
        const name = record["name"] as string | undefined;
        const labels = record["labels"] as string[] | string | undefined;
        const category = record["category"] as string | undefined;
        const type = record["type"] as string | undefined;
        const description = record["description"] as string | undefined;

        const labelStr = Array.isArray(labels) ? labels.filter(l => l !== "User").join(", ") : (labels ? String(labels) : "");

        if (name && relationship) {
            let details = "";
            if (category) details += ` [Category: ${category}]`;
            if (type) details += ` [Type: ${type}]`;
            if (description) details += ` [Description: ${description}]`;
            if (labelStr && !details) details += ` [${labelStr}]`;

            formattedLines.add(`- ${relationship}: ${name}${details}`);
        } else if (name) {
            let line = `- ${name}`;
            if (labelStr) line += ` (${labelStr})`;
            if (description) line += `: ${description}`;
            formattedLines.add(line);
        } else {
            // Generic property dump if no standard name field
            const parts: string[] = [];
            for (const [k, v] of Object.entries(record)) {
                if (v !== null && v !== undefined && k !== "u") {
                    parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
                }
            }
            if (parts.length > 0) {
                formattedLines.add(`- ${parts.join(", ")}`);
            }
        }
    }

    return Array.from(formattedLines).join("\n");
}

/**
 * Analyzes the user's incoming query, generates targeted read-only Cypher queries,
 * executes them against the Neo4j knowledge graph, and formats the result into a clean
 * `queryContext` string for the main LLM call.
 *
 * @param query - The user's prompt or message
 * @param userId - Optional user ID (defaults to active user ID or "default_user")
 * @returns Promise<string> formatted context from GraphDB (empty string if no context found or not using graphdb)
 */
export async function makeQueryContext(
    query: string,
    userId?: string
): Promise<string> {
    if (!isUsingGraphDb()) {
        return "";
    }

    const effectiveUserId = userId || getActiveUserId() || "default_user";

    const systemPrompt = `
You are an expert GraphDB Context Retrieval planner for an AI Assistant SDK.
Your task is to analyze the user's input query and generate targeted READ-ONLY Cypher queries to fetch relevant knowledge from the Neo4j user memory graph.

Neo4j Knowledge Graph Schema:
- User Node: (:User {id: $userId})
- Preference Node: (:Preference {name: string, category: string, type: 'Like' | 'Dislike'})
- Technology Node: (:Technology {name: string, type: string})
- Project Node: (:Project {name: string, description: string})
- Topic Node: (:Topic {name: string})
- Person Node: (:Person {name: string})

Relationships:
- (:User)-[:LIKES]->(:Preference)
- (:User)-[:DISLIKES]->(:Preference)
- (:User)-[:WORKS_ON]->(:Project)
- (:User)-[:WORKS_WITH]->(:Technology)
- (:Project)-[:USES]->(:Technology)
- (:User)-[:INTERESTED_IN]->(:Topic)
- (:User)-[:KNOWS]->(:Person)
- (:User)-[:RELATED_TO]->(...)

Guidelines:
1. Generate READ-ONLY MATCH queries using $userId as parameter (e.g. MATCH (u:User {id: $userId})-[r]->(n) ...).
2. NEVER generate write queries (no CREATE, MERGE, SET, DELETE, REMOVE, DROP).
3. DO NOT use specific inline property matching like '{category: "coffee"}' unless you are matching by ID/name exactly. Instead, match nodes by label and relationship (e.g. 'MATCH (u:User {id: $userId})-[r:LIKES]->(p:Preference) RETURN type(r) as relationship, p.name as name, p.category as category'), or filter using 'WHERE toLower(p.name) CONTAINS "..."' or 'WHERE toLower(p.category) CONTAINS "..."'.
4. If the query asks about preferences, likes, dislikes, projects, technologies, or past background, generate broad MATCH queries for those relationship types to retrieve the full list of entries, then let the system filter.
5. ALWAYS generate a general fallback query to fetch the user's main nodes and relationships (up to 25 items) to guarantee that context is retrieved even if specific queries fail:
   "MATCH (u:User {id: $userId})-[r]->(n) RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name, properties(n) AS properties LIMIT 25"
6. If the user query is purely trivial or completely unrelated to any personal memory or graph knowledge (e.g. simple math, generic greetings without context), you may return an empty queries list.
`;

    try {
        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `User ID: "${effectiveUserId}"\nUser Query: "${query}"` }
            ],
            response_format: zodResponseFormat(ContextRetrievalSchema, "context_retrieval")
        });

        const rawContent = response.choices[0]?.message?.content;
        if (!rawContent) {
            return "";
        }

        const parsed: ContextRetrieval = JSON.parse(rawContent);

        if (!parsed.queries || parsed.queries.length === 0) {
            return "";
        }

        const allRecords: Record<string, unknown>[] = [];

        for (const cypher of parsed.queries) {
            const trimmed = cypher.trim();
            if (!trimmed || !validateReadOnlyQuery(trimmed)) {
                continue;
            }

            const result: QueryExecutionResult = await executeQuery(trimmed, { userId: effectiveUserId });
            if (result.success && result.records && result.records.length > 0) {
                allRecords.push(...result.records);
            }
        }

        if (allRecords.length === 0) {
            return "";
        }

        const formattedContext = formatGraphRecords(allRecords);
        return formattedContext;
    } catch (error) {
        console.warn("[ContextMaker] Could not retrieve graph context for query:", error);
        return "";
    }
}

/**
 * Alias for makeQueryContext.
 */
export const getQueryContext = makeQueryContext;

export default makeQueryContext;