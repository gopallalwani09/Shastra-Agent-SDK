import {
    makeMemory,
    verifyConnection,
    closeDriver,
    executeQuery,
    checkNodeExists
} from "../index.js";

async function testMemoryMaker() {
    console.log("=== 1. Verifying Neo4j Database Connection ===");
    const isConnected = await verifyConnection();
    if (!isConnected) {
        console.warn("⚠️ Warning: Could not connect to Neo4j database. Check your .env configuration.");
    }

    console.log("\n=== 2. Running Memory Maker on Sample Context ===");
    const sampleContext = `
    User: Hi! My name is Alex. I am a software engineer.
    Assistant: Nice to meet you Alex! What are you working on these days?
    User: I am building an Intelligent Agent Framework called Shastra using TypeScript, Node.js, and Neo4j.
    Assistant: That sounds exciting! How is your day going?
    User: Good! I had some vanilla ice cream earlier which I absolutely love. But I really dislike dark chocolate and bitter drinks.
    `;

    console.log("Context:\n", sampleContext.trim());
    console.log("\nExtracting memory and generating Cypher queries...");

    const memoryResult = await makeMemory(sampleContext, "alex_01");

    console.log("\n=== 3. Memory Extraction Results ===");
    console.log("Success:", memoryResult);
    console.log("\nExtracted Entities:", JSON.stringify(memoryResult.extracted.entities, null, 2));
    console.log("\nGenerated Cypher Queries:", JSON.stringify(memoryResult.extracted.queries, null, 2));
    console.log("\nQuery Execution Results:", JSON.stringify(memoryResult.queryResults, null, 2));

    if (isConnected) {
        console.log("\n=== 4. Verifying Graph in Neo4j ===");
        
        // Check if user node exists
        const userExists = await checkNodeExists("User", "id", "alex_01");
        console.log("User node (id: 'alex_01') exists in Neo4j:", userExists);

        // Fetch nodes and relationships connected to the user
        const query = `
            MATCH (u:User {id: 'alex_01'})-[r]->(n)
            RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name, properties(n) AS properties
        `;
        const verification = await executeQuery(query);
        console.log("\nStored Relationships for alex_01 in Neo4j:");
        console.table(verification.records);
    }

    console.log("\n=== 5. Cleaning up and Closing Connection ===");
    await closeDriver();
    console.log("Test completed.");
}

testMemoryMaker().catch(async (error) => {
    console.error("Test failed with error:", error);
    await closeDriver();
});
