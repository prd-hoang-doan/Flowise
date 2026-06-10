import { inferDebugInputs } from './inferDebugInputs'

const startNode = (overrides = {}) => ({
    id: 'startAgentflow_0',
    data: {
        name: 'startAgentflow',
        label: 'Start',
        inputs: {
            startInputType: 'formInput',
            formInputTypes: [
                { type: 'string', name: 'topic', label: 'Topic' },
                { type: 'number', name: 'limit', label: 'Limit' },
                { type: 'boolean', name: 'verbose', label: 'Verbose' },
                { type: 'options', name: 'mode', label: 'Mode', addOptions: [{ option: 'fast' }, { option: 'pro' }] }
            ],
            startState: [{ key: 'phase', value: 'init' }, { key: 'errors' }]
        },
        ...overrides
    }
})

const llmNode = (templateRefs = []) => ({
    id: 'llmAgentflow_1',
    data: {
        name: 'llmAgentflow',
        label: 'LLM',
        inputs: {
            llmMessages: templateRefs.map((t) => ({ role: 'user', content: `Hi {{ ${t} }}` }))
        }
    }
})

describe('inferDebugInputs', () => {
    test('returns empty result without a selected node', () => {
        const result = inferDebugInputs(null, [startNode()], [])
        expect(result.fields).toEqual([])
        expect(result.hasStart).toBe(false)
    })

    test('surfaces Start formInputTypes as typed form fields', () => {
        const nodes = [startNode(), llmNode([])]
        const edges = [{ id: 'e', source: 'startAgentflow_0', target: 'llmAgentflow_1' }]
        const { fields, hasStart } = inferDebugInputs('llmAgentflow_1', nodes, edges)

        expect(hasStart).toBe(true)
        const formFields = fields.filter((f) => f.namespace === 'form')
        expect(formFields.map((f) => ({ ref: f.ref, type: f.valueType })).sort((a, b) => a.ref.localeCompare(b.ref))).toEqual(
            [
                { ref: '$form.topic', type: 'string' },
                { ref: '$form.limit', type: 'number' },
                { ref: '$form.verbose', type: 'boolean' },
                { ref: '$form.mode', type: 'options' }
            ].sort((a, b) => a.ref.localeCompare(b.ref))
        )
        const modeField = formFields.find((f) => f.ref === '$form.mode')
        expect(modeField.options).toEqual(['fast', 'pro'])
        expect(modeField.default).toBe('fast')
    })

    test('surfaces startState as flow_state fields, defaults preserved, no override = optional', () => {
        const nodes = [startNode(), llmNode([])]
        const edges = [{ id: 'e', source: 'startAgentflow_0', target: 'llmAgentflow_1' }]
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, edges)
        const stateFields = fields.filter((f) => f.namespace === 'flow_state')
        const phase = stateFields.find((f) => f.ref === '$flow.state.phase')
        const errors = stateFields.find((f) => f.ref === '$flow.state.errors')
        expect(phase).toMatchObject({ valueType: 'string', default: 'init', required: false })
        expect(errors).toMatchObject({ valueType: 'string', default: '', required: false })
    })

    test('detects template references inside downstream node inputs', () => {
        const nodes = [startNode(), llmNode(['$question', '$flow.state.phase', '$form.unknown'])]
        const edges = [{ id: 'e', source: 'startAgentflow_0', target: 'llmAgentflow_1' }]
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, edges)

        // $question is a system field surfaced from templates
        const sys = fields.find((f) => f.namespace === 'system')
        expect(sys.ref).toBe('$question')
        expect(sys.required).toBe(true)

        // template marked $flow.state.phase required, overriding the Start's optional default
        const phase = fields.find((f) => f.ref === '$flow.state.phase')
        expect(phase.required).toBe(true)
        expect(phase.default).toBe('init')

        // $form.unknown wasn't declared by Start but is referenced — surface it
        const unknown = fields.find((f) => f.ref === '$form.unknown')
        expect(unknown).toBeDefined()
        expect(unknown.required).toBe(true)
    })

    test('drops fields satisfied by present debug variables when includeSatisfied=false', () => {
        const nodes = [startNode(), llmNode(['$question'])]
        const edges = [{ id: 'e', source: 'startAgentflow_0', target: 'llmAgentflow_1' }]
        const presentScopes = {
            __form__: [{ name: 'topic' }],
            __system__: [{ name: 'question' }]
        }
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, edges, { presentScopes })
        expect(fields.find((f) => f.ref === '$form.topic')).toBeUndefined()
        expect(fields.find((f) => f.ref === '$question')).toBeUndefined()
        // still has the rest
        expect(fields.find((f) => f.ref === '$form.limit')).toBeDefined()
    })

    test('includeSatisfied=true keeps already-satisfied entries', () => {
        const nodes = [startNode(), llmNode(['$question'])]
        const edges = [{ id: 'e', source: 'startAgentflow_0', target: 'llmAgentflow_1' }]
        const presentScopes = { __system__: [{ name: 'question' }] }
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, edges, {
            presentScopes,
            includeSatisfied: true
        })
        expect(fields.find((f) => f.ref === '$question')).toBeDefined()
    })

    test('ignores backend-resolved system keys ($chat_history, $current_date_time)', () => {
        const nodes = [llmNode(['$chat_history', '$current_date_time'])]
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, [])
        expect(fields).toEqual([])
    })

    test('surfaces upstream node outputs as opaque node-output fields', () => {
        const nodes = [
            { id: 'toolAgentflow_0', data: { name: 'toolAgentflow', label: 'Search', inputs: {} } },
            { id: 'llmAgentflow_1', data: { name: 'llmAgentflow', label: 'LLM', inputs: {} } }
        ]
        const edges = [{ id: 'e', source: 'toolAgentflow_0', target: 'llmAgentflow_1' }]
        const { fields } = inferDebugInputs('llmAgentflow_1', nodes, edges)
        const nodeField = fields.find((f) => f.namespace === 'node')
        expect(nodeField).toMatchObject({
            ref: 'toolAgentflow_0',
            nodeId: 'toolAgentflow_0',
            label: 'Search',
            valueType: 'json'
        })
    })
})
