import { STEP_RUN_CONCURRENCY_PER_USER } from './constants'

/**
 * Step Run concurrency semaphore.
 *
 * NOTE: enforcement is **in-process only**. In `MODE.QUEUE` deployments with
 * N replicas, the effective cap is `N * STEP_RUN_CONCURRENCY_PER_USER`. A
 * Redis-backed semaphore is deferred to V1.1. The cap is still useful because:
 *  - Step Runs are interactive (one builder typing in the canvas), not
 *    fan-out workloads.
 *  - The cap prevents a single replica's event loop from being saturated by
 *    a runaway debugger (e.g. a stuck streaming LLM Step Run).
 *
 * The semaphore key is `${chatflowId}:${userId}` so a builder may step-debug
 * up to N nodes of the same flow in parallel from different tabs, but a single
 * flow cannot exceed the cap.
 */
export class StepRunConcurrencyExceededError extends Error {
    constructor(public readonly chatflowId: string, public readonly userId: string, public readonly cap: number) {
        super(`Step Run concurrency cap exceeded for chatflow ${chatflowId} / user ${userId} (cap=${cap})`)
        this.name = 'StepRunConcurrencyExceededError'
    }
}

const inFlight = new Map<string, number>()

const keyFor = (chatflowId: string, userId: string) => `${chatflowId}:${userId}`

export const acquireStepRunSlot = (chatflowId: string, userId: string): void => {
    const key = keyFor(chatflowId, userId)
    const current = inFlight.get(key) ?? 0
    if (current >= STEP_RUN_CONCURRENCY_PER_USER) {
        throw new StepRunConcurrencyExceededError(chatflowId, userId, STEP_RUN_CONCURRENCY_PER_USER)
    }
    inFlight.set(key, current + 1)
}

export const releaseStepRunSlot = (chatflowId: string, userId: string): void => {
    const key = keyFor(chatflowId, userId)
    const current = inFlight.get(key) ?? 0
    if (current <= 1) inFlight.delete(key)
    else inFlight.set(key, current - 1)
}

/** Test-only helper. */
export const __resetStepRunSlots = (): void => {
    inFlight.clear()
}
