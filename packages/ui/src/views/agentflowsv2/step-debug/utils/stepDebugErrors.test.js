import { classifyStepRunError } from './stepDebugErrors'
import { StepRunFetchError } from '@/api/step-run-error'

const axiosErr = (status, message) => ({
    response: { status, data: { statusCode: status, success: false, message } }
})

describe('classifyStepRunError', () => {
    it('detects AbortError', () => {
        const err = Object.assign(new Error('canceled'), { name: 'AbortError' })
        expect(classifyStepRunError(err).kind).toBe('aborted')
    })

    it('extracts missing_vars from a structured 422 JSON-in-message (axios path)', () => {
        const payload = JSON.stringify({
            code: 'STEP_RUN_MISSING_VARIABLES',
            missingVariables: ['$flow.state.mode', '$form.email']
        })
        const result = classifyStepRunError(axiosErr(422, payload))
        expect(result.kind).toBe('missing_vars')
        expect(result.missingVariables).toEqual(['$flow.state.mode', '$form.email'])
    })

    it('extracts missing_vars from StepRunFetchError (fetch path)', () => {
        const err = new StepRunFetchError({
            status: 422,
            code: 'STEP_RUN_MISSING_VARIABLES',
            missingVariables: ['$vars.api_key'],
            message: 'STEP_RUN_MISSING_VARIABLES'
        })
        const result = classifyStepRunError(err)
        expect(result.kind).toBe('missing_vars')
        expect(result.missingVariables).toEqual(['$vars.api_key'])
    })

    it('detects deferred V1.1 nodes via "coming in V1.1" substring', () => {
        const err = axiosErr(422, "Step Run for node type 'iterationAgentflow' is coming in V1.1")
        expect(classifyStepRunError(err).kind).toBe('deferred')
    })

    it('treats other 422 messages as unsupported', () => {
        expect(classifyStepRunError(axiosErr(422, "Step Run for node type 'foo' is not supported")).kind).toBe('unsupported')
    })

    it('maps 413 to too_large', () => {
        expect(classifyStepRunError(axiosErr(413, 'too big')).kind).toBe('too_large')
    })

    it('maps 429 with concurrency message to concurrency', () => {
        const err = axiosErr(429, 'Step Run concurrency cap exceeded for chatflow cf-1 / user u-1 (cap=4)')
        expect(classifyStepRunError(err).kind).toBe('concurrency')
    })

    it('maps generic 429 to rate_limited', () => {
        expect(classifyStepRunError(axiosErr(429, 'slow down')).kind).toBe('rate_limited')
    })

    it.each([401, 403])('maps %i to unauthorized', (status) => {
        expect(classifyStepRunError(axiosErr(status, 'forbidden')).kind).toBe('unauthorized')
    })

    it('maps 404 to not_found', () => {
        expect(classifyStepRunError(axiosErr(404, 'Node not found')).kind).toBe('not_found')
    })

    it('maps 5xx to server', () => {
        expect(classifyStepRunError(axiosErr(500, 'boom')).kind).toBe('server')
    })

    it('returns network when there is no status', () => {
        expect(classifyStepRunError(new Error('Network Error')).kind).toBe('network')
    })
})
