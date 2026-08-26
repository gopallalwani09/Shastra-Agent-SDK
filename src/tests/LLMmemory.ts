import {
    ShastraBuilder,
    Runner,
    globalContext,
    resetGlobalContext,
    makeMemory,
    verifyConnection,
    closeDriver,
    executeQuery,
    checkNodeExists
} from "../index.js";

async function testLLMMemoryGraph() {
    console.log("===============================================================");
    console.log("🚀 STARTING LLM INBUILT CONTEXT -> MEMORY GRAPH TEST");
    console.log("===============================================================\n");

    // 1. Verify Neo4j Connection
    console.log("=== 1. Checking Neo4j Database Connection ===");
    const isConnected = await verifyConnection();
    if (!isConnected) {
        console.warn("⚠️ Warning: Neo4j is not connected. Queries will fail if database is offline.\n");
    } else {
        console.log("✅ Neo4j connection verified successfully.\n");
    }

    // 2. Reset global context for clean test run
    resetGlobalContext();

    // 3. Define the AI Agent
    const assistantAgent = new ShastraBuilder()
        .name("personal_assistant")
        .description("A helpful, conversational AI developer assistant")
        .instructions(`
            You are a helpful, conversational AI companion and assistant for software engineers.
            Be friendly, attentive, and acknowledge user projects, preferences, and interests.
            Keep your responses concise and natural.
        `)
        .build();
            
    const runner = new Runner();
    const userId = "jordan_dev";

    // 4. Have a multi-turn conversation to populate LLM context
    console.log("=== 2. Starting Multi-turn Conversation with Agent ===");

    const conversationTurns = [
        "Hi! My name is Jordan. I am a backend engineer building a real-time analytics engine in Go, TypeScript, and Neo4j.",
        "I really love strong coffee, clean code, and distributed systems, but I hate unnecessary meetings and poorly documented APIs.",
        "In my spare time, I am also developing an open-source vector search engine using Rust and Python."
    ];

    for (let i = 0; i < conversationTurns.length; i++) {
        const userPrompt = conversationTurns[i]!;
        console.log(`\n💬 [Turn ${i + 1}] User: "${userPrompt}"`);
        const agentReply = await runner.run(assistantAgent, userPrompt);
        console.log(`🤖 [Turn ${i + 1}] Assistant: "${agentReply}"`);
    }

    // 5. Generate Memory Graph directly using inbuilt context
    console.log("\n=== 3. Generating Memory Graph using Inbuilt Context ===");
    console.log(`Generating memory graph for user: "${userId}"...`);

    // makeMemory automatically uses the inbuilt globalContext if no context is provided
    const memoryResult = await makeMemory(globalContext, userId);

    console.log("\n=== 5. Memory Maker Results ===");
    console.log("Success Status:", memoryResult.success ? "✅ SUCCESS" : "❌ FAILED / ERRORS DETECTED");
    if (memoryResult.error) {
        console.error("Encountered Error:", memoryResult.error);
    }

    console.log("\nExtracted Entities:");
    console.dir(memoryResult.extracted.entities, { depth: null });

    console.log("\nGenerated Cypher Queries:");
    memoryResult.extracted.queries.forEach((q, idx) => {
        console.log(`  [Query ${idx + 1}]: ${q}`);
    });

    console.log("\nQuery Execution Results:");
    memoryResult.queryResults.forEach((res, idx) => {
        console.log(`  [Result ${idx + 1}]: success=${res.success} ${res.error ? `| error: ${res.error}` : ""}`);
    });

    // 6. Verify the Knowledge Graph in Neo4j Database (First Run)
    if (isConnected && memoryResult.success) {
        console.log("\n=== 4. Verifying Initial Graph Memory in Neo4j ===");

        const userExists = await checkNodeExists("User", "id", userId);
        console.log(`User node (id: '${userId}') exists in Neo4j:`, userExists ? "✅ Yes" : "❌ No");

        const verificationQuery = `
            MATCH (u:User {id: $userId})-[r]->(n)
            RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name, properties(n) AS properties
        `;
        const verification1 = await executeQuery(verificationQuery, { userId });
        const initialCount = verification1.records?.length ?? 0;
        console.log(`\nStored Memory Graph Relationships for "${userId}" (Run 1): ${initialCount} items`);
        console.table(verification1.records);

        // 7. Test Duplicate Prevention by re-running makeMemory with the SAME context
        console.log("\n===============================================================");
        console.log("🔁 TESTING DUPLICATE PREVENTION (RUN 2 WITH SAME CONTEXT)");
        console.log("===============================================================\n");

        console.log("Running makeMemory() a second time with the exact same context...");
        const memoryResult2 = await makeMemory(globalContext, userId);

        console.log("\nSecond Run Success Status:", memoryResult2.success ? "✅ SUCCESS" : "❌ FAILED");

        const verification2 = await executeQuery(verificationQuery, { userId });
        const secondCount = verification2.records?.length ?? 0;
        console.log(`\nStored Memory Graph Relationships for "${userId}" (Run 2): ${secondCount} items`);
        console.table(verification2.records);

        // Check if duplicate nodes/relationships were created
        console.log("\n=== 5. Duplicate Prevention Verification ===");
        console.log(`Initial Relationship Count: ${initialCount}`);
        console.log(`After 2nd Run Relationship Count: ${secondCount}`);

        if (initialCount === secondCount) {
            console.log("\n🎉 ✅ DUPLICATE PREVENTION VERIFIED: No duplicate nodes or relationships created! MERGE guardrails worked idempotently.");
        } else {
            console.error(`\n❌ DUPLICATE DETECTED: Count increased by ${secondCount - initialCount}!`);
        }
    }

    // 8. Cleanup
    console.log("\n=== 6. Cleanup & Closing Database Connection ===");
    await closeDriver();
    console.log("✅ Finished test successfully.");
}

testLLMMemoryGraph().catch(async (err) => {
    console.error("❌ Test failed with unhandled error:", err);
    await closeDriver();
});
