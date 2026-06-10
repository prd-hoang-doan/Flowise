import { STEP_RUN_CONCURRENCY_PER_USER } from './constants'
import { acquireStepRunSlot, releaseStepRunSlot, StepRunConcurrencyExceededError, __resetStepRunSlots } from './concurrency'

describe('Step Debugger concurrency semaphore', () => {
    beforeEach(() => {
        __resetStepRunSlots()
    })

    it('allows up to STEP_RUN_CONCURRENCY_PER_USER concurrent slots per (chatflow, user)', () => {
        for (let i = 0; i < STEP_RUN_CONCURRENCY_PER_USER; i++) {
            acquireStepRunSlot('cf-1', 'user-1')
        }
        expect(() => acquireStepRunSlot('cf-1', 'user-1')).toThrow(StepRunConcurrencyExceededError)
    })

    it('isolates slots across (chatflow, user) keys', () => {
        for (let i = 0; i < STEP_RUN_CONCURRENCY_PER_USER; i++) acquireStepRunSlot('cf-1', 'user-1')
        // different user / different flow should still have full capacity
        expect(() => acquireStepRunSlot('cf-1', 'user-2')).not.toThrow()
        expect(() => acquireStepRunSlot('cf-2', 'user-1')).not.toThrow()
    })

    it('releases a slot back to the pool', () => {
        for (let i = 0; i < STEP_RUN_CONCURRENCY_PER_USER; i++) acquireStepRunSlot('cf-1', 'user-1')
        releaseStepRunSlot('cf-1', 'user-1')
        expect(() => acquireStepRunSlot('cf-1', 'user-1')).not.toThrow()
    })

    it('drops empty buckets', () => {
        acquireStepRunSlot('cf-3', 'user-x')
        releaseStepRunSlot('cf-3', 'user-x')
        // Re-acquire after release should always succeed
        for (let i = 0; i < STEP_RUN_CONCURRENCY_PER_USER; i++) acquireStepRunSlot('cf-3', 'user-x')
        expect(() => acquireStepRunSlot('cf-3', 'user-x')).toThrow(StepRunConcurrencyExceededError)
    })
})
