import { compileRunInputBody, RunInputParseError } from './runInput'

describe('compileRunInputBody', () => {
    it('returns an empty body and hasOverrides=false when nothing is set', () => {
        expect(compileRunInputBody()).toEqual({ body: {}, hasOverrides: false })
        expect(compileRunInputBody({})).toEqual({ body: {}, hasOverrides: false })
    })

    it('forwards a trimmed question and sessionId', () => {
        const out = compileRunInputBody({ question: '  hi  ', sessionId: ' s-1 ' })
        expect(out.body).toEqual({ question: 'hi', sessionId: 's-1' })
        expect(out.hasOverrides).toBe(true)
    })

    it('skips empty trimmed strings', () => {
        const out = compileRunInputBody({ question: '   ', sessionId: '' })
        expect(out.body).toEqual({})
        expect(out.hasOverrides).toBe(false)
    })

    it('parses inputs / form / webhook JSON objects', () => {
        const out = compileRunInputBody({
            inputs: '{"mode":"pro"}',
            form: '{"email":"a@b"}',
            webhook: '{"headers":{"x":1}}'
        })
        expect(out.body).toEqual({
            inputs: { mode: 'pro' },
            form: { email: 'a@b' },
            webhook: { headers: { x: 1 } }
        })
    })

    it('omits empty JSON objects', () => {
        const out = compileRunInputBody({ inputs: '{}', form: '', webhook: '   ' })
        expect(out.body).toEqual({})
        expect(out.hasOverrides).toBe(false)
    })

    it('rejects malformed JSON with a RunInputParseError carrying the field name', () => {
        expect(() => compileRunInputBody({ inputs: '{not json' })).toThrow(RunInputParseError)
        try {
            compileRunInputBody({ inputs: '{nope' })
        } catch (err) {
            expect(err.field).toBe('inputs')
            expect(err.message).toMatch(/inputs:/)
        }
    })

    it('rejects non-object JSON (arrays, primitives)', () => {
        expect(() => compileRunInputBody({ form: '[1,2,3]' })).toThrow(/Expected a JSON object/)
        expect(() => compileRunInputBody({ webhook: '"hello"' })).toThrow(/Expected a JSON object/)
        expect(() => compileRunInputBody({ inputs: '42' })).toThrow(/Expected a JSON object/)
    })

    it('treats explicit JSON null as empty (drops the field)', () => {
        const out = compileRunInputBody({ inputs: 'null' })
        expect(out.body).toEqual({})
    })

    describe('structured fields', () => {
        const meta = {
            $question: { namespace: 'system', valueType: 'string' },
            '$form.topic': { namespace: 'form', valueType: 'string' },
            '$form.limit': { namespace: 'form', valueType: 'number' },
            '$form.verbose': { namespace: 'form', valueType: 'boolean' },
            '$webhook.headers': { namespace: 'webhook', valueType: 'json' },
            '$flow.state.mode': { namespace: 'flow_state', valueType: 'string' },
            tool_1: { namespace: 'node', valueType: 'json', nodeId: 'tool_1' }
        }

        it('folds $question into body.question', () => {
            const out = compileRunInputBody({ structured: { $question: 'Hi there' } }, meta)
            expect(out.body).toEqual({ question: 'Hi there' })
            expect(out.hasOverrides).toBe(true)
        })

        it('folds $form.* into body.form with type coercion', () => {
            const out = compileRunInputBody(
                {
                    structured: {
                        '$form.topic': 'pricing',
                        '$form.limit': '42',
                        '$form.verbose': 'true'
                    }
                },
                meta
            )
            expect(out.body.form).toEqual({ topic: 'pricing', limit: 42, verbose: true })
        })

        it('folds $webhook.* JSON-typed values via JSON.parse, falls back to raw string', () => {
            const out = compileRunInputBody(
                { structured: { '$webhook.headers': '{"x":"y"}' } },
                meta
            )
            expect(out.body.webhook).toEqual({ headers: { x: 'y' } })

            const fallback = compileRunInputBody(
                { structured: { '$webhook.headers': 'not json' } },
                meta
            )
            expect(fallback.body.webhook).toEqual({ headers: 'not json' })
        })

        it('folds $flow.state.* into body.inputs', () => {
            const out = compileRunInputBody(
                { structured: { '$flow.state.mode': 'pro' } },
                meta
            )
            expect(out.body.inputs).toEqual({ mode: 'pro' })
        })

        it('stashes node outputs under inputs.__nodeOutputs[ref]', () => {
            const out = compileRunInputBody(
                { structured: { tool_1: '{"answer":42}' } },
                meta
            )
            expect(out.body.inputs.__nodeOutputs).toEqual({ tool_1: { answer: 42 } })
        })

        it('raw JSON layer wins over structured on conflict', () => {
            const out = compileRunInputBody(
                {
                    structured: { '$form.topic': 'cheap' },
                    form: '{"topic":"premium"}'
                },
                meta
            )
            expect(out.body.form.topic).toBe('premium')
        })

        it('drops empty / cleared structured values', () => {
            const out = compileRunInputBody(
                { structured: { '$form.topic': '', '$form.limit': '   ' } },
                meta
            )
            expect(out.body).toEqual({})
        })

        it('survives missing fieldMeta (defaults to string trimming)', () => {
            const out = compileRunInputBody({ structured: { '$form.topic': 'hi' } })
            expect(out.body.form).toEqual({ topic: 'hi' })
        })
    })
})
