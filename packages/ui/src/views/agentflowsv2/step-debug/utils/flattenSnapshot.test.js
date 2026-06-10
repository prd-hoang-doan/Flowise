import { flattenSnapshot, scopeLabelFor, scopeSortKey } from './flattenSnapshot'

describe('flattenSnapshot', () => {
    it('returns an empty array for null / undefined / non-object sources', () => {
        expect(flattenSnapshot(null)).toEqual([])
        expect(flattenSnapshot(undefined)).toEqual([])
        expect(flattenSnapshot('hi')).toEqual([])
    })

    it('flattens a snapshot payload into rows with refKey + scope metadata', () => {
        const payload = {
            llm_1: [{ id: 'v1', name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string', edited: false, visible: true }],
            __flow_state__: [{ id: 'v2', name: 'mode', value: 'pro', sizeBytes: 3, valueType: 'string', edited: true, visible: true }]
        }
        const rows = flattenSnapshot(payload)
        // System / form / webhook / flow_state come before per-node rows.
        expect(rows.map((r) => r.refKey)).toEqual(['__flow_state__:mode', 'llm_1:content'])
        expect(rows[0]).toMatchObject({ scopeLabel: 'Flow State', edited: true })
        expect(rows[1]).toMatchObject({ scopeLabel: 'llm_1', edited: false })
    })

    it('uses graph nodesById to resolve per-node scope labels', () => {
        const payload = {
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }]
        }
        const rows = flattenSnapshot(payload, { nodesById: { llm_1: { data: { label: 'Summariser' } } } })
        expect(rows[0].scopeLabel).toBe('Summariser')
    })

    it('filters rows by scope label / name / valueType (case-insensitive)', () => {
        const payload = {
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }],
            __form__: [{ name: 'topic', value: 'cats', sizeBytes: 4, valueType: 'string' }]
        }
        expect(flattenSnapshot(payload, { filter: 'topic' }).map((r) => r.refKey)).toEqual(['__form__:topic'])
        expect(flattenSnapshot(payload, { filter: 'FORM' }).map((r) => r.refKey)).toEqual(['__form__:topic'])
        expect(flattenSnapshot(payload, { filter: 'string' }).length).toBe(2)
    })

    it('accepts the live debugVarsByScope cache (summary-only entries)', () => {
        const live = {
            llm_1: [{ id: 'v1', name: 'content', valueType: 'string', sizeBytes: 2, edited: false, visible: true }]
        }
        const rows = flattenSnapshot(live)
        expect(rows[0]).toMatchObject({ name: 'content', scopeKey: 'llm_1', value: undefined, sizeBytes: 2 })
    })

    it('orders rows: System → Form → Webhook → Flow State → Chat History → per-node', () => {
        const payload = {
            zNode: [{ name: 'a', sizeBytes: 0, valueType: 'string' }],
            __chat_history__: [{ name: 'h', sizeBytes: 0, valueType: 'array' }],
            __form__: [{ name: 'f', sizeBytes: 0, valueType: 'string' }],
            __webhook__: [{ name: 'w', sizeBytes: 0, valueType: 'string' }],
            __flow_state__: [{ name: 's', sizeBytes: 0, valueType: 'string' }],
            __system__: [{ name: 'q', sizeBytes: 0, valueType: 'string' }],
            aNode: [{ name: 'a', sizeBytes: 0, valueType: 'string' }]
        }
        const rows = flattenSnapshot(payload)
        expect(rows.map((r) => r.scopeKey)).toEqual([
            '__system__',
            '__form__',
            '__webhook__',
            '__flow_state__',
            '__chat_history__',
            'aNode',
            'zNode'
        ])
    })
})

describe('scopeLabelFor / scopeSortKey', () => {
    it('returns human labels for sentinels', () => {
        expect(scopeLabelFor('__flow_state__')).toBe('Flow State')
        expect(scopeLabelFor('__form__')).toBe('Form')
        expect(scopeLabelFor('__webhook__')).toBe('Webhook')
        expect(scopeLabelFor('__system__')).toBe('System')
        expect(scopeLabelFor('__chat_history__')).toBe('Chat History')
    })

    it('falls back to nodesById label, then nodeId', () => {
        expect(scopeLabelFor('llm_1', { llm_1: { data: { label: 'Translator' } } })).toBe('Translator')
        expect(scopeLabelFor('llm_2')).toBe('llm_2')
    })

    it('scopeSortKey puts sentinels before per-node ids', () => {
        expect(scopeSortKey('__system__')).toBeLessThan(scopeSortKey('llm_1'))
    })
})
