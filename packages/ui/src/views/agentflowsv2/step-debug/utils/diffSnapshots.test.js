import { diffSnapshots, MAX_DEEP_COMPARE_BYTES } from './diffSnapshots'

describe('diffSnapshots', () => {
    it('flags added entries when prev is null (first snapshot)', () => {
        const current = {
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }]
        }
        const { added, changed, removed } = diffSnapshots(null, current)
        expect([...added]).toEqual(['llm_1:content'])
        expect(changed.size).toBe(0)
        expect(removed.size).toBe(0)
    })

    it('flags changed entries when the value differs', () => {
        const prev = { llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }] }
        const curr = { llm_1: [{ name: 'content', value: 'bye', sizeBytes: 3, valueType: 'string' }] }
        const { added, changed, removed, byKey } = diffSnapshots(prev, curr)
        expect(added.size).toBe(0)
        expect([...changed]).toEqual(['llm_1:content'])
        expect(removed.size).toBe(0)
        expect(byKey.get('llm_1:content')).toBe('changed')
    })

    it('flags removed entries', () => {
        const prev = { llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }] }
        const curr = {}
        const { added, changed, removed } = diffSnapshots(prev, curr)
        expect(removed.size).toBe(1)
        expect([...removed]).toEqual(['llm_1:content'])
        expect(added.size).toBe(0)
        expect(changed.size).toBe(0)
    })

    it('does not flag unchanged entries', () => {
        const sample = { llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }] }
        const { added, changed, removed, byKey } = diffSnapshots(sample, sample)
        expect(added.size).toBe(0)
        expect(changed.size).toBe(0)
        expect(removed.size).toBe(0)
        expect(byKey.get('llm_1:content')).toBe('unchanged')
    })

    it('combines all three categories in a single diff', () => {
        const prev = {
            __flow_state__: [{ name: 'mode', value: 'pro', sizeBytes: 3, valueType: 'string' }],
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }]
        }
        const curr = {
            __flow_state__: [{ name: 'mode', value: 'pro', sizeBytes: 3, valueType: 'string' }], // unchanged
            llm_1: [{ name: 'content', value: 'bye', sizeBytes: 3, valueType: 'string' }], // changed
            tool_2: [{ name: 'output', value: 'x', sizeBytes: 1, valueType: 'string' }] // added
        }
        const { added, changed, removed } = diffSnapshots(prev, curr)
        expect([...added]).toEqual(['tool_2:output'])
        expect([...changed]).toEqual(['llm_1:content'])
        expect(removed.size).toBe(0)
    })

    it('treats summary-only sources (no `value`) as unchanged when size and type match', () => {
        const prev = { llm_1: [{ name: 'content', sizeBytes: 100, valueType: 'string' }] }
        const curr = { llm_1: [{ name: 'content', sizeBytes: 100, valueType: 'string' }] }
        const { changed } = diffSnapshots(prev, curr)
        expect(changed.size).toBe(0)
    })

    it('treats summary-only sources with different sizes as changed', () => {
        const prev = { llm_1: [{ name: 'content', sizeBytes: 100, valueType: 'string' }] }
        const curr = { llm_1: [{ name: 'content', sizeBytes: 200, valueType: 'string' }] }
        const { changed } = diffSnapshots(prev, curr)
        expect([...changed]).toEqual(['llm_1:content'])
    })

    it('treats very large values as changed via the size heuristic without deep compare', () => {
        const big = 'x'.repeat(MAX_DEEP_COMPARE_BYTES + 10)
        const big2 = 'y'.repeat(MAX_DEEP_COMPARE_BYTES + 10)
        const prev = { llm_1: [{ name: 'blob', value: big, sizeBytes: big.length, valueType: 'string' }] }
        const curr = { llm_1: [{ name: 'blob', value: big2, sizeBytes: big2.length, valueType: 'string' }] }
        const { changed } = diffSnapshots(prev, curr)
        expect([...changed]).toEqual(['llm_1:blob'])
    })

    it('handles sentinel and per-node scopes independently', () => {
        const prev = {
            __form__: [{ name: 'topic', value: 'cats', sizeBytes: 4, valueType: 'string' }],
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }]
        }
        const curr = {
            __form__: [{ name: 'topic', value: 'dogs', sizeBytes: 4, valueType: 'string' }],
            llm_1: [{ name: 'content', value: 'hi', sizeBytes: 2, valueType: 'string' }]
        }
        const { changed, removed, added } = diffSnapshots(prev, curr)
        expect([...changed]).toEqual(['__form__:topic'])
        expect(removed.size).toBe(0)
        expect(added.size).toBe(0)
    })
})
