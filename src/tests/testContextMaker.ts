import {
    ShastraBuilder,
    Runner,
    globalContext,
    resetGlobalContext,
    initNeo4j,
    verifyConnection,
    closeDriver,
    executeQuery,
    startGraphMemory,
    stopGraphMemory,
    isGraphUpdaterRunning,
    isUsingGraphDb,
    setGraphDbEnabled,
    makeQueryContext,
    type Neo4jCredentials
} from "../index.js";
import "dotenv/config";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testContextMaker() {
    console.log("===============================================================");
    console.log("🚀 TESTING GRAPHDB QUERY CONTEXT RETRIEVAL (CONTEXTMAKER)");
    console.log("===============================================================\n");

    // 1. Test isUsingGraphDb when GraphDB is NOT initialized
    console.log("=== 1. Testing Detection when GraphDB is NOT active ===");
    setGraphDbEnabled(null);
    console.log("isUsingGraphDb() initially:", isUsingGraphDb(), "(Expected: false)");
    
    const uninitializedContext = await makeQueryContext("What are my favorite technologies?");
    console.log("makeQueryContext when GraphDB inactive:", JSON.stringify(uninitializedContext), '(Expected: "")');

    // 2. Setup Neo4j credentials
    const credentials: Neo4jCredentials = {
        uri: process.env.NEO4J_URI || "bolt://localhost:7687",
        username: process.env.NEO4J_USERNAME || "neo4j",
        password: process.env.NEO4J_PASSWORD || ""
    };

    console.log("\n=== 2. Connecting to Neo4j Database ===");
    initNeo4j(credentials);
    const isConnected = await verifyConnection();
    console.log("Connected to Neo4j:", isConnected ? "✅ Yes" : "❌ No");
    console.log("isUsingGraphDb() after initNeo4j:", isUsingGraphDb(), "(Expected: true)");

    const userId = "ctx_user_emma";

    if (isConnected) {
        // 3. Seed some test nodes for this user directly in Neo4j
        console.log("\n=== 3. Seeding Test Memory Graph for User:", userId, "===");
        const seedQueries = [
            `MERGE (u:User {id: '${userId}'}) 
             MERGE (p:Preference {name: 'Ethiopian Dark Roast Coffee'}) 
             ON CREATE SET p.category = 'Beverage', p.type = 'Like' 
             MERGE (u)-[:LIKES]->(p)`,
            `MERGE (u:User {id: '${userId}'}) 
             MERGE (p:Preference {name: 'Legacy PHP Monoliths'}) 
             ON CREATE SET p.category = 'Software', p.type = 'Dislike' 
             MERGE (u)-[:DISLIKES]->(p)`,
            `MERGE (u:User {id: '${userId}'}) 
             MERGE (proj:Project {name: 'Cloud Microservices Migration'}) 
             ON CREATE SET proj.description = 'Migrating legacy services to Kubernetes and Go' 
             MERGE (u)-[:WORKS_ON]->(proj)`,
            `MERGE (u:User {id: '${userId}'}) 
             MERGE (t:Technology {name: 'Golang'}) 
             ON CREATE SET t.type = 'Programming Language' 
             MERGE (u)-[:WORKS_WITH]->(t)`
        ];

        for (const query of seedQueries) {
            await executeQuery(query);
        }
        console.log("✅ Seed data inserted into Neo4j.");

        // 4. Test makeQueryContext directly
        console.log("\n=== 4. Direct Test of makeQueryContext() ===");
        const testQuery1 = "What kind of coffee do I enjoy and what project am I working on?";
        console.log(`Query: "${testQuery1}"`);
        const retrievedContext = await makeQueryContext(testQuery1, userId);
        console.log("\nRetrieved Graph Context from Neo4j:\n" + (retrievedContext || "(None)"));

        // 5. Test Runner with graph context retrieval
        console.log("\n=== 5. Testing Runner.run() with GraphDB Context Injection ===");
        resetGlobalContext();

        // Start background memory updater with the test user ID
        startGraphMemory({
            credentials,
            userId,
            intervalMs: 5000
        });

        const agent = new ShastraBuilder()
            .name("memory_aware_assistant")
            .description("Personal developer assistant")
            .instructions("You are a helpful assistant. Use any retrieved knowledge graph context to answer questions about the user's background, preferences, and projects accurately and concisely.")
            .build();

        const runner = new Runner();

        const prompt = "Can you remind me what coffee I prefer and what current project I am working on?";
        console.log(`💬 User: "${prompt}"`);
        const reply = await runner.run(agent, prompt);
        console.log(`🤖 Assistant Reply: "${reply}"`);

        // 6. Verify globalContext.messages purity (no graph context merged/appended)
        console.log("\n=== 6. Verifying globalContext.messages Purity ===");
        console.log(`Total messages in globalContext: ${globalContext.messages.length}`);
        globalContext.messages.forEach((msg, i) => {
            const preview = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            console.log(`  [${i + 1}] (${msg.role}): ${preview.substring(0, 100)}...`);
        });

        const contextLeaked = globalContext.messages.some(msg => 
            typeof msg.content === "string" && msg.content.includes("Relevant Knowledge Graph Context")
        );
        console.log("Graph context leaked into globalContext.messages:", contextLeaked ? "❌ LEAK DETECTED" : "✅ NO (Strictly isolated)");

        // // 7. Cleanup seeded test data
        // console.log("\n=== 7. Cleaning up test data from Neo4j ===");
        // await executeQuery(`MATCH (u:User {id: $userId}) DETACH DELETE u`, { userId });
        // console.log("✅ Test user data cleaned up.");
    }

    // 8. Stop background updater and close driver
    console.log("\n=== 8. Teardown ===");
    await stopGraphMemory(true);
    console.log("isGraphUpdaterRunning():", isGraphUpdaterRunning(), "(Expected: false)");
    console.log("\n🎉 ContextMaker test suite completed successfully!");
}

testContextMaker().catch(async (error) => {
    console.error("❌ Test failed:", error);
    await stopGraphMemory(true);
    await closeDriver();
});
