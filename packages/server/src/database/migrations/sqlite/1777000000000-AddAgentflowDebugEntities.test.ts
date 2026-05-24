/**
 * Migration shape test for the AgentFlow Step Debugger entities.
 *
 * The test harness mocks `typeorm` globally (see `__mocks__/typeorm.ts`) which
 * prevents a real in-memory sqlite round trip. Instead we verify the SQL that
 * the migration would emit via a fake QueryRunner that records every `query()`
 * call. This catches drift between the entity definitions and the migration
 * scripts (missing columns, missing indexes, dropped FK, etc).
 */
import { AddAgentflowDebugEntities1777000000000 as Sqlite } from './1777000000000-AddAgentflowDebugEntities'
import { AddAgentflowDebugEntities1777000000000 as Postgres } from '../postgres/1777000000000-AddAgentflowDebugEntities'
import { AddAgentflowDebugEntities1777000000000 as Mysql } from '../mysql/1777000000000-AddAgentflowDebugEntities'
import { AddAgentflowDebugEntities1777000000000 as Mariadb } from '../mariadb/1777000000000-AddAgentflowDebugEntities'

const fakeQR = () => {
    const calls: string[] = []
    return {
        calls,
        query: jest.fn(async (sql: string) => {
            calls.push(sql)
        })
    } as any
}

describe.each([
    ['sqlite', Sqlite],
    ['postgres', Postgres],
    ['mysql', Mysql],
    ['mariadb', Mariadb]
])('AddAgentflowDebugEntities migration (%s)', (driver, MigrationCls) => {
    const join = async (cls: any): Promise<string> => {
        const qr = fakeQR()
        await new cls().up(qr)
        return qr.calls.join('\n').toLowerCase()
    }

    const joinDown = async (cls: any): Promise<string> => {
        const qr = fakeQR()
        await new cls().down(qr)
        return qr.calls.join('\n').toLowerCase()
    }

    it(`${driver}: creates both tables with the documented columns`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toContain('debug_variable')
        expect(sql).toContain('debug_node_execution')
        // Mandatory columns from the architecture doc
        for (const col of [
            'chatflowid',
            'workspaceid',
            'userid',
            'nodeid',
            'name',
            'valuetype',
            'value',
            'sizebytes',
            'edited',
            'visible',
            'editable'
        ]) {
            expect(sql).toContain(col)
        }
    })

    it(`${driver}: creates the composite scoping index and unique constraint`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toMatch(/idx_debug_variable_scope/)
        expect(sql).toMatch(/uq_debug_variable_scope/)
        expect(sql).toMatch(/idx_debug_node_execution_scope/)
    })

    it(`${driver}: declares an ON DELETE CASCADE FK to chat_flow`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toMatch(/foreign key.*chatflowid.*chat_flow/s)
        expect(sql).toContain('on delete cascade')
    })

    it(`${driver}: down() drops both tables`, async () => {
        const sql = await joinDown(MigrationCls)
        expect(sql).toMatch(/drop table.*debug_node_execution/s)
        expect(sql).toMatch(/drop table.*debug_variable/s)
    })
})
