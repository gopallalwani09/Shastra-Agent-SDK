export { Shastra } from "./Agent/Agent.js";
export { ShastraBuilder } from "./Agent/AgentBuilder.js";
export { Runner, globalContext, resetGlobalContext } from "./Agent/Runner.js";

export type {
    ITool
} from "./types/Tool.js";

export type {
    ShastraConfig
} from "./Agent/Agent.js";

export type {
    RunContext
} from "./types/types.js";

export {
    driver,
    initNeo4j,
    getDriver,
    verifyConnection,
    closeDriver,
    ensureGraphConstraints
} from "./memory/core/Neo4jconnect.js";

export type {
    Neo4jCredentials
} from "./memory/core/Neo4jconnect.js";

export {
    executeQuery,
    executeQueries,
    queryExecutorTool,
    QueryExecutorInputSchema
} from "./memory/core/queryExecutor.js";

export type {
    QueryExecutionResult,
    QueryExecutorInput
} from "./memory/core/queryExecutor.js";

export {
    makeMemory,
    checkNodeExists,
    validateDuplicatePreventionGuardrail,
    MemoryExtractionSchema
} from "./memory/core/memory.maker.js";

export type {
    MemoryExtraction,
    MemoryMakerResult
} from "./memory/core/memory.maker.js";

export {
    startGraphUpdater,
    stopGraphUpdater,
    startGraphMemory,
    stopGraphMemory,
    checkContextUpdated,
    setNeedsUpdate,
    getNeedsUpdateStatus,
    getUpdatedContext,
    processGraphUpdate,
    isGraphUpdaterRunning,
    resetGraphUpdaterState,
    DEFAULT_UPDATE_INTERVAL_MS
} from "./memory/backgroundProcess/graphUpdater.js";

export type {
    GraphUpdaterOptions
} from "./memory/backgroundProcess/graphUpdater.js";