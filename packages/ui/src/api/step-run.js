import client from './client'
import { baseURL } from '@/store/constant'
import { StepRunFetchError } from './step-run-error'

/**
 * Step Run API client. Two transports are supported:
 *
 *  - JSON (default): plain axios POST, returns IStepRunResult in `data`.
 *  - SSE: hand-rolled fetch + ReadableStream consumer that streams the
 *    Flowise wire format `message:\ndata:<json>\n\n` events back through
 *    an `onEvent(event, data)` callback. Honours an AbortSignal.
 *
 * The 422 STEP_RUN_MISSING_VARIABLES envelope encodes a JSON object inside
 * the `message` string. The fetch transport surfaces it as `StepRunFetchError`
 * with `status`, `code`, `missingVariables`, and the raw `message` preserved
 * so callers can switch on `code` without re-parsing.
 */

export { StepRunFetchError }

const buildRunUrl = (chatflowId, nodeId) => `${baseURL}/api/v1/chatflows/${chatflowId}/debug/nodes/${nodeId}/run`

const parseErrorResponse = async (response) => {
    let raw = null
    let messageText = `Step Run failed with status ${response.status}`
    try {
        raw = await response.json()
        if (raw && typeof raw.message === 'string') {
            messageText = raw.message
        }
    } catch {
        try {
            messageText = await response.text()
        } catch {
            /* ignore */
        }
    }

    // STEP_RUN_MISSING_VARIABLES: message is itself a JSON-encoded payload.
    let code = null
    let missingVariables = []
    if (typeof messageText === 'string' && messageText.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(messageText)
            if (parsed && typeof parsed === 'object') {
                code = parsed.code || null
                if (Array.isArray(parsed.missingVariables)) {
                    missingVariables = parsed.missingVariables
                }
            }
        } catch {
            /* not a structured payload; treat as plain message */
        }
    }

    return new StepRunFetchError({
        status: response.status,
        message: messageText,
        code,
        missingVariables,
        raw
    })
}

/**
 * Streams a Step Run via SSE. Resolves once the stream is fully drained
 * (or rejects on transport / abort / non-2xx response). Per-event delivery
 * happens through the `onEvent` callback.
 *
 * @param {string} chatflowId
 * @param {string} nodeId
 * @param {object} body - JSON body forwarded to the backend.
 * @param {object} opts
 * @param {(event: string, data: unknown) => void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<void>}
 */
const runStepSSE = async (chatflowId, nodeId, body, { onEvent, signal } = {}) => {
    const response = await fetch(buildRunUrl(chatflowId, nodeId), {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'x-request-from': 'internal'
        },
        body: JSON.stringify(body ?? {}),
        signal
    })

    if (!response.ok) {
        throw await parseErrorResponse(response)
    }
    if (!response.body) {
        throw new StepRunFetchError({ status: 500, message: 'Step Run SSE: empty response body' })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        // Read until the server closes the stream. SSE frames are separated
        // by a blank line (\n\n); within each frame we only consume the
        // first `data:` line because Flowise prefixes each event with a
        // bare `message:` indicator that carries no payload.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''
            for (const part of parts) {
                const dataLine = part.split('\n').find((l) => l.startsWith('data:'))
                if (!dataLine) continue
                const payload = dataLine.slice(5).trim()
                if (!payload) continue
                try {
                    const parsed = JSON.parse(payload)
                    if (parsed && typeof parsed.event === 'string' && typeof onEvent === 'function') {
                        onEvent(parsed.event, parsed.data)
                    }
                } catch {
                    /* skip malformed frame */
                }
            }
        }
    } finally {
        try {
            reader.releaseLock?.()
        } catch {
            /* ignore */
        }
    }
}

/**
 * JSON transport for `POST /api/v1/chatflows/:id/debug/nodes/:nodeId/run`.
 * Returns the axios response so callers can inspect headers if needed.
 */
const runStepJson = (chatflowId, nodeId, body, opts) => client.post(`/chatflows/${chatflowId}/debug/nodes/${nodeId}/run`, body ?? {}, opts)

export default {
    runStepJson,
    runStepSSE
}
