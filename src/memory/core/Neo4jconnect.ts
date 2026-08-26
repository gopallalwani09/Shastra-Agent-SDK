import neo4j, { type Driver } from "neo4j-driver";
import "dotenv/config";

// Read Neo4j connection details from environment variables
const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
const username = process.env.NEO4J_USERNAME || "neo4j";
const password = process.env.NEO4J_PASSWORD || "";

// Create and export the Neo4j driver instance
export const driver: Driver = neo4j.driver(
    uri,
    neo4j.auth.basic(username, password)
);

/**
 * Helper function to verify the connection to the Neo4j database.
 */
export async function verifyConnection(): Promise<boolean> {
    try {
        const serverInfo = await driver.getServerInfo();
        console.log(`Successfully connected to Neo4j at ${serverInfo.address}`);
        return true;
    } catch (error) {
        console.error("Failed to connect to Neo4j database:", error);
        return false;
    }
}

/**
 * Helper function to close the Neo4j driver connection.
 */
export async function closeDriver(): Promise<void> {
    await driver.close();
}

export default driver;