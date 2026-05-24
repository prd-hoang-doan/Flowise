import logger from '../logger'
import debugVariableService from '../../services/chatflows-debug/debugVariableService'
import debugNodeExecutionService from '../../services/chatflows-debug/debugNodeExecutionService'

/**
 * Default GC cadence — once every 24 hours. Override via
 * `DEBUG_GC_INTERVAL_MS` (e.g. set to a smaller value in tests).
 */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000

let intervalHandle: NodeJS.Timeout | null = null

/**
 * Start the nightly Step Debugger GC. Hosted at the app level rather than in
 * ScheduleBeat because Debug Variables / DebugNodeExecutions are app-wide
 * tables — there is nothing workspace-specific to enqueue.
 *
 * In `MODE.QUEUE` with N replicas, all N will run this on the same cadence.
 * That is harmless because the GC operations are idempotent (both methods
 * `DELETE WHERE` over an already-stale set). A Redis lock would be a nice-to-
 * have but is intentionally deferred along with the Redis-backed concurrency
 * semaphore.
 */
export const startStepDebuggerGC = (intervalMs: number = DEFAULT_INTERVAL_MS): void => {
    if (intervalHandle) return
    const tick = async () => {
        try {
            const [vars, runs] = await Promise.all([debugVariableService.gc({}), debugNodeExecutionService.gc({})])
            if (vars.deletedCount || runs.deletedCount) {
                logger.info(
                    `🧹 [StepDebuggerGC] removed ${vars.deletedCount} stale DebugVariable rows and ${runs.deletedCount} DebugNodeExecution rows`
                )
            }
        } catch (err) {
            logger.error(`[StepDebuggerGC] failed: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
    // Run once shortly after startup so cold-start cleanup happens without
    // waiting a full 24h cycle.
    setTimeout(() => void tick(), 60 * 1000).unref()
    intervalHandle = setInterval(() => void tick(), intervalMs)
    intervalHandle.unref()
}

export const stopStepDebuggerGC = (): void => {
    if (intervalHandle) {
        clearInterval(intervalHandle)
        intervalHandle = null
    }
}
