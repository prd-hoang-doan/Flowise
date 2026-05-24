/**
 * Classify any Step Debugger backend error into a (kind, message, extra) tuple
 * the UI can switch on. Two transports flow into this:
 *
 *  - axios errors from JSON endpoints — `error.response.{status,data.message}`
 *  - StepRunFetchError from the SSE consumer — exposes `{status, code,
 *    missingVariables, message}` directly
 *
 * Backend conventions (see `packages/server/src/controllers/chatflows-debug/`)
 * use the FlowiseError shape: a JSON body `{ statusCode, success: false,
 * message, stack? }`. The 422 STEP_RUN_MISSING_VARIABLES variant encodes
 * a JSON payload inside `message`. Other 422 errors are plain strings;
 * we detect deferred (V1.1) nodes by the substring "coming in V1.1".
 */

import { StepRunFetchError } from '@/api/step-run-error'

const SIZE_CAP_KB = 64

const readStatus = (err) => {
    if (err && typeof err.status === 'number') return err.status
    if (err && err.response && typeof err.response.status === 'number') return err.response.status
    return null
}

const readMessage = (err) => {
    if (err instanceof StepRunFetchError) return err.message || ''
    if (err && err.response && err.response.data) {
        if (typeof err.response.data.message === 'string') return err.response.data.message
        if (typeof err.response.data === 'string') return err.response.data
    }
    if (err && typeof err.message === 'string') return err.message
    return ''
}

const tryParseStructured = (message) => {
    if (typeof message !== 'string') return null
    const trimmed = message.trim()
    if (!trimmed.startsWith('{')) return null
    try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === 'object') return parsed
    } catch {
        /* not structured */
    }
    return null
}

/**
 * @returns {{
 *   kind: 'missing_vars' | 'unsupported' | 'deferred' | 'too_large'
 *       | 'concurrency' | 'rate_limited' | 'unauthorized' | 'not_found'
 *       | 'aborted' | 'network' | 'server' | 'unknown',
 *   status: number | null,
 *   message: string,
 *   missingVariables?: string[]
 * }}
 */
export const classifyStepRunError = (err) => {
    if (err && err.name === 'AbortError') {
        return { kind: 'aborted', status: null, message: 'Step Run aborted' }
    }

    const status = readStatus(err)
    const message = readMessage(err)

    // Structured missing-variables payload — encoded as JSON inside `message`.
    const structured =
        (err instanceof StepRunFetchError && err.code === 'STEP_RUN_MISSING_VARIABLES'
            ? { code: err.code, missingVariables: err.missingVariables }
            : null) || tryParseStructured(message)
    if (structured && structured.code === 'STEP_RUN_MISSING_VARIABLES') {
        return {
            kind: 'missing_vars',
            status: status ?? 422,
            message: 'This node depends on variables that have no value yet.',
            missingVariables: Array.isArray(structured.missingVariables) ? structured.missingVariables : []
        }
    }

    if (status === 422) {
        if (message.includes('coming in V1.1')) {
            return { kind: 'deferred', status, message: 'Step Run for this node ships in V1.1.' }
        }
        return { kind: 'unsupported', status, message: message || 'Step Run is not supported for this node.' }
    }

    if (status === 413) {
        return {
            kind: 'too_large',
            status,
            message: `Step Run payload exceeds the inline cap (${SIZE_CAP_KB} KiB). Reduce the value or wait for V1.1 storage offload.`
        }
    }

    if (status === 429) {
        // Distinguish in-process concurrency cap (message contains "cap exceeded")
        // from the express-rate-limit middleware (generic message).
        if (message.includes('concurrency cap exceeded')) {
            return {
                kind: 'concurrency',
                status,
                message: 'Too many Step Runs in flight for this flow. Wait for one to finish.'
            }
        }
        return { kind: 'rate_limited', status, message: 'Too many requests. Slow down and try again.' }
    }

    if (status === 401 || status === 403) {
        return { kind: 'unauthorized', status, message: "You don't have permission to step-debug this flow." }
    }
    if (status === 404) return { kind: 'not_found', status, message: message || 'Step Run target not found.' }
    if (status && status >= 500) return { kind: 'server', status, message: message || 'Server error' }
    if (status === null) return { kind: 'network', status: null, message: message || 'Network error' }
    return { kind: 'unknown', status, message: message || 'Step Run failed' }
}
