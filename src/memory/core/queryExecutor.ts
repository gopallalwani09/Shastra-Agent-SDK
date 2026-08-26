import neo4j from "neo4j-driver";
import { z } from "zod";
import type { ITool } from "../../types/Tool.js";
import driver from "./Neo4jconnect.js";

/**
 * Zod schema for Cypher query execution input
 */
export const QueryExecutorInputSchema = z.object({
    query: z.string().describe("The Cypher query to execute on the Neo4j database"),
    params: z.record(z.string(), z.any()).optional().describe("Optional parameters for the Cypher query")
});

export type QueryExecutorInput = z.infer<typeof QueryExecutorInputSchema>;

/**
 * Result structure returned by query execution
 */
export interface QueryExecutionResult {
    success: boolean;
    records?: Record<string, unknown>[];
    summary?: {
        nodesCreated: number;
        nodesDeleted: number;
        relationshipsCreated: number;
        relationshipsDeleted: number;
        propertiesSet: number;
        labelsAdded: number;
    };
    error?: string;
}

/**
 * Recursively converts Neo4j driver types (integers, nodes, structures) to plain JS values
 */
function formatNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (neo4j.isInt(value)) {
        return value.inSafeRange() ? value.toNumber() : value.toString();
    }
    if (Array.isArray(value)) {
        return value.map(formatNeo4jValue);
    }
    if (typeof value === "object") {
        const recordObj = value as Record<string, unknown>;
        // Handle Neo4j Node / Relationship structures with properties
        if ("properties" in recordObj && typeof recordObj.properties === "object" && recordObj.properties !== null) {
            return formatNeo4jValue(recordObj.properties);
        }
        const formatted: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(recordObj)) {
            formatted[k] = formatNeo4jValue(v);
        }
        return formatted;
    }
    return value;
}

/**
 * Executes a single Cypher query on the Neo4j database.
 * 
 * @param query - The Cypher query string
 * @param params - Optional parameter mapping for the query
 * @returns QueryExecutionResult containing records and execution summary
 */
export async function executeQuery(
    query: string,
    params: Record<string, unknown> = {}
): Promise<QueryExecutionResult> {
    const session = driver.session();
    try {
        const result = await session.run(query, params);
        
        const records = result.records.map(record => {
            const formattedRecord: Record<string, unknown> = {};
            record.keys.forEach(key => {
                const val = record.get(key);
                formattedRecord[String(key)] = formatNeo4jValue(val);
            });
            return formattedRecord;
        });

        const updates = result.summary.counters.updates();

        return {
            success: true,
            records,
            summary: {
                nodesCreated: updates.nodesCreated,
                nodesDeleted: updates.nodesDeleted,
                relationshipsCreated: updates.relationshipsCreated,
                relationshipsDeleted: updates.relationshipsDeleted,
                propertiesSet: updates.propertiesSet,
                labelsAdded: updates.labelsAdded
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    } finally {
        await session.close();
    }
}

/**
 * Executes an array of Cypher queries sequentially.
 * 
 * @param queries - Array of Cypher query strings
 * @returns Array of QueryExecutionResult for each query
 */
export async function executeQueries(
    queries: string[]
): Promise<QueryExecutionResult[]> {
    const results: QueryExecutionResult[] = [];
    for (const query of queries) {
        const trimmed = query.trim();
        if (trimmed) {
            const result = await executeQuery(trimmed);
            results.push(result);
        }
    }
    return results;
}

/**
 * Tool for agents to execute Cypher queries on Neo4j
 */
export const queryExecutorTool: ITool<QueryExecutorInput, QueryExecutionResult> = {
    name: "execute_cypher_query",
    description: "Executes a Cypher query on the Neo4j graph database to create, update, or retrieve nodes and relationships.",
    doc: "execute_cypher_query({ query: string, params?: Record<string, any> }): Promise<QueryExecutionResult>",
    inputSchema: QueryExecutorInputSchema,
    executor: async ({ query, params }) => {
        return executeQuery(query, params || {});
    }
};

export default queryExecutorTool;

// here I want a tool which can run any cypher query, like the function will take the cyper queries and run them on the neo4j db to make the nodes and their relations and this function will take the db instance from neo4jconnect.ts