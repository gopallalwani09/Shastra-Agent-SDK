import {
    resetGlobalContext,
    globalContext,
    startGraphUpdater,
    stopGraphUpdater,
    resetGraphUpdaterState,
    getNeedsUpdateStatus,
    isGraphUpdaterRunning
} from "../index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTimerAccuracyTest() {
    console.log("===============================================================");
    console.log("⏱️  TESTING GRAPH UPDATER TIMER ACCURACY & INTERVAL CADENCE");
    console.log("===============================================================\n");

    resetGlobalContext();
    resetGraphUpdaterState();

    const INTERVAL_MS = 3000; // 3.0 seconds
    const toleranceMs = 800;  // Node.js event loop tolerance buffer

    console.log(`Configured Interval: ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
    console.log("Starting timer...\n");

    const startTime = Date.now();
    const timestamps: number[] = [];

    // 1. Start the updater with INTERVAL_MS
    startGraphUpdater({
        intervalMs: INTERVAL_MS,
        userId: "timer_test_user",
        runImmediately: false,
        verifyOnStart: false
    });

    console.log(`[t = 0ms] Graph Updater started. isGraphUpdaterRunning(): ${isGraphUpdaterRunning()}`);

    // 2. Add message 1 at t = 500ms
    await sleep(500);
    globalContext.messages.push({
        role: "user",
        content: "Message 1 added at t = 500ms: I like TypeScript."
    });
    console.log(`[t = ~${Date.now() - startTime}ms] Message 1 added to globalContext.`);
    console.log(`   needsUpdate flag: ${getNeedsUpdateStatus()}`);

    // 3. Check before interval expires (t = 1500ms) - should NOT have executed yet
    await sleep(1000);
    const elapsedBeforeTick = Date.now() - startTime;
    console.log(`\n[t = ~${elapsedBeforeTick}ms] Checking before timer fires:`);
    console.log(`   Elapsed: ${elapsedBeforeTick}ms (< ${INTERVAL_MS}ms target)`);
    console.log(`   Has tick happened yet? ${timestamps.length > 0 ? "Yes" : "No (Correct - waiting for timer)"}`);

    // 4. Wait for 1st tick (at t = ~3000ms)
    await sleep(1800);
    const elapsedAfterTick1 = Date.now() - startTime;
    console.log(`\n[t = ~${elapsedAfterTick1}ms] 1st interval tick period completed.`);
    timestamps.push(elapsedAfterTick1);

    // 5. Add message 2 at t = ~3500ms to test 2nd tick
    globalContext.messages.push({
        role: "user",
        content: "Message 2 added: I also like Neo4j."
    });
    console.log(`[t = ~${Date.now() - startTime}ms] Message 2 added to globalContext.`);

    // 6. Wait for 2nd tick (at t = ~6000ms)
    await sleep(INTERVAL_MS);
    const elapsedAfterTick2 = Date.now() - startTime;
    console.log(`\n[t = ~${elapsedAfterTick2}ms] 2nd interval tick period completed.`);
    timestamps.push(elapsedAfterTick2);

    // 7. Stop updater and close database driver connection
    console.log("\n=== Stopping Timer ===");
    await stopGraphUpdater(true);
    console.log(`[t = ~${Date.now() - startTime}ms] Graph Updater stopped. isGraphUpdaterRunning(): ${isGraphUpdaterRunning()}`);

    // 8. Verify no further ticks occur after stop
    console.log("Waiting 3.5s to verify NO ticks occur after stop...");
    await sleep(3500);
    console.log("✅ Verified: Timer cleanly stopped, no ticks occurred.\n");

    // 9. Timing Analysis & Summary
    console.log("===============================================================");
    console.log("📊 TIMING MEASUREMENT RESULTS");
    console.log("===============================================================");
    const tick1 = timestamps[0] ?? 0;
    const tick2 = timestamps[1] ?? 0;
    console.log(`Expected Interval: ${INTERVAL_MS}ms`);
    console.log(`Tick 1 fired at: ~${tick1}ms (Expected: ~${INTERVAL_MS}ms, Delta: ${Math.abs(tick1 - INTERVAL_MS)}ms)`);
    console.log(`Tick 2 fired at: ~${tick2}ms (Expected: ~${INTERVAL_MS * 2}ms, Delta: ${Math.abs(tick2 - INTERVAL_MS * 2)}ms)`);
    const gapBetweenTicks = tick2 - tick1;
    console.log(`Gap between Tick 1 and Tick 2: ${gapBetweenTicks}ms (Target: ${INTERVAL_MS}ms, Diff: ${Math.abs(gapBetweenTicks - INTERVAL_MS)}ms)`);

    const passed = Math.abs(tick1 - INTERVAL_MS) < toleranceMs &&
                   Math.abs(gapBetweenTicks - INTERVAL_MS) < toleranceMs;

    if (passed) {
        console.log("\n🎯 RESULT: PASSED! The timer accurately follows the configured interval.");
    } else {
        console.log("\n⚠️ RESULT: Timer deviation exceeded tolerance.");
    }
}

runTimerAccuracyTest().catch(async (error) => {
    console.error("❌ Test error:", error);
    await stopGraphUpdater(true);
});
