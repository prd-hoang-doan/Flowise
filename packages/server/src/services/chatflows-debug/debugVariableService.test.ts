jest.mock('typeorm', () => ({
    __esModule: true,
    Equal: (v: unknown) => ({ __equalsMarker: true, value: v }),
    In: (v: unknown[]) => ({ __inMarker: true, value: v }),
    LessThan: (v: unknown) => ({ __lessThanMarker: true, value: v }),
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
jest.mock('flowise-components', () => ({}), { virtual: true })

const stubAppDataSource = {
    getRepository: jest.fn()
}
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: stubAppDataSource })
}))

import { DebugVariable } from '../../database/entities/DebugVariable'
import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import debugVariableService from './debugVariableService'
import { DEBUG_NODE_SENTINELS } from '../../Interface'

const scope = { chatflowId: 'cf', workspaceId: 'ws', userId: 'user' }

describe('debugVariableService', () => {
    beforeEach(() => {
        stubAppDataSource.getRepository.mockReset()
    })

    it('list defers the value column via explicit select clause', async () => {
        const findMock = jest.fn(async () => [
            {
                id: '1',
                chatflowId: 'cf',
                workspaceId: 'ws',
                userId: 'user',
                nodeId: 'llmAgentflow_1',
                name: 'content',
                valueType: 'string',
                sizeBytes: 12,
                edited: false,
                visible: true,
                description: null,
                updatedDate: new Date()
            }
        ])
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariable ? { find: findMock } : null))
        const rows = await debugVariableService.list(scope)
        expect(rows).toHaveLength(1)
        expect(findMock).toHaveBeenCalledWith(expect.objectContaining({
            select: expect.arrayContaining(['valueType', 'sizeBytes'])
        }))
        expect(findMock).toHaveBeenCalledWith(expect.not.objectContaining({ select: expect.arrayContaining(['value']) }))
    })

    it('update flags edited=true and rejects oversize payloads with 413', async () => {
        const findOne = jest.fn(async () => ({
            id: 'var-1',
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodeId: 'llmAgentflow_1',
            name: 'content',
            valueType: 'string',
            editable: true,
            edited: false,
            visible: true,
            sizeBytes: 5,
            value: 'old'
        }))
        const save = jest.fn(async (r: any) => r)
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariable ? { findOne, save } : null))
        const updated = await debugVariableService.update(scope, 'var-1', { value: 'new!' })
        expect((updated as any).edited).toBe(true)
        expect(save).toHaveBeenCalled()

        const huge = 'x'.repeat(100 * 1024)
        await expect(debugVariableService.update(scope, 'var-1', { value: huge })).rejects.toMatchObject({
            statusCode: 413
        })
    })

    it('reset re-derives from the latest DebugNodeExecution and falls back to delete when none exists', async () => {
        const row = {
            id: 'var-1',
            chatflowId: 'cf',
            workspaceId: 'ws',
            userId: 'user',
            nodeId: 'llmAgentflow_1',
            name: 'content',
            valueType: 'string',
            value: 'edited',
            edited: true,
            sizeBytes: 6
        }
        const varRepo = { findOne: jest.fn(async () => row), save: jest.fn(async (r: any) => r), delete: jest.fn(async () => ({})) }
        const execRepo = {
            findOne: jest.fn(async () => ({
                data: { output: { content: 'last-run-value' } }
            }))
        }
        stubAppDataSource.getRepository.mockImplementation((cls: any) => {
            if (cls === DebugVariable) return varRepo
            if (cls === DebugNodeExecution) return execRepo
            return null
        })
        const result = await debugVariableService.reset(scope, 'var-1')
        expect((result as any).value).toBe('last-run-value')
        expect((result as any).edited).toBe(false)

        ;(execRepo.findOne as jest.Mock).mockResolvedValueOnce(null as any)
        const noSource = await debugVariableService.reset(scope, 'var-1')
        expect(noSource).toBeNull()
        expect(varRepo.delete).toHaveBeenCalled()
    })

    it('reset for sentinel rows reads from output.form/output.webhook/output.question', async () => {
        const cases: Array<[string, string, any, any]> = [
            [DEBUG_NODE_SENTINELS.FLOW_STATE, 'mode', { state: { mode: 'A' } }, 'A'],
            [DEBUG_NODE_SENTINELS.FORM, 'email', { output: { form: { email: 'x@y.z' } } }, 'x@y.z'],
            [DEBUG_NODE_SENTINELS.WEBHOOK, 'sig', { output: { webhook: { sig: 'abc' } } }, 'abc'],
            [DEBUG_NODE_SENTINELS.SYSTEM, 'question', { output: { question: 'hi' } }, 'hi']
        ]
        for (const [nodeId, name, data, expected] of cases) {
            const row = { id: '1', chatflowId: 'cf', workspaceId: 'ws', userId: 'user', nodeId, name, value: null }
            const varRepo = { findOne: jest.fn(async () => row), save: jest.fn(async (r: any) => r), delete: jest.fn() }
            const execRepo = { findOne: jest.fn(async () => ({ data })) }
            stubAppDataSource.getRepository.mockImplementation((cls: any) => {
                if (cls === DebugVariable) return varRepo
                if (cls === DebugNodeExecution) return execRepo
                return null
            })
            const out = await debugVariableService.reset(scope, '1')
            expect((out as any).value).toEqual(expected)
        }
    })

    it('wipe scopes the delete to (chatflow, workspace, user)', async () => {
        const del = jest.fn(async () => ({ affected: 3 }))
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugVariable ? { delete: del } : null))
        const result = await debugVariableService.wipe(scope)
        expect(result.deletedCount).toBe(3)
        const calls = del.mock.calls as unknown as Array<Array<any>>
        const callArg = calls[0][0]
        expect(callArg.chatflowId).toEqual(expect.objectContaining({ __equalsMarker: true, value: 'cf' }))
        expect(callArg.workspaceId).toEqual(expect.objectContaining({ __equalsMarker: true, value: 'ws' }))
        expect(callArg.userId).toEqual(expect.objectContaining({ __equalsMarker: true, value: 'user' }))
    })

    it('gc removes rows older than the TTL window', async () => {
        const stale = [{ id: 'a' }, { id: 'b' }]
        const find = jest.fn(async () => stale)
        const del = jest.fn(async () => ({ affected: 2 }))
        stubAppDataSource.getRepository.mockImplementation((cls: any) =>
            cls === DebugVariable ? { find, delete: del } : null
        )
        const out = await debugVariableService.gc({ idleDays: 1 })
        expect(out.deletedCount).toBe(2)
    })
})
