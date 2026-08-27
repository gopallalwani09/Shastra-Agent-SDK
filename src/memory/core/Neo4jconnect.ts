import neo4j, { type Driver } from "neo4j-driver";
import "dotenv/config";

/**
 * Credentials structure for Neo4j database connection
 */
export interface Neo4jCredentials {
    uri?: string;
    username?: string;
    password?: string;
    database?: string;
}

let activeDriver: Driver | null = null;

/**
 * Initializes or re-initializes the active Neo4j driver with the provided credentials.
 * Falls back to environment variables (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD) if not provided.
 *
 * @param credentials - Optional Neo4j connection credentials
 * @returns The initialized Neo4j Driver instance
 */
export function initNeo4j(credentials?: Neo4jCredentials): Driver {
    const uri = credentials?.uri || process.env.NEO4J_URI || "bolt://localhost:7687";
    const username = credentials?.username || process.env.NEO4J_USERNAME || "neo4j";
    const password = credentials?.password || process.env.NEO4J_PASSWORD || "";

    if (activeDriver) {
        try {
            activeDriver.close();
        } catch {
            // Ignore close errors on re-initialization
        }
    }

    activeDriver = neo4j.driver(
        uri,
        neo4j.auth.basic(username, password)
    );

    return activeDriver;
}

/**
 * Returns the currently active Neo4j driver instance.
 * If no driver has been explicitly initialized, initializes one with default/env credentials.
 *
 * @returns Neo4j Driver instance
 */
export function getDriver(): Driver {
    if (!activeDriver) {
        activeDriver = initNeo4j();
    }
    return activeDriver;
}

/**
 * Helper function to verify the connection to the Neo4j database.
 *
 * @param target - Optional credentials or Driver instance to verify
 * @returns Promise<boolean> indicating whether the connection succeeded
 */
export async function verifyConnection(target?: Neo4jCredentials | Driver): Promise<boolean> {
    let targetDriver: Driver;

    if (target && "getServerInfo" in target) {
        targetDriver = target as Driver;
    } else if (target) {
        targetDriver = initNeo4j(target as Neo4jCredentials);
    } else {
        targetDriver = getDriver();
    }

    try {
        const serverInfo = await targetDriver.getServerInfo();
        console.log(`[Neo4j] Successfully connected to Neo4j at ${serverInfo.address}`);
        return true;
    } catch (error) {
        console.error("[Neo4j] Failed to connect to Neo4j database:", error);
        return false;
    }
}

/**
 * Helper function to close the active Neo4j driver connection.
 */
export async function closeDriver(): Promise<void> {
    if (activeDriver) {
        await activeDriver.close();
        activeDriver = null;
        console.log("[Neo4j] Neo4j connection closed.");
    }
}

/**
 * Ensures unique constraints exist in Neo4j database to strictly prevent duplicate nodes.
 */
export async function ensureGraphConstraints(): Promise<void> {
    const constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Technology) REQUIRE t.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Preference) REQUIRE p.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (pr:Project) REQUIRE pr.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (tp:Topic) REQUIRE tp.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (ps:Person) REQUIRE ps.name IS UNIQUE"
    ];

    const currentDriver = getDriver();
    const session = currentDriver.session();
    try {
        for (const query of constraints) {
            try {
                await session.run(query);
            } catch {
                // Ignore if constraint syntax differs across Neo4j versions or unsupported
            }
        }
    } finally {
        await session.close();
    }
}

/**
 * Proxy object for backwards compatibility. Forwards all operations to the active driver.
 */
export const driver: Driver = new Proxy({} as Driver, {
    get(_target, prop, receiver) {
        const currentDriver = getDriver();
        const value = Reflect.get(currentDriver, prop, receiver);
        if (typeof value === "function") {
            return value.bind(currentDriver);
        }
        return value;
    }
});

export default driver;