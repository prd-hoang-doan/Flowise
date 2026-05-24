import { extractDependentRefs, computeMissingFromCache } from './dependentVarExtractor'

const mkNode = (id, inputs = {}) => ({ id, data: { inputs } })

describe('extractDependentRefs', () => {
    it('returns [] when node is missing or has no data', () => {
        expect(extractDependentRefs(null)).toEqual([])
        expect(extractDependentRefs({})).toEqual([])
    })

    it('classifies flow_state / form / webhook templates', () => {
        const node = mkNode('llmAgentflow_1', {
            sys: '{{ $flow.state.mode }} - {{ $form.email }} - {{ $webhook.headers.x }}'
        })
        const refs = extractDependentRefs(node, [])
        expect(refs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ namespace: 'flow_state', name: 'mode', source: 'template' }),
                expect.objectContaining({ namespace: 'form', name: 'email', source: 'template' }),
                expect.objectContaining({ namespace: 'webhook', name: 'headers.x', source: 'template' })
            ])
        )
    })

    it('classifies $vars and $question', () => {
        const node = mkNode('llm_2', { prompt: '{{ $question }} api={{ $vars.api_key }}' })
        const refs = extractDependentRefs(node, [])
        expect(refs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ namespace: 'system', name: 'question' }),
                expect.objectContaining({ namespace: 'vars', name: 'api_key' })
            ])
        )
    })

    it('classifies node.output.path references', () => {
        const node = mkNode('llm_2', { text: 'hi {{ llmAgentflow_1.output.content }}' })
        const refs = extractDependentRefs(node, [])
        expect(refs).toHaveLength(1)
        expect(refs[0]).toMatchObject({
            namespace: 'node',
            nodeId: 'llmAgentflow_1',
            outputPath: 'content'
        })
    })

    it('drops never-missing namespaces ($chat_history, $current_date_time, $loop_count, $iteration*)', () => {
        const node = mkNode('llm_2', {
            prompt: '{{ $chat_history }} {{ $current_date_time }} {{ $loop_count }} {{ $iteration.index }}'
        })
        expect(extractDependentRefs(node, [])).toEqual([])
    })

    it('synthesises a node dep per incoming edge even with no template', () => {
        const node = mkNode('llm_2', {})
        const edges = [
            { source: 'condition_1', target: 'llm_2' },
            { source: 'retriever_1', target: 'llm_2' },
            { source: 'noise', target: 'other_node' }
        ]
        const refs = extractDependentRefs(node, edges)
        expect(refs.map((r) => r.nodeId).sort()).toEqual(['condition_1', 'retriever_1'])
        expect(refs.every((r) => r.source === 'edge')).toBe(true)
    })

    it('dedupes a ref that appears both in a template and on an edge', () => {
        const node = mkNode('llm_2', { x: '{{ condition_1.output.branch }}' })
        const edges = [{ source: 'condition_1', target: 'llm_2' }]
        const refs = extractDependentRefs(node, edges)
        const condRefs = refs.filter((r) => r.nodeId === 'condition_1')
        // Template ref wins (it carries the outputPath); edge dedupe doesn't add another.
        expect(condRefs).toHaveLength(1)
        expect(condRefs[0].source).toBe('template')
    })

    it('scans deeply-nested template usage via JSON stringify', () => {
        const node = mkNode('llm_2', {
            condition: { branches: [{ when: '{{ $flow.state.userPlan }}' }] }
        })
        const refs = extractDependentRefs(node, [])
        expect(refs).toEqual(expect.arrayContaining([expect.objectContaining({ namespace: 'flow_state', name: 'userPlan' })]))
    })
})

describe('computeMissingFromCache', () => {
    const refs = [
        { namespace: 'flow_state', name: 'mode' },
        { namespace: 'form', name: 'email' },
        { namespace: 'node', nodeId: 'llm_1' },
        { namespace: 'vars', name: 'api_key' }
    ]

    it('returns refs whose scope has no entries', () => {
        expect(computeMissingFromCache(refs, {})).toEqual(refs)
    })

    it('drops refs whose scope already has the named variable', () => {
        const present = {
            __flow_state__: [{ name: 'mode' }],
            __form__: [{ name: 'email' }],
            llm_1: [{ name: 'content' }],
            vars: [{ name: 'api_key' }]
        }
        expect(computeMissingFromCache(refs, present)).toEqual([])
    })

    it('keeps refs when the scope exists but the name does not', () => {
        const present = { __flow_state__: [{ name: 'other' }] }
        const missing = computeMissingFromCache(refs, present)
        expect(missing).toEqual(expect.arrayContaining([{ namespace: 'flow_state', name: 'mode' }]))
    })
})
