/**
 * Unit tests for the Step Run SSE consumer (`runStepSSE`).
 *
 * Strategy: mock global `fetch` to return a ReadableStream pre-loaded with
 * the Flowise wire format (`message:\ndata:<json>\n\n`). The consumer should
 * dispatch each parsed frame through onEvent, ignore malformed frames, and
 * surface non-2xx responses as classified StepRunFetchError.
 */

// Polyfills for the node test environment.
const { TextDecoder, TextEncoder } = require('util')
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder

// The api client module pulls in `@/store/constant` which uses import.meta.
// We replace `@/api/client` and `@/store/constant` with stubs so jest can
// require step-run.js in isolation.
jest.mock('@/api/client', () => ({ __esModule: true, default: { post: jest.fn() } }))
jest.mock('@/store/constant', () => ({ baseURL: 'http://localhost' }), { virtual: true })

const stepRunApi = require('./step-run').default
const { StepRunFetchError } = require('./step-run-error')

const makeStream = (chunks) => {
    const encoder = new TextEncoder()
    let i = 0
    return new ReadableStream({
        pull(controller) {
            if (i >= chunks.length) {
                controller.close()
                return
            }
            controller.enqueue(encoder.encode(chunks[i++]))
        }
    })
}

const okResponse = (chunks) => ({ ok: true, status: 200, body: makeStream(chunks) })

beforeEach(() => {
    global.fetch = jest.fn()
})

describe('runStepSSE', () => {
    it('dispatches every {event, data} frame through onEvent', async () => {
        global.fetch.mockResolvedValueOnce(
            okResponse([
                'message:\ndata:' + JSON.stringify({ event: 'agentFlowEvent', data: 'INPROGRESS' }) + '\n\n',
                'message:\ndata:' + JSON.stringify({ event: 'token', data: 'hi' }) + '\n\n',
                'message:\ndata:' + JSON.stringify({ event: 'agentFlowEvent', data: 'FINISHED' }) + '\n\n'
            ])
        )

        const events = []
        await stepRunApi.runStepSSE('cf-1', 'llm_2', { question: 'hi' }, {
            onEvent: (e, d) => events.push([e, d])
        })

        expect(events).toEqual([
            ['agentFlowEvent', 'INPROGRESS'],
            ['token', 'hi'],
            ['agentFlowEvent', 'FINISHED']
        ])
    })

    it('handles frame boundaries split across chunks', async () => {
        const frame = 'message:\ndata:' + JSON.stringify({ event: 'token', data: 'split' }) + '\n\n'
        const mid = Math.floor(frame.length / 2)
        global.fetch.mockResolvedValueOnce(okResponse([frame.slice(0, mid), frame.slice(mid)]))

        const events = []
        await stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: (e, d) => events.push([e, d]) })
        expect(events).toEqual([['token', 'split']])
    })

    it('skips malformed frames without throwing', async () => {
        global.fetch.mockResolvedValueOnce(
            okResponse([
                'message:\ndata:not-json\n\n',
                'message:\ndata:' + JSON.stringify({ event: 'token', data: 'ok' }) + '\n\n'
            ])
        )

        const events = []
        await stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: (e, d) => events.push([e, d]) })
        expect(events).toEqual([['token', 'ok']])
    })

    it('throws StepRunFetchError with parsed missingVariables on 422 JSON-in-message', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: async () => ({
                statusCode: 422,
                success: false,
                message: JSON.stringify({
                    code: 'STEP_RUN_MISSING_VARIABLES',
                    missingVariables: ['$flow.state.mode']
                })
            })
        })

        await expect(stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: jest.fn() })).rejects.toMatchObject({
            name: 'StepRunFetchError',
            status: 422,
            code: 'STEP_RUN_MISSING_VARIABLES',
            missingVariables: ['$flow.state.mode']
        })
    })

    it('throws StepRunFetchError with the plain message on a non-structured error', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 413,
            json: async () => ({ statusCode: 413, success: false, message: 'too big' })
        })

        const promise = stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: jest.fn() })
        await expect(promise).rejects.toBeInstanceOf(StepRunFetchError)
        await expect(promise).rejects.toMatchObject({ status: 413, message: 'too big', code: null })
    })

    it('falls back to plain text when the error body is not JSON', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 502,
            json: async () => {
                throw new Error('not json')
            },
            text: async () => 'Bad Gateway'
        })

        await expect(stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: jest.fn() })).rejects.toMatchObject({
            status: 502,
            message: 'Bad Gateway'
        })
    })

    it('forwards AbortSignal to fetch', async () => {
        global.fetch.mockImplementation((url, opts) => {
            expect(opts.signal).toBeDefined()
            return Promise.resolve(okResponse(['message:\ndata:{"event":"end","data":"[DONE]"}\n\n']))
        })

        const ctrl = new AbortController()
        await stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: jest.fn(), signal: ctrl.signal })
        expect(global.fetch).toHaveBeenCalled()
    })

    it('throws when the response body is missing', async () => {
        global.fetch.mockResolvedValueOnce({ ok: true, status: 200, body: null })
        await expect(stepRunApi.runStepSSE('cf', 'n', {}, { onEvent: jest.fn() })).rejects.toThrow(/empty response body/i)
    })

    it('sends a JSON body with the expected headers', async () => {
        global.fetch.mockResolvedValueOnce(okResponse([]))
        await stepRunApi.runStepSSE('cf-1', 'llm_2', { question: 'q' }, { onEvent: jest.fn() })

        const [url, opts] = global.fetch.mock.calls[0]
        expect(url).toBe('http://localhost/api/v1/chatflows/cf-1/debug/nodes/llm_2/run')
        expect(opts.method).toBe('POST')
        expect(opts.credentials).toBe('include')
        expect(opts.headers['Content-Type']).toBe('application/json')
        expect(opts.headers.Accept).toBe('text/event-stream')
        expect(JSON.parse(opts.body)).toEqual({ question: 'q' })
    })
})
