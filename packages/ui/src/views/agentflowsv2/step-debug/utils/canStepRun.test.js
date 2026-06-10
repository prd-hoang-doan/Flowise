import { canStepRun, isDeferred, STEP_RUN_ALLOWED_NODES, STEP_RUN_DEFERRED_NODES } from './canStepRun'

describe('canStepRun', () => {
    it.each([
        ['llmAgentflow', false, true],
        ['agentAgentflow', false, true],
        ['toolAgentflow', false, true],
        ['retrieverAgentflow', false, true],
        ['httpAgentflow', false, true],
        ['customFunctionAgentflow', false, true],
        ['conditionAgentflow', false, true],
        ['conditionAgentAgentflow', false, true],
        ['directReplyAgentflow', false, true]
    ])('returns true for V1.0 allowlist: %s', (name, isChild, expected) => {
        expect(canStepRun(name, isChild)).toBe(expected)
    })

    it.each(['startAgentflow', 'iterationAgentflow', 'loopAgentflow', 'humanInputAgentflow', 'executeFlowAgentflow'])(
        'returns false for V1.1 deferred node: %s',
        (name) => {
            expect(canStepRun(name, false)).toBe(false)
        }
    )

    it('returns false for stickyNoteAgentflow', () => {
        expect(canStepRun('stickyNoteAgentflow', false)).toBe(false)
    })

    it('returns false for children of iteration/loop regardless of node type', () => {
        expect(canStepRun('llmAgentflow', true)).toBe(false)
        expect(canStepRun('agentAgentflow', true)).toBe(false)
    })

    it('returns false for unknown node names', () => {
        expect(canStepRun('madeUpAgentflow', false)).toBe(false)
    })
})

describe('isDeferred', () => {
    it('flags exactly the five V1.1 node types', () => {
        expect(isDeferred('startAgentflow')).toBe(true)
        expect(isDeferred('iterationAgentflow')).toBe(true)
        expect(isDeferred('loopAgentflow')).toBe(true)
        expect(isDeferred('humanInputAgentflow')).toBe(true)
        expect(isDeferred('executeFlowAgentflow')).toBe(true)
        expect(isDeferred('llmAgentflow')).toBe(false)
        expect(isDeferred('stickyNoteAgentflow')).toBe(false)
    })
})

describe('exported sets', () => {
    it('STEP_RUN_ALLOWED_NODES has exactly 9 entries (V1.0)', () => {
        expect(STEP_RUN_ALLOWED_NODES.size).toBe(9)
    })

    it('STEP_RUN_DEFERRED_NODES has exactly 5 entries (V1.1)', () => {
        expect(STEP_RUN_DEFERRED_NODES.size).toBe(5)
    })
})
