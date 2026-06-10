jest.mock('typeorm', () => ({
    __esModule: true,
    Equal: (v: unknown) => ({ __equalsMarker: true, value: v }),
    In: (vs: unknown[]) => ({ __inMarker: true, value: vs }),
    LessThan: (v: unknown) => ({ __ltMarker: true, value: v }),
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
jest.mock('../../database/entities/DebugVariableSnapshot', () => ({ DebugVariableSnapshot: class DebugVariableSnapshot {} }))
jest.mock('../../database/entities/Variable', () => ({ Variable: class Variable {} }))
jest.mock('../../database/entities/ChatFlow', () => ({ ChatFlow: class ChatFlow {} }))
jest.mock('flowise-components', () => ({}), { virtual: true })

// The pool re-uses Variable / DebugVariable entity imports; stub the public
// API surface we exercise so we don't have to wire the real impl.
jest.mock('../../utils/agentflow-step-debug/DebugVariablePool', () => ({
    DebugVariablePool: {
        computeMissingVariables: jest.fn(() => [])
    }
}))

jest.mock('../../enterprise/utils/ControllerServiceUtils', () => ({
    getWorkspaceSearchOptions: () => ({})
}))

const stubAppDataSource = {
    getRepository: jest.fn()
}
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: stubAppDataSource })
}))

import { DebugVariableSnapshot } from '../../database/entities/DebugVariableSnapshot'
import service from './debugVariableSnapshotService'

const scope = { chatflowId: 'cf', workspaceId: 'ws', userId: 'user' }

const makeDataSource = (overrides: Partial<Record<string, any>>) => {
    const ds: any = {
        getRepository: jest.fn((cls: any) => overrides[cls?.name ?? cls] ?? null)
    }
    return ds
}

describe('debugVariableSnapshotService.captureFromCurrentState', () => {
    it('groups rows by nodeId + sentinels and persists a denormalised payload', async () => {
        const debugVarRows = [
            {
                id: 'v1',
                nodeId: 'llmAgentflow_1',
                name: 'content',
                valueType: 'string',
                value: 'hi',
                sizeBytes: 2,
                edited: false,
                visible: true
            },
            {
                id: 'v2',
                nodeId: '__flow_state__',
                name: 'mode',
                valueType: 'string',
                value: 'pro',
                sizeBytes: 3,
                edited: true,
                visible: true
            },
            { id: 'v3', nodeId: '__form__', name: 'topic', valueType: 'string', value: 'cats', sizeBytes: 4, edited: false, visible: true },
            {
                id: 'v4',
                nodeId: '__system__',
                name: 'question',
                valueType: 'string',
                value: 'q?',
                sizeBytes: 2,
                edited: false,
                visible: true
            }
        ]
        const debugVarFind = jest.fn(async () => debugVarRows)
        const variableFindBy = jest.fn(async () => [])
        const saveSpy = jest.fn(async (s: any) => ({ ...s, id: 'snap-1', createdDate: new Date() }))
        const create = jest.fn((row: any) => row)
        const snapshotFind = jest.fn(async () => [{ id: 'snap-1' }])
        const snapshotDelete = jest.fn(async () => ({}))

        const ds = makeDataSource({
            DebugVariable: { find: debugVarFind },
            Variable: { findBy: variableFindBy },
            DebugVariableSnapshot: { create, save: saveSpy, find: snapshotFind, delete: snapshotDelete }
        })

        const result = await service.captureFromCurrentState({
            appDataSource: ds,
            ...scope,
            runId: 'run-1',
            nodeId: 'llmAgentflow_1',
            nodeLabel: 'LLM',
            status: 'FINISHED',
            durationMs: 12,
            nodes: [],
            edges: [],
            args: { question: 'q?', inputs: { x: 1 } }
        })

        expect(create).toHaveBeenCalledTimes(1)
        const created = create.mock.calls[0][0]
        expect(created.runId).toBe('run-1')
        expect(created.nodeId).toBe('llmAgentflow_1')
        expect(created.status).toBe('FINISHED')
        expect(created.variables.llmAgentflow_1).toHaveLength(1)
        expect(created.variables.__flow_state__).toHaveLength(1)
        expect(created.variables.__form__).toHaveLength(1)
        expect(created.variables.__system__).toHaveLength(1)
        expect(created.runArgs).toEqual({ question: 'q?', hasInputs: true })
        expect(result.id).toBe('snap-1')
    })

    it('omits empty / falsy runArgs entries', async () => {
        const ds = makeDataSource({
            DebugVariable: { find: jest.fn(async () => []) },
            Variable: { findBy: jest.fn(async () => []) },
            DebugVariableSnapshot: {
                create: jest.fn((s: any) => s),
                save: jest.fn(async (s: any) => ({ ...s, id: 'snap-2', createdDate: new Date() })),
                find: jest.fn(async () => [{ id: 'snap-2' }]),
                delete: jest.fn(async () => ({}))
            }
        })

        const result = await service.captureFromCurrentState({
            appDataSource: ds,
            ...scope,
            runId: 'r',
            nodeId: 'n',
            nodeLabel: 'L',
            status: 'FINISHED',
            nodes: [],
            edges: [],
            args: { question: '', inputs: {} }
        })

        // create() invocation should have null runArgs since all fields stripped
        const created = (ds.getRepository(DebugVariableSnapshot).create as jest.Mock).mock.calls[0][0]
        expect(created.runArgs).toBeNull()
        expect(result.id).toBe('snap-2')
    })

    it('does not throw if retention enforcement fails', async () => {
        const failingFind = jest.fn(async () => {
            throw new Error('boom')
        })
        const ds = makeDataSource({
            DebugVariable: { find: jest.fn(async () => []) },
            Variable: { findBy: jest.fn(async () => []) },
            DebugVariableSnapshot: {
                create: jest.fn((s: any) => s),
                save: jest.fn(async (s: any) => ({ ...s, id: 'snap-3', createdDate: new Date() })),
                find: failingFind,
                delete: jest.fn(async () => ({}))
            }
        })

        const out = await service.captureFromCurrentState({
            appDataSource: ds,
            ...scope,
            runId: 'r',
            nodeId: 'n',
            nodeLabel: 'L',
            status: 'FINISHED',
            nodes: [],
            edges: []
        })
        expect(out.id).toBe('snap-3')
    })
})

describe('debugVariableSnapshotService.enforceRetention', () => {
    it('evicts oldest rows beyond the cap', async () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}` }))
        const find = jest.fn(async () => rows)
        const del = jest.fn(async () => ({ affected: 2 }))
        const ds = makeDataSource({
            DebugVariableSnapshot: { find, delete: del }
        })
        await service.enforceRetention(ds, scope, 3)
        expect(del).toHaveBeenCalledTimes(1)
        const calls = del.mock.calls as unknown as Array<Array<any>>
        const arg = calls[0]![0]
        expect(arg.id.__inMarker).toBe(true)
        expect(arg.id.value).toEqual(['id-3', 'id-4'])
    })

    it('no-op when within the cap', async () => {
        const rows = [{ id: 'id-0' }]
        const find = jest.fn(async () => rows)
        const del = jest.fn(async () => ({ affected: 0 }))
        const ds = makeDataSource({
            DebugVariableSnapshot: { find, delete: del }
        })
        await service.enforceRetention(ds, scope, 5)
        expect(del).not.toHaveBeenCalled()
    })

    it('no-op when cap <= 0', async () => {
        const find = jest.fn(async () => [{ id: 'x' }])
        const del = jest.fn(async () => ({ affected: 0 }))
        const ds = makeDataSource({
            DebugVariableSnapshot: { find, delete: del }
        })
        await service.enforceRetention(ds, scope, 0)
        expect(find).not.toHaveBeenCalled()
        expect(del).not.toHaveBeenCalled()
    })
})

describe('debugVariableSnapshotService.list / get / wipe', () => {
    beforeEach(() => stubAppDataSource.getRepository.mockReset())

    it('list returns toSummary rows ordered newest first', async () => {
        const rows = [
            {
                id: 's1',
                runId: 'r1',
                nodeId: 'n',
                nodeLabel: 'L',
                status: 'FINISHED',
                durationMs: 10,
                missingVariables: ['$flow.state.x'],
                runArgs: null,
                createdDate: new Date(2026, 0, 2),
                variables: { n: [{ name: 'a' }, { name: 'b' }] }
            },
            {
                id: 's2',
                runId: 'r2',
                nodeId: 'n',
                nodeLabel: 'L',
                status: 'FINISHED',
                durationMs: 11,
                missingVariables: null,
                runArgs: null,
                createdDate: new Date(2026, 0, 1),
                variables: {}
            }
        ]
        const find = jest.fn(async () => rows)
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariableSnapshot ? { find } : null))
        const out = await service.list(scope)
        expect(out).toEqual([
            expect.objectContaining({ id: 's1', missingVariableCount: 1, variableCount: 2 }),
            expect.objectContaining({ id: 's2', missingVariableCount: 0, variableCount: 0 })
        ])
    })

    it('get throws 404 when not found', async () => {
        const findOne = jest.fn(async () => null)
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariableSnapshot ? { findOne } : null))
        await expect(service.get(scope, 'missing')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('wipe calls repo.delete with the scope', async () => {
        const del = jest.fn(async () => ({ affected: 3 }))
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariableSnapshot ? { delete: del } : null))
        const out = await service.wipe(scope)
        expect(out.deletedCount).toBe(3)
    })
})
