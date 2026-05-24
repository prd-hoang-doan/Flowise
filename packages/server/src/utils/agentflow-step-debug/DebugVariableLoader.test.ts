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
jest.mock('../../database/entities/ChatFlow', () => ({ ChatFlow: class ChatFlow {} }))
jest.mock('flowise-components', () => ({}), { virtual: true })

import { DebugVariableLoader } from './DebugVariableLoader'
import { DEBUG_NODE_SENTINELS } from '../../Interface'

describe('DebugVariableLoader', () => {
    it('translates scope -> sentinel nodeId in the where clause', async () => {
        const findOne = jest.fn(async () => ({ value: 'persisted' }))
        const ds = { getRepository: () => ({ findOne }) } as any
        const loader = new DebugVariableLoader(ds, { chatflowId: 'cf', workspaceId: 'ws', userId: 'u' })
        await loader.get('flow_state', 'mode')
        const calls = findOne.mock.calls as unknown as Array<Array<any>>
        const where = calls[0][0].where
        expect(where.nodeId.value).toBe(DEBUG_NODE_SENTINELS.FLOW_STATE)
        expect(where.name.value).toBe('mode')
        expect(where.chatflowId.value).toBe('cf')
        expect(where.workspaceId.value).toBe('ws')
        expect(where.userId.value).toBe('u')
    })

    it('requires an explicit nodeId for scope=node', async () => {
        const ds = { getRepository: () => ({ findOne: async () => null }) } as any
        const loader = new DebugVariableLoader(ds, { chatflowId: 'cf', workspaceId: 'ws', userId: 'u' })
        await expect(loader.get('node', 'someVar')).rejects.toThrow(/nodeId is required/)
    })

    it('returns undefined when no row exists', async () => {
        const ds = { getRepository: () => ({ findOne: async () => null }) } as any
        const loader = new DebugVariableLoader(ds, { chatflowId: 'cf', workspaceId: 'ws', userId: 'u' })
        expect(await loader.get('form', 'unknown')).toBeUndefined()
    })
})
