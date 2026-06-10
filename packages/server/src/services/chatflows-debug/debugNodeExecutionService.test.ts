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
jest.mock('flowise-components', () => ({}), { virtual: true })

const stubAppDataSource = {
    getRepository: jest.fn()
}
jest.mock('../../utils/getRunningExpressApp', () => ({
    getRunningExpressApp: () => ({ AppDataSource: stubAppDataSource })
}))

import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import { DebugVariable } from '../../database/entities/DebugVariable'
import debugNodeExecutionService from './debugNodeExecutionService'

const scope = { chatflowId: 'cf', workspaceId: 'ws', userId: 'user' }

describe('debugNodeExecutionService', () => {
    beforeEach(() => {
        stubAppDataSource.getRepository.mockReset()
    })

    it('gc trims to keepLastN per (workspace, chatflow, user, nodeId)', async () => {
        const rowsDesc = [
            { id: '1', workspaceId: 'ws', chatflowId: 'cf', userId: 'u', nodeId: 'A' },
            { id: '2', workspaceId: 'ws', chatflowId: 'cf', userId: 'u', nodeId: 'A' },
            { id: '3', workspaceId: 'ws', chatflowId: 'cf', userId: 'u', nodeId: 'A' }, // over the limit (keepLastN=2)
            { id: '4', workspaceId: 'ws', chatflowId: 'cf', userId: 'u', nodeId: 'B' }
        ]
        const find = jest.fn(async () => rowsDesc)
        const execute = jest.fn(async () => ({ affected: 1 }))
        const createQueryBuilder = jest.fn(() => ({
            delete: () => ({ whereInIds: () => ({ execute }) })
        }))
        stubAppDataSource.getRepository.mockImplementation((cls: any) => (cls === DebugNodeExecution ? { find, createQueryBuilder } : null))
        const out = await debugNodeExecutionService.gc({ keepLastN: 2 })
        expect(out.deletedCount).toBe(1)
    })

    it('listVariablesForNode includes sentinel fan-out for startAgentflow runs', async () => {
        const findOne = jest.fn(async () => ({ data: { name: 'startAgentflow' } }))
        const varFind = jest.fn(async () => [])
        stubAppDataSource.getRepository.mockImplementation((cls: any) => {
            if (cls === DebugNodeExecution) return { findOne }
            if (cls === DebugVariable) return { find: varFind }
            return null
        })
        await debugNodeExecutionService.listVariablesForNode(scope, 'startAgentflow_0')
        // expect 4 list invocations: nodeId, __form__, __webhook__, __system__
        expect(varFind).toHaveBeenCalledTimes(4)
    })

    it('listVariablesForNode does NOT fan out for non-Start nodes', async () => {
        const findOne = jest.fn(async () => ({ data: { name: 'llmAgentflow' } }))
        const varFind = jest.fn(async () => [])
        stubAppDataSource.getRepository.mockImplementation((cls: any) => {
            if (cls === DebugNodeExecution) return { findOne }
            if (cls === DebugVariable) return { find: varFind }
            return null
        })
        await debugNodeExecutionService.listVariablesForNode(scope, 'llmAgentflow_1')
        expect(varFind).toHaveBeenCalledTimes(1)
    })
})
