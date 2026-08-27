import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { globalContext } from "../../Agent/Runner.js";
import { makeMemory, type MemoryMakerResult } from "../core/memory.maker.js";
import { initNeo4j, verifyConnection, closeDriver, ensureGraphConstraints, type Neo4jCredentials } from "../core/Neo4jconnect.js";

/**
 * Default interval of 2 minutes (in milliseconds)
 */
export const DEFAULT_UPDATE_INTERVAL_MS = 2 * 60 * 1000;

// Internal state tracking
let lastProcessedMessageIndex: number = 0;
let needsUpdate: boolean = false;
let isProcessing: boolean = false;
let updateIntervalTimer: ReturnType<typeof setInterval> | null = null;
let currentProcessingPromise: Promise<MemoryMakerResult | null> | null = null;
let activeUserId: string = "default_user";

/**
 * Gets the current active user ID configured for graph memory operations.
 */
export function getActiveUserId(): string {
    return activeUserId;
}

/**
 * Sets the active user ID for graph memory operations.
 */
export function setActiveUserId(userId: string): void {
    activeUserId = userId;
}

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
        return null;
    }

    // 2. Prevent concurrent processing runs
    if (isProcessing) {
        return null;
    }

    isProcessing = true;

    const task = (async (): Promise<MemoryMakerResult | null> => {
        const targetEndIndex = globalContext.messages.length;

        try {
            // 3. Extract only the delta (new context messages)
            const deltaMessages = getUpdatedContext();

            if (deltaMessages.length === 0) {
                needsUpdate = false;
                return null;
            }

            console.log(`[GraphUpdater] Processing memory update with ${deltaMessages.length} new message(s)...`);

            // 4. Run makeMemory with the updated context slice
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
            currentProcessingPromise = null;
        }
    })();

    currentProcessingPromise = task;
    return task;
}

/**
 * Configuration options for background graph updater
 */
export interface GraphUpdaterOptions {
    /** Neo4j database credentials (uri, username, password) */
    credentials?: Neo4jCredentials;
    /** Interval in milliseconds between checks (default: 2 minutes / 120,000 ms) */
    intervalMs?: number;
    /** User ID to associate with the memory graph (default: "default_user") */
    userId?: string;
    /** If true, runs an initial update immediately upon starting */
    runImmediately?: boolean;
    /** If true, verifies database connection before starting (default: true) */
    verifyOnStart?: boolean;
}

/**
 * Starts the background graph updater interval with user credentials (default: 2 minutes).
 * On each tick, checks if the global context is updated, extracts the delta context,
 * and runs `makeMemory` to sync the graph database.
 *
 * @param options - Configuration options and database credentials for the background updater
 * @returns The setInterval timer reference
 */
export function startGraphUpdater(options: GraphUpdaterOptions = {}): ReturnType<typeof setInterval> {
    const {
        credentials,
        intervalMs = DEFAULT_UPDATE_INTERVAL_MS,
        userId = "default_user",
        runImmediately = false,
        verifyOnStart = true
    } = options;

    if (updateIntervalTimer !== null) {
        console.warn("[GraphUpdater] Background updater is already running.");
        return updateIntervalTimer;
    }

    activeUserId = userId;

    // Initialize Neo4j driver with user credentials if provided
    if (credentials) {
        initNeo4j(credentials);
    }

    if (verifyOnStart) {
        verifyConnection().then(connected => {
            if (connected) {
                ensureGraphConstraints().catch(() => {});
            }
        }).catch(err => {
            console.warn("[GraphUpdater] Connection verification check failed on start:", err);
        });
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

    // Unref timer in Node.js so it does not prevent clean process exit if left running
    if (typeof updateIntervalTimer === "object" && "unref" in updateIntervalTimer) {
        (updateIntervalTimer as NodeJS.Timeout).unref();
    }

    return updateIntervalTimer;
}

/**
 * Alias for startGraphUpdater with credentials.
 */
export const startGraphMemory = startGraphUpdater;

/**
 * Stops the background graph updater interval, awaits any in-flight background update,
 * and optionally closes the database driver.
 *
 * @param closeConnection - Optional boolean to also close the Neo4j driver connection (default: false)
 */
export async function stopGraphUpdater(closeConnection: boolean = false): Promise<void> {
    if (updateIntervalTimer !== null) {
        clearInterval(updateIntervalTimer);
        updateIntervalTimer = null;
        console.log("[GraphUpdater] Background memory graph updater stopped.");
    }

    // Await any in-flight background memory update so it finishes cleanly before closing connections
    if (currentProcessingPromise) {
        console.log("[GraphUpdater] Waiting for in-flight memory graph sync to complete...");
        try {
            await currentProcessingPromise;
        } catch {
            // Ignore error during shutdown drain
        }
    }

    if (closeConnection) {
        await closeDriver();
    }
}

/**
 * Alias for stopGraphUpdater.
 */
export const stopGraphMemory = stopGraphUpdater;

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
    if (updateIntervalTimer !== null) {
        clearInterval(updateIntervalTimer);
        updateIntervalTimer = null;
    }
    lastProcessedMessageIndex = 0;
    needsUpdate = false;
    isProcessing = false;
    currentProcessingPromise = null;
    activeUserId = "default_user";
}