import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { globalContext } from "../../Agent/Runner.js";
import { makeMemory, type MemoryMakerResult } from "../core/memory.maker.js";

/**
 * Default interval of 2 minutes (in milliseconds)
 */
export const DEFAULT_UPDATE_INTERVAL_MS = 2 * 60 * 1000;

// Internal state tracking
let lastProcessedMessageIndex: number = 0;
let needsUpdate: boolean = false;
let isProcessing: boolean = false;
let updateIntervalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Checks if the globalContext has new messages that haven't been processed yet.
 * If new messages exist, sets the `needsUpdate` flag to true.
 *
 * @returns boolean indicating whether the global context has new updates
 */
export function checkContextUpdated(): boolean {
    const currentMessageCount = globalContext.messages.length;
    if (currentMessageCount > lastProcessedMessageIndex) {
        needsUpdate = true;
        return true;
    }
    return needsUpdate;
}

/**
 * Manually marks the needsUpdate flag.
 *
 * @param value - Optional boolean value (defaults to true)
 */
export function setNeedsUpdate(value: boolean = true): void {
    needsUpdate = value;
}

/**
 * Returns the current needsUpdate status.
 */
export function getNeedsUpdateStatus(): boolean {
    return needsUpdate;
}

/**
 * Extracts only the newly added messages from globalContext since the last graph update.
 * This prevents sending entire repetitive context history to LLM for Cypher query generation.
 *
 * @returns Array of new ChatCompletionMessageParam items
 */
export function getUpdatedContext(): ChatCompletionMessageParam[] {
    const currentMessageCount = globalContext.messages.length;
    if (currentMessageCount <= lastProcessedMessageIndex) {
        return [];
    }
    return globalContext.messages.slice(lastProcessedMessageIndex);
}

/**
 * Processes memory graph update using only new context messages if an update is needed.
 * Updates the graph using `makeMemory` and advances the processed message index.
 *
 * @param userId - Optional identifier for the user (defaults to "default_user")
 * @returns MemoryMakerResult if updated, or null if no update was needed/processing already in flight
 */
export async function processGraphUpdate(
    userId: string = "default_user"
): Promise<MemoryMakerResult | null> {
    // 1. Check if context has been updated
    if (!checkContextUpdated()) {
        console.log("[GraphUpdater] No new context updates detected. Skipping memory graph sync.");
        return null;
    }

    // 2. Prevent concurrent processing runs
    if (isProcessing) {
        console.log("[GraphUpdater] Memory graph update is already in progress. Skipping this cycle.");
        return null;
    }

    isProcessing = true;
    const targetEndIndex = globalContext.messages.length;

    try {
        // 3. Extract only the delta (new context messages)
        const deltaMessages = getUpdatedContext();

        if (deltaMessages.length === 0) {
            needsUpdate = false;
            return null;
        }

        console.log(`[GraphUpdater] Processing memory update with ${deltaMessages.length} new message(s)...`);

        // 4. Run pre-existing makeMemory function with the updated context slice
        const result = await makeMemory(deltaMessages, userId);

        // 5. Update index tracker and reset update flag upon completion
        lastProcessedMessageIndex = targetEndIndex;
        needsUpdate = false;

        console.log(
            `[GraphUpdater] Graph update complete. Success: ${result.success}. Extracted ${result.extracted.entities.length} entities & ${result.extracted.queries.length} queries.`
        );

        return result;
    } catch (error) {
        console.error("[GraphUpdater] Error updating memory graph:", error);
        throw error;
    } finally {
        isProcessing = false;
    }
}

/**
 * Configuration options for background graph updater
 */
export interface GraphUpdaterOptions {
    /** Interval in milliseconds between checks (default: 2 minutes / 120,000 ms) */
    intervalMs?: number;
    /** User ID to associate with the memory graph (default: "default_user") */
    userId?: string;
    /** If true, runs an initial update immediately upon starting */
    runImmediately?: boolean;
}

/**
 * Starts the background graph updater interval (default: 2 minutes).
 * On each tick, checks if the global context is updated, extracts the delta context,
 * and runs `makeMemory` to sync the graph database.
 *
 * @param options - Configuration options for the background updater
 */
export function startGraphUpdater(options: GraphUpdaterOptions = {}): ReturnType<typeof setInterval> {
    const {
        intervalMs = DEFAULT_UPDATE_INTERVAL_MS,
        userId = "default_user",
        runImmediately = false
    } = options;

    if (updateIntervalTimer !== null) {
        console.warn("[GraphUpdater] Background updater is already running.");
        return updateIntervalTimer;
    }

    console.log(`[GraphUpdater] Starting background memory graph updater (Interval: ${intervalMs / 1000}s)`);

    if (runImmediately) {
        processGraphUpdate(userId).catch(err => {
            console.error("[GraphUpdater] Initial background update failed:", err);
        });
    }

    updateIntervalTimer = setInterval(async () => {
        try {
            await processGraphUpdate(userId);
        } catch (error) {
            console.error("[GraphUpdater] Periodic graph update failed:", error);
        }
    }, intervalMs);

    return updateIntervalTimer;
}

/**
 * Stops the background graph updater interval.
 */
export function stopGraphUpdater(): void {
    if (updateIntervalTimer !== null) {
        clearInterval(updateIntervalTimer);
        updateIntervalTimer = null;
        console.log("[GraphUpdater] Background memory graph updater stopped.");
    }
}

/**
 * Checks if the background graph updater is currently active.
 */
export function isGraphUpdaterRunning(): boolean {
    return updateIntervalTimer !== null;
}

/**
 * Resets the updater state (processed index, needsUpdate flag, timer).
 * Useful for tests or session resets.
 */
export function resetGraphUpdaterState(): void {
    stopGraphUpdater();
    lastProcessedMessageIndex = 0;
    needsUpdate = false;
    isProcessing = false;
}

// In this file we have todo 2 things firstly we have to create a function which will ccheck if the global context is updated if yes it will mark any varible as need update then we have to run our preexisting functions which will update the graph function but only when the variable says needs update and that too after 2 minutes so the flow would be we will set a interval in which we will first check if context is updated if yes then we have to get the updated context from the globalcontext so that we do not give a lot of info to llm for making cypher queries then we will run our memory functions for storing the info in graphdb and the time for setinterval would be 2 minutes