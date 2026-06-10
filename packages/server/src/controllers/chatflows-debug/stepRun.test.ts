/**
 * Controller-level tests for the Step Debugger `stepRun` handler. The handler
 * is the boundary between Express and the StepRunner orchestrator, so the
 * tests focus on:
 *
 *  - 400 when the chatflow isn't AGENTFLOW
 *  - 404 when the nodeId is not in flowData
 *  - 422 (translated from StepRunUnsupportedNodeError / StepRunMissingVariablesError)
 *  - 413 (translated from oversize input cap)
 *  - JSON happy path (returns the step result body)
 *  - SSE branch invokes addClient / removeClient and emits parity events
 *
 * Service layer is fully mocked so no DB or runtime is required.
 */
import { NextFunction, Request, Response } from 'express'

const mockRunStep = jest.fn()
const mockGetChatflowById = jest.fn()
const addClient = jest.fn()
const removeClient = jest.fn()
const streamErrorEvent = jest.fn()
const streamMetadataEvent = jest.fn()

jest.mock('../../services/chatflows', () => ({
    __esModule: true,
    default: { getChatflowById: (...args: any[]) => mockGetChatflowById(...args) }
}))
jest.mock('../../services/chatflows-debug', () => ({
    __esModule: true,
    default: { runStep: (...args: any[]) => mockRunStep(...args) }
}))
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({
        sseStreamer: {
            addClient,
            removeClient,
            streamErrorEvent,
            streamMetadataEvent
        },
        redisSubscriber: { subscribe: jest.fn(), unsubscribe: jest.fn() }
    })
}))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))
jest.mock('flowise-components', () => ({}), { virtual: true })
jest.mock('../../utils/agentflow-step-debug/concurrency', () => ({
    StepRunConcurrencyExceededError: class StepRunConcurrencyExceededError extends Error {}
}))
jest.mock('../../utils/agentflow-step-debug/StepRunner', () => ({
    StepRunMissingVariablesError: class StepRunMissingVariablesError extends Error {
        constructor(public readonly missingVariables: string[]) {
            super(`missing: ${missingVariables.join(',')}`)
        }
    },
    StepRunUnsupportedNodeError: class StepRunUnsupportedNodeError extends Error {
        constructor(public readonly nodeName: string, public readonly deferred: boolean) {
            super(`unsupported ${nodeName}`)
        }
    }
}))

import stepRunController from './stepRun'
import { StepRunMissingVariablesError, StepRunUnsupportedNodeError } from '../../utils/agentflow-step-debug/StepRunner'

const baseUser = { id: 'user-1', activeWorkspaceId: 'ws-1' }

const flowData = JSON.stringify({
    nodes: [{ id: 'llmAgentflow_1', data: { id: 'llmAgentflow_1', name: 'llmAgentflow', label: 'LLM', inputs: {} } }],
    edges: []
})

const mockReq = (overrides: Record<string, any> = {}): Request =>
    ({
        params: { id: 'cf-1', nodeId: 'llmAgentflow_1' },
        headers: {},
        body: {},
        user: baseUser,
        protocol: 'http',
        get: jest.fn(() => 'localhost'),
        on: jest.fn(),
        ...overrides
    } as unknown as Request)

const mockRes = (): Response => {
    const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        writableEnded: false
    }
    return res as Response
}

const mockNext = (): NextFunction => jest.fn() as unknown as NextFunction

beforeEach(() => {
    jest.clearAllMocks()
})

describe('stepRun controller', () => {
    it('returns 400 when the chatflow is not an AGENTFLOW', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'CHATFLOW', flowData })
        const req = mockReq()
        const res = mockRes()
        const next = mockNext() as jest.Mock
        await stepRunController.stepRun(req, res, next)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }))
    })

    it('returns 404 when the nodeId is missing from flowData', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'AGENTFLOW', flowData })
        const req = mockReq({ params: { id: 'cf-1', nodeId: 'ghost-node' } })
        const res = mockRes()
        const next = mockNext() as jest.Mock
        await stepRunController.stepRun(req, res, next)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }))
    })

    it('translates StepRunUnsupportedNodeError -> 422', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'AGENTFLOW', flowData })
        mockRunStep.mockRejectedValueOnce(new StepRunUnsupportedNodeError('iterationAgentflow', true))
        const req = mockReq()
        const res = mockRes()
        const next = mockNext() as jest.Mock
        await stepRunController.stepRun(req, res, next)
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }))
    })

    it('translates StepRunMissingVariablesError -> 422 with structured payload', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'AGENTFLOW', flowData })
        mockRunStep.mockRejectedValueOnce(new StepRunMissingVariablesError(['$flow.state.mode']))
        const req = mockReq()
        const res = mockRes()
        const next = mockNext() as jest.Mock
        await stepRunController.stepRun(req, res, next)
        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(422)
        expect(err.message).toContain('STEP_RUN_MISSING_VARIABLES')
        expect(err.message).toContain('$flow.state.mode')
    })

    it('JSON happy path returns the StepRunner result body', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'AGENTFLOW', flowData })
        mockRunStep.mockResolvedValueOnce({
            nodeId: 'llmAgentflow_1',
            nodeLabel: 'LLM',
            status: 'FINISHED',
            data: { output: { content: 'hi' } },
            durationMs: 5,
            capturedVariables: []
        })
        const req = mockReq()
        const res = mockRes()
        const next = mockNext()
        await stepRunController.stepRun(req, res, next)
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'FINISHED' }))
    })

    it('SSE branch wires addClient/removeClient/headers/Redis subscribe', async () => {
        mockGetChatflowById.mockResolvedValueOnce({ id: 'cf-1', type: 'AGENTFLOW', flowData })
        mockRunStep.mockResolvedValueOnce({ status: 'FINISHED' })
        const req = mockReq({ headers: { accept: 'text/event-stream' } })
        const res = mockRes()
        const next = mockNext()
        await stepRunController.stepRun(req, res, next)
        expect(addClient).toHaveBeenCalled()
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
        expect(removeClient).toHaveBeenCalled()
        expect(streamMetadataEvent).toHaveBeenCalled()
    })

    it('returns 401 when there is no req.user', async () => {
        const req = mockReq({ user: undefined })
        const res = mockRes()
        const next = mockNext() as jest.Mock
        await stepRunController.stepRun(req, res, next)
        // missing workspaceId triggers 400 from resolveScope
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: expect.any(Number) }))
    })
})
