import { toExecutionTreeNode, toStepRunInputs, toTemplateReference } from './adapters'

describe('toExecutionTreeNode', () => {
    it('returns null when input is null/undefined', () => {
        expect(toExecutionTreeNode(null)).toBeNull()
        expect(toExecutionTreeNode(undefined)).toBeNull()
    })

    it('reshapes IDebugNodeExecution into the ExecutionTreeNode contract', () => {
        const debugNodeExec = {
            id: 'db-1',
            chatflowId: 'cf-1',
            workspaceId: 'ws-1',
            userId: 'u-1',
            nodeId: 'llm_2',
            nodeLabel: 'Triage',
            data: { input: { x: 1 }, output: { content: 'hi' } },
            status: 'FINISHED',
            durationMs: 812
        }
        expect(toExecutionTreeNode(debugNodeExec)).toEqual({
            nodeId: 'llm_2',
            nodeLabel: 'Triage',
            data: debugNodeExec.data,
            status: 'FINISHED',
            previousNodeIds: [],
            children: []
        })
    })

    it('substitutes an empty object when data is missing', () => {
        expect(toExecutionTreeNode({ nodeId: 'x', nodeLabel: 'X', status: 'FINISHED' }).data).toEqual({})
    })
})

describe('toStepRunInputs', () => {
    it('keeps the user-supplied keys verbatim', () => {
        const form = {
            '$flow.state.mode': 'pro',
            $question: 'hello',
            'llm_1.output.content': 'value'
        }
        expect(toStepRunInputs(form)).toEqual(form)
    })

    it('omits undefined entries but keeps null / "" / 0 / false', () => {
        const form = { a: undefined, b: null, c: '', d: 0, e: false }
        expect(toStepRunInputs(form)).toEqual({ b: null, c: '', d: 0, e: false })
    })

    it('returns {} for falsy input', () => {
        expect(toStepRunInputs(null)).toEqual({})
        expect(toStepRunInputs(undefined)).toEqual({})
    })
})

describe('toTemplateReference', () => {
    it.each([
        [{ scope: 'flow_state', name: 'mode' }, '{{ $flow.state.mode }}'],
        [{ scope: 'form', name: 'email' }, '{{ $form.email }}'],
        [{ scope: 'webhook', name: 'headers.x' }, '{{ $webhook.headers.x }}'],
        [{ scope: 'system', name: 'question' }, '{{ $question }}'],
        [{ scope: 'chat_history' }, '{{ $chat_history }}'],
        [{ scope: 'node', nodeId: 'llm_2', name: 'content' }, '{{ llm_2.output.content }}']
    ])('formats %p as %s', (summary, expected) => {
        expect(toTemplateReference(summary)).toBe(expected)
    })

    it('returns empty string for falsy input', () => {
        expect(toTemplateReference(null)).toBe('')
    })
})
