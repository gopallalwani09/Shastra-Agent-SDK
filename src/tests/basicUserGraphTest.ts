import {
    ShastraBuilder,
    Runner,
    resetGlobalContext,
    startGraphMemory,
    stopGraphMemory,
    isGraphUpdaterRunning,
    checkContextUpdated,
    getNeedsUpdateStatus,
    getUpdatedContext,
    resetGraphUpdaterState,
    verifyConnection,
    executeQuery,
    checkNodeExists,
    type Neo4jCredentials
} from "../index.js";
import "dotenv/config";

// Helper function to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBasicUserGraphTest() {
    console.log("===============================================================");
    console.log("🚀 USER GRAPH MEMORY: CREDENTIALS & LIFECYCLE TEST");
    console.log("===============================================================\n");

    // 1. User provides their Neo4j credentials (custom object or loaded from config/env)
    const userCredentials: Neo4jCredentials = {
        uri: process.env.NEO4J_URI || "bolt://localhost:7687",
        username: process.env.NEO4J_USERNAME || "neo4j",
        password: process.env.NEO4J_PASSWORD || ""
    };

    console.log("=== 1. User Credentials Configured ===");
    console.log(`URI: ${userCredentials.uri}`);
    console.log(`Username: ${userCredentials.username}`);
    console.log(`Password: ${userCredentials.password ? "******" : "(empty)"}\n`);

    // Reset state before starting
    resetGlobalContext();
    resetGraphUpdaterState();

    const userId = "dev_user_sarah";
    const TEST_INTERVAL_MS = 4000; // 4 seconds for test validation

    // 2. Start the Graph Memory background updater with user credentials
    console.log("=== 2. Starting Graph Memory Updater with User Credentials ===");
    startGraphMemory({
        credentials: userCredentials,
        intervalMs: TEST_INTERVAL_MS,
        userId: userId,
        verifyOnStart: true
    });

    console.log("Is Graph Memory Updater running:", isGraphUpdaterRunning(), "(Expected: true)\n");

    // 3. Create Agent and Runner
    const agent = new ShastraBuilder()
        .name("developer_assistant")
        .description("Personal AI developer assistant")
        .instructions("You are a helpful and concise assistant.")
        .build();

    const runner = new Runner();

    // 4. Conversation Turn 1
    console.log("=== 3. Conversation Turn 1: User shares projects and preferences ===");
    const prompt1 = "Hello! I am Sarah. I love Rust and Kubernetes, and I am building a real-time analytics engine.";
    console.log(`💬 User: "${prompt1}"`);
    const reply1 = await runner.run(agent, prompt1);
    console.log(`🤖 Assistant: "${reply1}"`);

    console.log("\nContext status after Turn 1:");
    console.log("checkContextUpdated():", checkContextUpdated());
    console.log("getNeedsUpdateStatus():", getNeedsUpdateStatus());
    console.log(`Delta messages in queue: ${getUpdatedContext().length}`);

    // Wait for the background process to update Neo4j
    console.log(`\n⏳ Waiting ${TEST_INTERVAL_MS / 1000 + 3}s for background memory graph sync...`);
    await sleep(TEST_INTERVAL_MS + 3000);

    console.log("Status after background update:");
    console.log("getNeedsUpdateStatus():", getNeedsUpdateStatus(), "(Expected: false)");
    console.log("Remaining delta messages:", getUpdatedContext().length, "(Expected: 0)\n");

    // 5. Conversation Turn 2 (Delta extraction test)
    console.log("=== 4. Conversation Turn 2: User shares dislikes ===");
    const prompt2 = "I really hate writing boilerplate YAML and manual server deployments.";
    console.log(`💬 User: "${prompt2}"`);
    const reply2 = await runner.run(agent, prompt2);
    console.log(`🤖 Assistant: "${reply2}"`);

    console.log(`\nDelta messages for Turn 2: ${getUpdatedContext().length}`);
    console.log(`⏳ Waiting ${TEST_INTERVAL_MS / 1000 + 3}s for second background sync...`);
    await sleep(TEST_INTERVAL_MS + 3000);

    // 6. Verify Graph in Neo4j database
    console.log("\n=== 5. Verifying Memory Graph in Neo4j ===");
    const isConnected = await verifyConnection();
    if (isConnected) {
        const userExists = await checkNodeExists("User", "id", userId);
        console.log(`User node (id: '${userId}') exists:`, userExists ? "✅ Yes" : "❌ No");

        const query = `
            MATCH (u:User {id: $userId})-[r]->(n)
            RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name
        `;
        const res = await executeQuery(query, { userId });
        console.log(`\nExtracted Entities & Relationships for "${userId}":`);
        console.table(res.records);
    } else {
        console.log("⚠️ Neo4j offline or unreachable. Skipping database record readout.");
    }

    // 7. Stop Graph Memory Updater
    console.log("\n=== 6. Stopping Graph Memory Updater ===");
    await stopGraphMemory(true); // Stop timer and close database connection
    console.log("Is Graph Memory Updater running:", isGraphUpdaterRunning(), "(Expected: false)");
    console.log("\n✅ User Graph Memory Lifecycle Test Completed Successfully!");
}

runBasicUserGraphTest().catch(async (error) => {
    console.error("❌ Test failed:", error);
    await stopGraphMemory(true);
});
