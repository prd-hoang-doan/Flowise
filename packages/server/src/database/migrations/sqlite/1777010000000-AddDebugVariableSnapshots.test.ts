/**
 * Migration shape test for the Debug Variable Pool snapshot table.
 *
 * Mirrors the per-driver shape test in 1777000000000-AddAgentflowDebugEntities.test.ts:
 * the global typeorm mock prevents a real round trip, so we use a fake
 * QueryRunner that records every emitted SQL string and assert on its
 * contents. Catches drift between the entity and the migration scripts
 * across postgres / sqlite / mysql / mariadb.
 */
import { AddDebugVariableSnapshots1777010000000 as Sqlite } from './1777010000000-AddDebugVariableSnapshots'
import { AddDebugVariableSnapshots1777010000000 as Postgres } from '../postgres/1777010000000-AddDebugVariableSnapshots'
import { AddDebugVariableSnapshots1777010000000 as Mysql } from '../mysql/1777010000000-AddDebugVariableSnapshots'
import { AddDebugVariableSnapshots1777010000000 as Mariadb } from '../mariadb/1777010000000-AddDebugVariableSnapshots'

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
])('AddDebugVariableSnapshots migration (%s)', (driver, MigrationCls) => {
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

    it(`${driver}: creates the debug_variable_snapshot table with the documented columns`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toContain('debug_variable_snapshot')
        for (const col of [
            'chatflowid',
            'workspaceid',
            'userid',
            'runid',
            'nodeid',
            'nodelabel',
            'status',
            'variables',
            'missingvariables',
            'runargs',
            'createddate'
        ]) {
            expect(sql).toContain(col)
        }
    })

    it(`${driver}: creates the composite scoping index ordered by createdDate`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toMatch(/idx_debug_variable_snapshot_scope/)
        // index covers (workspaceId, chatflowId, userId, createdDate) so list
        // queries can use a single seek per scope.
        expect(sql).toMatch(/workspaceid.*chatflowid.*userid.*createddate/s)
    })

    it(`${driver}: declares an ON DELETE CASCADE FK to chat_flow`, async () => {
        const sql = await join(MigrationCls)
        expect(sql).toMatch(/foreign key.*chatflowid.*chat_flow/s)
        expect(sql).toContain('on delete cascade')
    })

    it(`${driver}: down() drops the snapshot table`, async () => {
        const sql = await joinDown(MigrationCls)
        expect(sql).toMatch(/drop table.*debug_variable_snapshot/s)
    })
})
