jest.mock('../../database/entities/DebugVariable', () => ({ DebugVariable: class DebugVariable {} }))
jest.mock('../../database/entities/DebugNodeExecution', () => ({ DebugNodeExecution: class DebugNodeExecution {} }))
jest.mock('../../database/entities/Variable', () => ({ Variable: class Variable {} }))
jest.mock('../../database/entities/ChatFlow', () => ({ ChatFlow: class ChatFlow {} }))
jest.mock('../../enterprise/utils/ControllerServiceUtils', () => ({
    getWorkspaceSearchOptions: (workspaceId: string) => ({ workspaceId })
}))
jest.mock('../buildAgentflow', () => ({
    __esModule: true,
    executeNode: jest.fn()
}))
jest.mock('../index', () => ({
    constructGraphs: jest.fn(() => ({ graph: {}, nodeDependencies: {} })),
    getAPIOverrideConfig: jest.fn(() => ({ nodeOverrides: {}, variableOverrides: [], apiOverrideStatus: false }))
}))
jest.mock('./DebugVariableSaver', () => {
    const actual = jest.requireActual('./DebugVariableSaver')
    return {
        ...actual,
        DebugVariableSaver: { save: jest.fn(async () => undefined) }
    }
})
jest.mock('../logger', () => ({ __esModule: true, default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }))
jest.mock('flowise-components', () => ({}), { virtual: true })

import { __resetStepRunSlots } from './concurrency'
import { StepRunner, StepRunMissingVariablesError, StepRunUnsupportedNodeError } from './StepRunner'
import { executeNode } from '../buildAgentflow'
import { DebugVariableSaver } from './DebugVariableSaver'

const mockedExecuteNode = executeNode as jest.Mock

const stubTelemetry = { sendTelemetry: jest.fn() } as any
const stubSseStreamer = {
    streamAgentFlowEvent: jest.fn(),
    streamNextAgentFlowEvent: jest.fn(),
    streamAgentFlowExecutedDataEvent: jest.fn()
} as any

const makeChatflow = (flowData: any) => ({ id: 'cf-1', flowData: JSON.stringify(flowData) } as any)

const buildArgs = (overrides: Record<string, any> = {}) => ({
    chatflowId: 'cf-1',
    nodeId: 'llmAgentflow_1',
    userId: 'user-1',
    workspaceId: 'ws-1',
    orgId: '',
    subscriptionId: '',
    productId: '',
    streaming: false,
    chatId: 'step:abc',
    baseURL: 'http://localhost',
    isInternal: true,
    ...overrides
})

const makeFlowData = () => ({
    nodes: [
        {
            id: 'llmAgentflow_1',
            data: { id: 'llmAgentflow_1', name: 'llmAgentflow', label: 'LLM', inputs: {} },
            position: { x: 0, y: 0 },
            type: 'agentFlow',
            positionAbsolute: { x: 0, y: 0 },
            z: 0,
            handleBounds: { source: [], target: [] },
            width: 100,
            height: 100,
            selected: false,
            dragging: false
        }
    ],
    edges: []
})

const baseAppDataSource = (() => {
    const debugRows: any[] = []
    return {
        getRepository: () => ({ find: async () => debugRows, findBy: async () => [], save: async (e: any) => e, create: (e: any) => e })
    } as any
})()

describe('StepRunner', () => {
    beforeEach(() => {
        __resetStepRunSlots()
        jest.clearAllMocks()
    })

    it('rejects deferred V1.1 node types with StepRunUnsupportedNodeError', async () => {
        const chatflow = makeChatflow({
            nodes: [
                {
                    id: 'iterationAgentflow_0',
                    data: { id: 'iterationAgentflow_0', name: 'iterationAgentflow', label: 'Iteration', inputs: {} }
                }
            ],
            edges: []
        })
        const runner = new StepRunner({
            chatflow,
            args: buildArgs({ nodeId: 'iterationAgentflow_0' }),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        await expect(runner.run()).rejects.toBeInstanceOf(StepRunUnsupportedNodeError)
    })

    it('rejects nodes outside STEP_RUN_ALLOWED_NODES', async () => {
        const chatflow = makeChatflow({
            nodes: [
                {
                    id: 'futureAgentflow_0',
                    data: { id: 'futureAgentflow_0', name: 'futureAgentflow', label: 'Future', inputs: {} }
                }
            ],
            edges: []
        })
        const runner = new StepRunner({
            chatflow,
            args: buildArgs({ nodeId: 'futureAgentflow_0' }),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        await expect(runner.run()).rejects.toBeInstanceOf(StepRunUnsupportedNodeError)
    })

    it('surfaces missing template variables before calling executeNode', async () => {
        const chatflow = makeChatflow({
            nodes: [
                {
                    id: 'llmAgentflow_1',
                    data: {
                        id: 'llmAgentflow_1',
                        name: 'llmAgentflow',
                        label: 'LLM',
                        inputs: { prompt: '{{ $flow.state.who }}' }
                    }
                }
            ],
            edges: []
        })
        const runner = new StepRunner({
            chatflow,
            args: buildArgs(),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        await expect(runner.run()).rejects.toBeInstanceOf(StepRunMissingVariablesError)
        expect(mockedExecuteNode).not.toHaveBeenCalled()
    })

    it('invokes executeNode with isRecursive=true and parentExecutionId=undefined on the happy path', async () => {
        const chatflow = makeChatflow(makeFlowData())
        const stubResult = { id: 'llmAgentflow_1', name: 'llmAgentflow', input: {}, output: { content: 'ok' } }
        mockedExecuteNode.mockResolvedValueOnce({ result: stubResult })
        const runner = new StepRunner({
            chatflow,
            args: buildArgs(),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        const out = await runner.run()
        expect(out.status).toBe('FINISHED')
        expect(out.data).toBe(stubResult)
        const callArgs = mockedExecuteNode.mock.calls[0][0]
        expect(callArgs.isRecursive).toBe(true)
        expect(callArgs.parentExecutionId).toBeUndefined()
        expect(DebugVariableSaver.save).toHaveBeenCalled()
        expect(stubSseStreamer.streamAgentFlowEvent).toHaveBeenCalledWith('step:abc', 'INPROGRESS')
        expect(stubSseStreamer.streamAgentFlowEvent).toHaveBeenCalledWith('step:abc', 'FINISHED')
    })

    it('maps Aborted exceptions to STOPPED status and does NOT save variables', async () => {
        const chatflow = makeChatflow(makeFlowData())
        mockedExecuteNode.mockRejectedValueOnce(new Error('Aborted'))
        const runner = new StepRunner({
            chatflow,
            args: buildArgs(),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        const out = await runner.run()
        expect(out.status).toBe('STOPPED')
        expect(DebugVariableSaver.save).not.toHaveBeenCalled()
    })

    it('maps other exceptions to ERROR status with data.error populated', async () => {
        const chatflow = makeChatflow(makeFlowData())
        mockedExecuteNode.mockRejectedValueOnce(new Error('boom'))
        const runner = new StepRunner({
            chatflow,
            args: buildArgs(),
            appDataSource: baseAppDataSource,
            componentNodes: {} as any,
            cachePool: {} as any,
            usageCacheManager: {} as any,
            telemetry: stubTelemetry,
            sseStreamer: stubSseStreamer
        })
        const out = await runner.run()
        expect(out.status).toBe('ERROR')
        expect((out.data as any).error).toBe('boom')
        expect(DebugVariableSaver.save).toHaveBeenCalled()
    })
})
