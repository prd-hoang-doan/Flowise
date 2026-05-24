jest.mock('typeorm', () => ({
    __esModule: true,
    Equal: (v: unknown) => ({ __equalsMarker: true, value: v }),
    Column: () => () => undefined,
    CreateDateColumn: () => () => undefined,
    UpdateDateColumn: () => () => undefined,
    PrimaryGeneratedColumn: () => () => undefined,
    Entity: () => () => undefined,
    Index: () => () => undefined,
    Unique: () => () => undefined,
    ManyToOne: () => () => undefined,
    JoinColumn: () => () => undefined,
    DataSource: class DataSource {}
}))
jest.mock('../../database/entities/DebugVariable', () => ({ DebugVariable: class DebugVariable {} }))
jest.mock('../../database/entities/DebugNodeExecution', () => ({ DebugNodeExecution: class DebugNodeExecution {} }))
jest.mock('../../database/entities/ChatFlow', () => ({ ChatFlow: class ChatFlow {} }))
jest.mock('../logger', () => ({ __esModule: true, default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }))
jest.mock('flowise-components', () => ({}), { virtual: true })

import { DebugVariableSaver, DebugVariableTooLargeError } from './DebugVariableSaver'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import { DEBUG_NODE_SENTINELS, IReactFlowNode } from '../../Interface'

type Row = Record<string, any>

const makeFakeRepo = (entityClass: any) => {
    const rows: Row[] = []
    return {
        rows,
        findOne: jest.fn(async ({ where }) => {
            const unwrap = (v: any) => (v && typeof v === 'object' && '__equalsMarker' in v ? v.value : v)
            return (
                rows.find((r) =>
                    Object.entries(where).every(([k, v]) => r[k] === unwrap(v))
                ) ?? null
            )
        }),
        save: jest.fn(async (row: Row) => {
            const found = rows.find((r) => r === row)
            if (!found) rows.push(row)
            return row
        }),
        create: jest.fn((data: Row) => ({ ...data })),
        _entityClass: entityClass
    }
}

const makeDataSource = () => {
    const debugVarRepo = makeFakeRepo(DebugVariable)
    const debugExecRepo = makeFakeRepo(DebugNodeExecution)
    const getRepository = jest.fn((cls: any) => {
        if (cls === DebugVariable) return debugVarRepo as any
        if (cls === DebugNodeExecution) return debugExecRepo as any
        throw new Error(`unexpected repo lookup: ${cls?.name}`)
    })
    return { dataSource: { getRepository } as any, debugVarRepo, debugExecRepo }
}

const llmNode: IReactFlowNode = {
    id: 'llmAgentflow_1',
    data: { id: 'llmAgentflow_1', name: 'llmAgentflow', label: 'Friendly LLM' } as any,
    position: { x: 0, y: 0 },
    type: 'agentFlow',
    positionAbsolute: { x: 0, y: 0 },
    z: 0,
    handleBounds: { source: [], target: [] },
    width: 200,
    height: 100,
    selected: false,
    dragging: false
}

const startNode: IReactFlowNode = {
    ...llmNode,
    id: 'startAgentflow_0',
    data: { id: 'startAgentflow_0', name: 'startAgentflow', label: 'Start' } as any
}

describe('DebugVariableSaver', () => {
    it('persists per-node outputs and skips EXCLUDED_OUTPUT_KEYS', async () => {
        const { dataSource, debugVarRepo, debugExecRepo } = makeDataSource()
        await DebugVariableSaver.save({
            appDataSource: dataSource,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            reactFlowNode: llmNode,
            nodeLabel: 'Friendly LLM',
            status: 'FINISHED',
            durationMs: 42,
            nodeData: {
                id: 'llmAgentflow_1',
                name: 'llmAgentflow',
                input: {},
                output: {
                    content: 'hello world',
                    timeMetadata: { ms: 100 }, // excluded
                    usageMetadata: { tokens: 42 } // excluded
                },
                state: { lastModel: 'gpt-4o' }
            } as any
        })
        const names = debugVarRepo.rows.map((r) => r.name).sort()
        expect(names).toEqual(['content', 'lastModel'])
        expect(debugExecRepo.rows).toHaveLength(1)
        expect(debugExecRepo.rows[0].status).toBe('FINISHED')
    })

    it('fans Start-node output out to __form__, __webhook__, __system__ sentinels', async () => {
        const { dataSource, debugVarRepo } = makeDataSource()
        await DebugVariableSaver.save({
            appDataSource: dataSource,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            reactFlowNode: startNode,
            nodeLabel: 'Start',
            status: 'FINISHED',
            durationMs: 5,
            nodeData: {
                id: 'startAgentflow_0',
                name: 'startAgentflow',
                input: {},
                output: {
                    form: { email: 'a@b.com' },
                    webhook: { headers: { 'x-trace': '1' } },
                    question: 'hi there'
                }
            } as any
        })
        const byNode = (id: string) => debugVarRepo.rows.filter((r) => r.nodeId === id).map((r) => r.name).sort()
        expect(byNode(DEBUG_NODE_SENTINELS.FORM)).toEqual(['email'])
        expect(byNode(DEBUG_NODE_SENTINELS.WEBHOOK)).toEqual(['headers'])
        expect(byNode(DEBUG_NODE_SENTINELS.SYSTEM)).toEqual(['question'])
    })

    it('skips variable persistence for iteration/loop children but still records the run', async () => {
        const { dataSource, debugVarRepo, debugExecRepo } = makeDataSource()
        const child: IReactFlowNode = { ...llmNode, parentNode: 'iterationAgentflow_0' }
        await DebugVariableSaver.save({
            appDataSource: dataSource,
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            reactFlowNode: child,
            nodeLabel: 'Child LLM',
            status: 'FINISHED',
            durationMs: 5,
            nodeData: { id: child.id, name: 'llmAgentflow', input: {}, output: { content: 'ignored' } } as any
        })
        expect(debugVarRepo.rows).toHaveLength(0)
        expect(debugExecRepo.rows).toHaveLength(1)
    })

    it('throws DebugVariableTooLargeError when a single output exceeds the cap', async () => {
        const { dataSource } = makeDataSource()
        const huge = 'x'.repeat(100 * 1024)
        await expect(
            DebugVariableSaver.save({
                appDataSource: dataSource,
                chatflowId: 'cf',
                workspaceId: 'ws',
                userId: 'user',
                reactFlowNode: llmNode,
                nodeLabel: 'L',
                status: 'FINISHED',
                durationMs: 1,
                nodeData: { id: 'x', name: 'llmAgentflow', input: {}, output: { big: huge } } as any
            })
        ).rejects.toBeInstanceOf(DebugVariableTooLargeError)
    })
})
