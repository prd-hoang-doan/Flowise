/**
 * Constants and policy knobs for the AgentFlow Step Debugger.
 *
 * Kept in a single module so the controller / runner / saver agree on the
 * V1.0 allowlist and the offload threshold without each importing each other.
 */

/**
 * Node `data.name` values that are runnable as a Step Run in V1.0.
 * Anything outside this list returns HTTP 422 `STEP_RUN_UNSUPPORTED_NODE`.
 */
export const STEP_RUN_ALLOWED_NODES = new Set<string>([
    'llmAgentflow',
    'agentAgentflow',
    'toolAgentflow',
    'retrieverAgentflow',
    'httpAgentflow',
    'customFunctionAgentflow',
    'conditionAgentflow',
    'conditionAgentAgentflow',
    'directReplyAgentflow'
])

/**
 * V1.1 nodes — explicitly deferred. The controller distinguishes these from
 * generic "unsupported" so the Inspector can render a "Coming in V1.1" hint
 * rather than a generic error.
 */
export const STEP_RUN_DEFERRED_NODES = new Set<string>([
    'startAgentflow',
    'iterationAgentflow',
    'loopAgentflow',
    'humanInputAgentflow',
    'executeFlowAgentflow'
])

/**
 * Output keys that are bookkeeping metadata rather than debugger-visible
 * outputs (mirrors `useNodeData` in `packages/observe`). These never become
 * `DebugVariable` rows.
 */
export const EXCLUDED_OUTPUT_KEYS = new Set<string>([
    'timeMetadata',
    'usageMetadata',
    'usedTools',
    'sourceDocuments',
    'artifacts',
    'agentReasoning',
    'tokens'
])

/**
 * Hard cap (after `JSON.stringify`) for a single Debug Variable value.
 *
 * V1.0 enforces a hard cap and rejects oversized writes with HTTP 413.
 * Storage offload (S3 / local-storage) is intentionally deferred — see the
 * architecture doc §6.4.
 */
export const DEBUG_VAR_INLINE_MAX_BYTES = Number(process.env.WORKFLOW_DEBUG_VAR_INLINE_MAX) || 64 * 1024

/**
 * Concurrent Step Runs allowed per `(chatflowId, userId)` tuple per replica.
 * Prevents a single builder from saturating the replica's event loop with
 * runaway Step Runs (e.g. accidentally retriggering a streaming LLM repeatedly).
 *
 * NOTE: this is enforced **in-process only**. In `MODE.QUEUE` deployments with
 * N replicas, the effective cap is `N * STEP_RUN_CONCURRENCY_PER_USER`.
 * A Redis-backed semaphore is deferred to V1.1.
 */
export const STEP_RUN_CONCURRENCY_PER_USER = Number(process.env.STEP_RUN_CONCURRENCY_PER_USER) || 4

/**
 * Default GC retention windows. Both are overridable via env vars.
 */
export const DEBUG_VAR_TTL_DAYS = Number(process.env.DEBUG_VAR_TTL_DAYS) || 30
export const DEBUG_NODE_EXEC_KEEP_LAST_N = Number(process.env.DEBUG_NODE_EXEC_KEEP_LAST_N) || 10
