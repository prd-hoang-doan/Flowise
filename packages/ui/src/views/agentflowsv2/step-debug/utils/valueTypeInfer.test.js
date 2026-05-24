import { inferValueType, coerceFromInput, estimateSizeBytes } from './valueTypeInfer'

describe('inferValueType', () => {
    it.each([
        [null, 'string'],
        [undefined, 'string'],
        ['', 'string'],
        ['hello', 'string'],
        [42, 'number'],
        [0, 'number'],
        [-1.5, 'number'],
        [true, 'boolean'],
        [false, 'boolean'],
        [[], 'array'],
        [[1, 2], 'array'],
        [{ a: 1 }, 'json']
    ])('infers %p as %s', (value, expected) => {
        expect(inferValueType(value)).toBe(expected)
    })

    it('infers file from IFileUpload shape', () => {
        expect(inferValueType({ data: 'b64...', type: 'file', name: 'a.png', mime: 'image/png' })).toBe('file')
    })

    it('treats NaN / Infinity as string fallback', () => {
        expect(inferValueType(NaN)).toBe('string')
        expect(inferValueType(Infinity)).toBe('string')
    })
})

describe('coerceFromInput', () => {
    it('passes strings through unchanged', () => {
        expect(coerceFromInput('hello', 'string')).toBe('hello')
        expect(coerceFromInput(42, 'string')).toBe('42')
    })

    it('coerces numbers', () => {
        expect(coerceFromInput('3.14', 'number')).toBe(3.14)
        expect(coerceFromInput('', 'number')).toBeNull()
    })

    it('throws on invalid number input', () => {
        expect(() => coerceFromInput('abc', 'number')).toThrow(/not a valid number/)
    })

    it('coerces booleans loosely', () => {
        expect(coerceFromInput('true', 'boolean')).toBe(true)
        expect(coerceFromInput('false', 'boolean')).toBe(false)
        expect(coerceFromInput(true, 'boolean')).toBe(true)
        expect(coerceFromInput(0, 'boolean')).toBe(false)
        expect(coerceFromInput('', 'boolean')).toBe(false)
    })

    it('throws on non-coercible boolean', () => {
        expect(() => coerceFromInput('maybe', 'boolean')).toThrow(/not a valid boolean/)
    })

    it('parses JSON', () => {
        expect(coerceFromInput('{"a":1}', 'json')).toEqual({ a: 1 })
        expect(coerceFromInput('[1,2,3]', 'array')).toEqual([1, 2, 3])
    })

    it('returns null for empty JSON / array', () => {
        expect(coerceFromInput('', 'json')).toBeNull()
        expect(coerceFromInput('', 'array')).toBeNull()
    })

    it('rethrows JSON parse errors with a friendly prefix', () => {
        expect(() => coerceFromInput('{not json', 'json')).toThrow(/Invalid JSON/)
    })

    it('returns non-string JSON values as-is', () => {
        const value = { already: 'parsed' }
        expect(coerceFromInput(value, 'json')).toBe(value)
    })
})

describe('estimateSizeBytes', () => {
    it('returns 0 for null/undefined', () => {
        expect(estimateSizeBytes(null)).toBe(0)
        expect(estimateSizeBytes(undefined)).toBe(0)
    })

    it('returns string length for strings', () => {
        expect(estimateSizeBytes('hello')).toBe(5)
    })

    it('returns JSON length for objects', () => {
        expect(estimateSizeBytes({ a: 1 })).toBe(JSON.stringify({ a: 1 }).length)
    })

    it('returns 0 for circular objects (rather than throwing)', () => {
        const circ = {}
        circ.self = circ
        expect(estimateSizeBytes(circ)).toBe(0)
    })
})
