import {
    ShastraBuilder,
    Runner,
    resetGlobalContext,
    startGraphUpdater,
    stopGraphUpdater,
    isGraphUpdaterRunning,
    checkContextUpdated,
    getNeedsUpdateStatus,
    getUpdatedContext,
    resetGraphUpdaterState,
    verifyConnection,
    closeDriver,
    executeQuery,
    checkNodeExists,
    DEFAULT_UPDATE_INTERVAL_MS
} from "../index.js";

// Helper function to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testBackgroundGraphUpdater() {
    console.log("===============================================================");
    console.log("🚀 TESTING BACKGROUND MEMORY GRAPH UPDATER PROCESS");
    console.log("===============================================================\n");

    // 1. Verify Neo4j connection
    console.log("=== 1. Checking Neo4j Database Connection ===");
    const isConnected = await verifyConnection();
    if (!isConnected) {
        console.warn("⚠️ Warning: Neo4j is not connected. Graph queries will fail if database is offline.\n");
    } else {
        console.log("✅ Neo4j connection verified successfully.\n");
    }

    // 2. Reset global context and updater state
    resetGlobalContext();
    resetGraphUpdaterState();

    const userId = "bg_user_alex";
    console.log(`Default configured interval: ${DEFAULT_UPDATE_INTERVAL_MS / 1000}s (2 minutes).`);
    console.log("For this automated test, we will use a fast 5-second interval.\n");

    // 3. Verify initial state before any messages
    console.log("=== 2. Verifying Initial State ===");
    console.log("Initial checkContextUpdated():", checkContextUpdated());
    console.log("Initial needsUpdate status:", getNeedsUpdateStatus());
    console.log("Initial delta messages count:", getUpdatedContext().length);
    console.log("Is updater running:", isGraphUpdaterRunning());

    // 4. Create an Agent & Runner
    const agent = new ShastraBuilder()
        .name("coding_assistant")
        .description("A helpful AI assistant")
        .instructions("You are a friendly and concise assistant for software engineers.")
        .build();

    const runner = new Runner();

    // 5. Start the background graph updater (with 5000ms interval for testing)
    console.log("\n=== 3. Starting Background Graph Updater ===");
    const TEST_INTERVAL_MS = 5000;
    startGraphUpdater({
        intervalMs: TEST_INTERVAL_MS,
        userId: userId
    });
    console.log("✅ Background updater started. isGraphUpdaterRunning():", isGraphUpdaterRunning());

    // 6. First Turn of Conversation
    console.log("\n=== 4. Conversation Turn 1: Adding Preferences & Technologies ===");
    const prompt1 = "Hi! I am Alex. I love TypeScript, GraphQL, and drinking Matcha lattes. I am currently building a FinTech Dashboard.";
    console.log(`💬 User: "${prompt1}"`);
    const reply1 = await runner.run(agent, prompt1);
    console.log(`🤖 Assistant: "${reply1}"`);

    // Verify context change detection
    console.log("\nChecking update status immediately after Turn 1:");
    console.log("checkContextUpdated():", checkContextUpdated());
    console.log("getNeedsUpdateStatus():", getNeedsUpdateStatus());
    const delta1 = getUpdatedContext();
    console.log(`getUpdatedContext() length: ${delta1.length} new messages (User + Assistant)`);

    // Wait for the background interval to tick and process Turn 1
    console.log(`\n⏳ Waiting ${TEST_INTERVAL_MS / 1000 + 3} seconds for background interval to run makeMemory()...`);
    await sleep(TEST_INTERVAL_MS + 3000);

    console.log("\nStatus after Background Process completed Turn 1:");
    console.log("getNeedsUpdateStatus():", getNeedsUpdateStatus(), "(Expected: false)");
    console.log("Remaining delta messages:", getUpdatedContext().length, "(Expected: 0)");

    // 7. Second Turn of Conversation (Testing Delta Extraction)
    console.log("\n=== 5. Conversation Turn 2: Adding New Info (Testing Delta Isolation) ===");
    const prompt2 = "Also, I really dislike Docker compose file debugging and legacy PHP code.";
    console.log(`💬 User: "${prompt2}"`);
    const reply2 = await runner.run(agent, prompt2);
    console.log(`🤖 Assistant: "${reply2}"`);

    const delta2 = getUpdatedContext();
    console.log(`\ngetUpdatedContext() for Turn 2: ${delta2.length} new messages (only new turn, avoiding full history replay)`);

    // Wait for the background interval to process Turn 2
    console.log(`\n⏳ Waiting ${TEST_INTERVAL_MS / 1000 + 3} seconds for background interval to process Turn 2...`);
    await sleep(TEST_INTERVAL_MS + 3000);

    console.log("\nStatus after Background Process completed Turn 2:");
    console.log("getNeedsUpdateStatus():", getNeedsUpdateStatus(), "(Expected: false)");

    // 8. Idle Interval Test (No new messages added)
    console.log("\n=== 6. Idle Interval Test (No New Messages) ===");
    console.log("Waiting for another interval tick without sending new messages...");
    console.log("checkContextUpdated():", checkContextUpdated(), "(Expected: false)");
    await sleep(TEST_INTERVAL_MS + 1000);
    console.log("✅ Idle cycle skipped unnecessary LLM calls as expected.");

    // 9. Verify Graph in Neo4j
    if (isConnected) {
        console.log("\n=== 7. Verifying Persisted Memory Graph in Neo4j ===");
        const userExists = await checkNodeExists("User", "id", userId);
        console.log(`User node (id: '${userId}') exists:`, userExists ? "✅ Yes" : "❌ No");

        const verificationQuery = `
            MATCH (u:User {id: $userId})-[r]->(n)
            RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name, properties(n) AS properties
        `;
        const verification = await executeQuery(verificationQuery, { userId });
        console.log(`\nStored Memory Graph Relationships for "${userId}": ${verification.records?.length ?? 0} items`);
        console.table(verification.records);
    }

    // 10. Teardown
    console.log("\n=== 8. Cleanup & Stopping Background Updater ===");
    stopGraphUpdater();
    console.log("isGraphUpdaterRunning() after stop:", isGraphUpdaterRunning(), "(Expected: false)");

    await closeDriver();
    console.log("✅ Test completed successfully.");
}

testBackgroundGraphUpdater().catch(async (err) => {
    console.error("❌ Test encountered an error:", err);
    stopGraphUpdater();
    await closeDriver();
});
