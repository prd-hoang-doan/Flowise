jest.mock('../../database/entities/DebugVariable', () => ({ DebugVariable: class DebugVariable {} }))
jest.mock('../../database/entities/Variable', () => ({ Variable: class Variable {} }))
jest.mock('../../enterprise/utils/ControllerServiceUtils', () => ({
    getWorkspaceSearchOptions: (workspaceId: string) => ({ workspaceId })
}))
jest.mock('flowise-components', () => ({}), { virtual: true })

import { DebugVariablePool } from './DebugVariablePool'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { Variable } from '../../database/entities/Variable'
import { DEBUG_NODE_SENTINELS, IReactFlowEdge, IReactFlowNode } from '../../Interface'

const makeNode = (id: string, name: string, inputs: Record<string, any> = {}): IReactFlowNode =>
    ({
        id,
        data: { id, name, label: id, inputs } as any,
        position: { x: 0, y: 0 },
        type: 'agentFlow',
        positionAbsolute: { x: 0, y: 0 },
        z: 0,
        handleBounds: { source: [], target: [] },
        width: 200,
        height: 100,
        selected: false,
        dragging: false
    } as IReactFlowNode)

const makeEdge = (source: string, target: string): IReactFlowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: '',
    targetHandle: '',
    type: 'agentFlow',
    data: { label: '' }
})

const buildDataSource = (debugRows: any[], variables: any[]) => ({
    getRepository: (cls: any) => {
        if (cls === DebugVariable) return { find: async () => debugRows }
        if (cls === Variable) return { findBy: async () => variables }
        throw new Error(`unexpected repo: ${cls?.name}`)
    }
})

describe('DebugVariablePool', () => {
    it('fans sentinel rows into agentflowRuntime channels', async () => {
        const start = makeNode('startAgentflow_0', 'startAgentflow')
        const llm = makeNode('llmAgentflow_1', 'llmAgentflow', { content: 'hi' })
        const nodes = [start, llm]
        const edges = [makeEdge('startAgentflow_0', 'llmAgentflow_1')]
        const ds = buildDataSource(
            [
                { nodeId: DEBUG_NODE_SENTINELS.FLOW_STATE, name: 'foo', value: 'bar' },
                { nodeId: DEBUG_NODE_SENTINELS.FORM, name: 'email', value: 'a@b.com' },
                { nodeId: DEBUG_NODE_SENTINELS.WEBHOOK, name: 'headers', value: { 'x-trace': '1' } },
                { nodeId: DEBUG_NODE_SENTINELS.SYSTEM, name: 'question', value: 'hello' },
                { nodeId: 'startAgentflow_0', name: 'output', value: 'start-out' }
            ],
            []
        )
        const out = await DebugVariablePool.build({
            appDataSource: ds as any,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodes,
            edges,
            targetNodeId: 'llmAgentflow_1'
        })
        expect(out.agentflowRuntime.state).toEqual({ foo: 'bar' })
        expect(out.agentflowRuntime.form).toEqual({ email: 'a@b.com' })
        expect(out.agentflowRuntime.webhook).toEqual({ headers: { 'x-trace': '1' } })
        expect(out.agentFlowExecutedData).toHaveLength(1)
        expect(out.agentFlowExecutedData[0].nodeId).toBe('startAgentflow_0')
        expect((out.agentFlowExecutedData[0].data as any).output).toEqual({ output: 'start-out' })
    })

    it('request overrides take priority over persisted Debug Variable rows', async () => {
        const llm = makeNode('llmAgentflow_1', 'llmAgentflow')
        const ds = buildDataSource([{ nodeId: DEBUG_NODE_SENTINELS.FLOW_STATE, name: 'mode', value: 'persisted' }], [])
        const out = await DebugVariablePool.build({
            appDataSource: ds as any,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodes: [llm],
            edges: [],
            targetNodeId: 'llmAgentflow_1',
            requestInputs: { mode: 'override' }
        })
        expect(out.agentflowRuntime.state?.mode).toBe('override')
    })

    it('reports missing references across $vars, $flow.state, $form, $webhook and nodeId.output paths', async () => {
        const a = makeNode('llmAgentflow_a', 'llmAgentflow')
        const target = makeNode('llmAgentflow_b', 'llmAgentflow', {
            prompt: '{{ $vars.api_key }} / {{ $flow.state.mode }} / {{ $form.email }} / {{ $webhook.headers.x }} / {{ llmAgentflow_a.output.content }}'
        })
        const edges = [makeEdge('llmAgentflow_a', 'llmAgentflow_b')]
        const ds = buildDataSource([], [])
        const out = await DebugVariablePool.build({
            appDataSource: ds as any,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodes: [a, target],
            edges,
            targetNodeId: 'llmAgentflow_b'
        })
        expect(out.missingVariables.sort()).toEqual(
            ['$flow.state.mode', '$form.email', '$vars.api_key', '$webhook.headers.x', 'llmAgentflow_a.output.content'].sort()
        )
    })

    it('treats $question/$chat_history/$current_date_time/$loop_count as always-available', async () => {
        const target = makeNode('llmAgentflow_b', 'llmAgentflow', {
            prompt: '{{ $question }} {{ $chat_history }} {{ $current_date_time }} {{ $loop_count }}'
        })
        const ds = buildDataSource([], [])
        const out = await DebugVariablePool.build({
            appDataSource: ds as any,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodes: [target],
            edges: [],
            targetNodeId: 'llmAgentflow_b',
            requestQuestion: 'hi'
        })
        expect(out.missingVariables).toEqual([])
    })
})
