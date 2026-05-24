/**
 * Regression test for the Step Debugger JSON column transformers.
 *
 * The original implementation passed raw strings through unchanged on the
 * `to` side, which broke Postgres `jsonb` columns (Postgres rejects bare
 * tokens like `pro` or `42` with "invalid input syntax for type json").
 * The fixed transformer ALWAYS emits a JSON literal, regardless of value
 * type, while staying symmetric with the `from` side.
 */

// TypeORM's decorators reach into a metadata reflection runtime we don't want
// to spin up for a pure-function test. Mock it to no-ops so requiring the
// entity files (which apply @Entity / @Column at module load) is safe.
jest.mock(
    'typeorm',
    () => {
        const decorator = () => () => {}
        return {
            Column: decorator,
            CreateDateColumn: decorator,
            Entity: decorator,
            Index: decorator,
            JoinColumn: decorator,
            ManyToOne: decorator,
            PrimaryGeneratedColumn: decorator,
            Unique: decorator,
            UpdateDateColumn: decorator
        }
    },
    { virtual: true }
)
// flowise-components is referenced by DebugNodeExecution for its INodeExecutionData type only.
jest.mock('flowise-components', () => ({}), { virtual: true })

import { jsonValueTransformer } from './DebugVariable'
import { jsonDataTransformer } from './DebugNodeExecution'

const transformers = [
    ['DebugVariable.jsonValueTransformer', jsonValueTransformer],
    ['DebugNodeExecution.jsonDataTransformer', jsonDataTransformer]
] as const

describe.each(transformers)('%s', (_name, transformer) => {
    describe('to() — always emits valid JSON literals for jsonb columns', () => {
        it.each([
            ['hello', '"hello"'],
            ['"already quoted"', '"\\"already quoted\\""'],
            ['', '""'],
            [42, '42'],
            [0, '0'],
            [-3.14, '-3.14'],
            [true, 'true'],
            [false, 'false'],
            [{ a: 1 }, '{"a":1}'],
            [[1, 2, 3], '[1,2,3]']
        ])('encodes %p as %p', (input, expected) => {
            expect(transformer.to!(input)).toBe(expected)
        })

        it('maps null and undefined to null (so the column stays NULL rather than receiving the literal string "null")', () => {
            expect(transformer.to!(null)).toBeNull()
            expect(transformer.to!(undefined)).toBeNull()
        })

        it('returns null for values JSON.stringify cannot serialise (circular refs, functions)', () => {
            const circ: any = {}
            circ.self = circ
            expect(transformer.to!(circ)).toBeNull()
            expect(transformer.to!(() => 1)).toBeNull()
            expect(transformer.to!(Symbol('x'))).toBeNull()
        })
    })

    describe('from() — symmetric and idempotent', () => {
        it('parses JSON strings emitted by to()', () => {
            const samples = ['hello', 42, true, false, null, { a: 1 }, [1, 2, 3]]
            for (const value of samples) {
                const encoded = transformer.to!(value)
                expect(transformer.from!(encoded)).toEqual(value)
            }
        })

        it('passes non-string raw values through (driver already parsed jsonb)', () => {
            expect(transformer.from!({ a: 1 })).toEqual({ a: 1 })
            expect(transformer.from!([1, 2])).toEqual([1, 2])
            expect(transformer.from!(42)).toBe(42)
        })

        it('falls back to the raw string when it isn’t valid JSON', () => {
            expect(transformer.from!('not json')).toBe('not json')
        })

        it('maps null / undefined to null', () => {
            expect(transformer.from!(null)).toBeNull()
            expect(transformer.from!(undefined)).toBeNull()
        })
    })
})
