import { StatusCodes } from 'http-status-codes'
import { Equal } from 'typeorm'
import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { DEBUG_NODE_SENTINELS, IDebugVariableSummary } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { DEBUG_NODE_EXEC_KEEP_LAST_N } from '../../utils/agentflow-step-debug/constants'
import debugVariableService, { DebugVariableScopeArgs } from './debugVariableService'

const getLastRun = async (scope: DebugVariableScopeArgs, nodeId: string): Promise<DebugNodeExecution | null> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugNodeExecution)
        return await repo.findOne({
            where: {
                chatflowId: Equal(scope.chatflowId),
                workspaceId: Equal(scope.workspaceId),
                userId: Equal(scope.userId),
                nodeId: Equal(nodeId)
            },
            order: { createdDate: 'DESC' }
        })
    } catch (err) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: debugNodeExecutionService.getLastRun - ${getErrorMessage(err)}`
        )
    }
}

/**
 * Convenience used by the "Last Step Run" tab of the Inspector. Combines the
 * node-scoped Debug Variables with any per-Start sentinel rows so the UI can
 * show "what this run produced" without two round-trips.
 */
const listVariablesForNode = async (scope: DebugVariableScopeArgs, nodeId: string): Promise<IDebugVariableSummary[]> => {
    const main = await debugVariableService.list(scope, nodeId)
    if (nodeId === '__all__') return main
    // For Start runs, surface the sentinel fan-out alongside the start node's
    // own outputs so the Inspector renders the full request envelope.
    const lastRun = await getLastRun(scope, nodeId)
    if (lastRun?.data && (lastRun.data as any)?.name === 'startAgentflow') {
        const sentinelRows = [
            ...(await debugVariableService.list(scope, DEBUG_NODE_SENTINELS.FORM)),
            ...(await debugVariableService.list(scope, DEBUG_NODE_SENTINELS.WEBHOOK)),
            ...(await debugVariableService.list(scope, DEBUG_NODE_SENTINELS.SYSTEM))
        ]
        return [...main, ...sentinelRows]
    }
    return main
}

/**
 * GC entry: trim to `keepLastN` rows per (workspace, chatflow, user, nodeId).
 * Uses a window function on Postgres / MySQL 8+ / SQLite 3.25+ / MariaDB 10.2+.
 */
const gc = async (opts: { keepLastN?: number } = {}): Promise<{ deletedCount: number }> => {
    try {
        const keepLastN = opts.keepLastN ?? DEBUG_NODE_EXEC_KEEP_LAST_N
        const appDataSource = getRunningExpressApp().AppDataSource
        // Driver-agnostic trim: pull rows, compute the cut-off per group in JS,
        // then delete by id. Slower than a window-function delete but portable
        // across postgres / mysql / mariadb / sqlite without driver-specific
        // SQL forks.
        const repo = appDataSource.getRepository(DebugNodeExecution)
        const all = await repo.find({
            select: ['id', 'chatflowId', 'workspaceId', 'userId', 'nodeId', 'createdDate'],
            order: { createdDate: 'DESC' }
        })
        const keyOf = (r: DebugNodeExecution) => `${r.workspaceId}:${r.chatflowId}:${r.userId}:${r.nodeId}`
        const groupCounts = new Map<string, number>()
        const toDelete: string[] = []
        for (const r of all) {
            const k = keyOf(r)
            const seen = groupCounts.get(k) ?? 0
            if (seen >= keepLastN) toDelete.push(r.id)
            groupCounts.set(k, seen + 1)
        }
        if (toDelete.length === 0) return { deletedCount: 0 }
        const result = await repo.createQueryBuilder().delete().whereInIds(toDelete).execute()
        return { deletedCount: result.affected ?? toDelete.length }
    } catch (err) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugNodeExecutionService.gc - ${getErrorMessage(err)}`)
    }
}

const wipe = async (scope: DebugVariableScopeArgs): Promise<{ deletedCount: number }> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugNodeExecution)
        const result = await repo.delete({
            chatflowId: Equal(scope.chatflowId) as any,
            workspaceId: Equal(scope.workspaceId) as any,
            userId: Equal(scope.userId) as any
        })
        return { deletedCount: result.affected ?? 0 }
    } catch (err) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugNodeExecutionService.wipe - ${getErrorMessage(err)}`)
    }
}

// Reference DebugVariable so TypeORM-style imports stay reachable for tests.
export type { DebugVariable }

export default {
    getLastRun,
    listVariablesForNode,
    gc,
    wipe
}
