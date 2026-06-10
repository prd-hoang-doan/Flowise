import { StatusCodes } from 'http-status-codes'
import { DataSource, Equal, In } from 'typeorm'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { DebugVariableSnapshot } from '../../database/entities/DebugVariableSnapshot'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import {
    DEBUG_NODE_SENTINELS,
    ExecutionState,
    IDebugVariableSnapshot,
    IDebugVariableSnapshotEntry,
    IDebugVariableSnapshotPayload,
    IDebugVariableSnapshotRunArgs,
    IDebugVariableSnapshotSummary,
    IReactFlowEdge,
    IReactFlowNode
} from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { Variable } from '../../database/entities/Variable'
import { getWorkspaceSearchOptions } from '../../enterprise/utils/ControllerServiceUtils'
import { DebugVariablePool } from '../../utils/agentflow-step-debug/DebugVariablePool'

export interface SnapshotScope {
    chatflowId: string
    workspaceId: string
    userId: string
}

export interface CaptureArgs extends SnapshotScope {
    appDataSource: DataSource
    runId: string
    nodeId: string
    nodeLabel: string
    status: ExecutionState
    durationMs?: number | null
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    /** Subset of the original Step Run request body that produced this snapshot. */
    args?: {
        question?: string
        sessionId?: string
        inputs?: Record<string, unknown>
        form?: Record<string, unknown>
        webhook?: Record<string, unknown>
    }
}

export interface ListArgs extends SnapshotScope {
    limit?: number
    /** ISO timestamp — return entries strictly older than this. */
    before?: string
}

/**
 * Per-(chatflowId, workspaceId, userId) retention cap. Snapshots older than
 * the most recent N are evicted on each insert. 50 is generous for an
 * interactive debug session but small enough to keep the table tidy.
 */
export const DEBUG_SNAPSHOT_MAX_PER_SCOPE = Number(process.env.DEBUG_SNAPSHOT_MAX_PER_SCOPE) || 50

const summariseRunArgs = (args?: CaptureArgs['args']): IDebugVariableSnapshotRunArgs | null => {
    if (!args) return null
    const out: IDebugVariableSnapshotRunArgs = {}
    if (typeof args.question === 'string' && args.question.length > 0) out.question = args.question
    if (typeof args.sessionId === 'string' && args.sessionId.length > 0) out.sessionId = args.sessionId
    if (args.inputs && typeof args.inputs === 'object' && Object.keys(args.inputs).length > 0) out.hasInputs = true
    if (args.form && typeof args.form === 'object' && Object.keys(args.form).length > 0) out.hasForm = true
    if (args.webhook && typeof args.webhook === 'object' && Object.keys(args.webhook).length > 0) out.hasWebhook = true
    return Object.keys(out).length === 0 ? null : out
}

/**
 * Group every persisted DebugVariable into the denormalised payload the UI
 * consumes. Keyed by real nodeId or one of DEBUG_NODE_SENTINELS so the
 * frontend doesn't need a second lookup table.
 */
const groupByScope = (rows: DebugVariable[]): IDebugVariableSnapshotPayload => {
    const out: IDebugVariableSnapshotPayload = {}
    for (const row of rows) {
        const entry: IDebugVariableSnapshotEntry = {
            id: row.id,
            name: row.name,
            valueType: row.valueType,
            value: row.value,
            sizeBytes: row.sizeBytes,
            edited: row.edited,
            visible: row.visible
        }
        if (!out[row.nodeId]) out[row.nodeId] = []
        out[row.nodeId].push(entry)
    }
    return out
}

const countEntries = (payload: IDebugVariableSnapshotPayload): number => {
    let total = 0
    for (const list of Object.values(payload ?? {})) total += list.length
    return total
}

const toSummary = (row: DebugVariableSnapshot): IDebugVariableSnapshotSummary => ({
    id: row.id,
    runId: row.runId,
    nodeId: row.nodeId,
    nodeLabel: row.nodeLabel,
    status: row.status,
    durationMs: row.durationMs ?? null,
    missingVariableCount: Array.isArray(row.missingVariables) ? row.missingVariables.length : 0,
    variableCount: countEntries(row.variables ?? {}),
    runArgs: row.runArgs ?? null,
    createdDate: row.createdDate
})

/**
 * Drop snapshots beyond the retention cap, oldest-first. Uses ids rather
 * than `repo.delete({createdDate: ...})` so we don't accidentally remove
 * snapshots concurrently written by another in-flight Step Run.
 */
const enforceRetention = async (appDataSource: DataSource, scope: SnapshotScope, cap = DEBUG_SNAPSHOT_MAX_PER_SCOPE): Promise<void> => {
    if (cap <= 0) return
    const repo = appDataSource.getRepository(DebugVariableSnapshot)
    const rows = await repo.find({
        where: {
            chatflowId: Equal(scope.chatflowId),
            workspaceId: Equal(scope.workspaceId),
            userId: Equal(scope.userId)
        },
        select: ['id'],
        order: { createdDate: 'DESC' }
    })
    if (rows.length <= cap) return
    const toDelete = rows.slice(cap).map((r) => r.id)
    if (toDelete.length === 0) return
    await repo.delete({ id: In(toDelete) })
}

/**
 * Build a snapshot from the live DebugVariable rows and persist it. Designed
 * to be invoked from StepRunner immediately after `DebugVariableSaver.save()`
 * — by that point the saver has flushed every output the run produced, so a
 * single `find` against (chatflow, workspace, user) yields the post-run pool.
 *
 * `nodes` and `edges` are required so we can recompute the missingVariables
 * list using the same logic as `DebugVariablePool.computeMissingVariables`
 * (single source of truth — keeps the snapshot UI honest with what a real
 * Step Run would see).
 */
const captureFromCurrentState = async (args: CaptureArgs): Promise<IDebugVariableSnapshot> => {
    try {
        const { appDataSource } = args
        const debugVarRepo = appDataSource.getRepository(DebugVariable)
        const snapshotRepo = appDataSource.getRepository(DebugVariableSnapshot)
        const variableRepo = appDataSource.getRepository(Variable)

        const [rows, availableVariables] = await Promise.all([
            debugVarRepo.find({
                where: {
                    chatflowId: Equal(args.chatflowId),
                    workspaceId: Equal(args.workspaceId),
                    userId: Equal(args.userId)
                }
            }),
            variableRepo.findBy(getWorkspaceSearchOptions(args.workspaceId))
        ])

        const variables = groupByScope(rows)

        // Rebuild the runtime contexts that computeMissingVariables expects.
        // We re-derive instead of passing the request payload directly because
        // the post-save DebugVariable rows already carry the request overrides
        // (the saver writes them through), so reading from `variables` gives a
        // single, authoritative source.
        const flowState: Record<string, unknown> = {}
        const form: Record<string, unknown> = {}
        const webhook: Record<string, unknown> = {}
        const systemBag: Record<string, unknown> = {}
        const nodeRowsByNodeId = new Map<string, DebugVariable[]>()
        for (const row of rows) {
            switch (row.nodeId) {
                case DEBUG_NODE_SENTINELS.FLOW_STATE:
                    flowState[row.name] = row.value
                    break
                case DEBUG_NODE_SENTINELS.FORM:
                    form[row.name] = row.value
                    break
                case DEBUG_NODE_SENTINELS.WEBHOOK:
                    webhook[row.name] = row.value
                    break
                case DEBUG_NODE_SENTINELS.SYSTEM:
                    systemBag[row.name] = row.value
                    break
                case DEBUG_NODE_SENTINELS.CHAT_HISTORY:
                    break
                default: {
                    const bucket = nodeRowsByNodeId.get(row.nodeId) ?? []
                    bucket.push(row)
                    nodeRowsByNodeId.set(row.nodeId, bucket)
                }
            }
        }

        const missingVariables = DebugVariablePool.computeMissingVariables({
            nodes: args.nodes,
            edges: args.edges,
            targetNodeId: args.nodeId,
            flowState,
            form,
            webhook,
            systemBag,
            availableVariables,
            nodeRowsByNodeId
        })

        const snapshot = snapshotRepo.create({
            chatflowId: args.chatflowId,
            workspaceId: args.workspaceId,
            userId: args.userId,
            runId: args.runId,
            nodeId: args.nodeId,
            nodeLabel: args.nodeLabel,
            status: args.status,
            durationMs: args.durationMs ?? null,
            variables,
            missingVariables: missingVariables.length > 0 ? missingVariables : null,
            runArgs: summariseRunArgs(args.args)
        })
        const saved = await snapshotRepo.save(snapshot)

        // Best-effort retention enforcement — failures here must NOT propagate
        // because a missed retention pass is harmless (next run cleans up).
        try {
            await enforceRetention(appDataSource, args)
        } catch {
            /* ignore */
        }

        return saved
    } catch (err) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: debugVariableSnapshotService.capture - ${getErrorMessage(err)}`
        )
    }
}

const list = async (args: ListArgs): Promise<IDebugVariableSnapshotSummary[]> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariableSnapshot)
        const where: any = {
            chatflowId: Equal(args.chatflowId),
            workspaceId: Equal(args.workspaceId),
            userId: Equal(args.userId)
        }
        const rows = await repo.find({
            where,
            order: { createdDate: 'DESC' },
            // Defer `variables` (the heavy column) — the list endpoint should
            // be cheap enough to drive a timeline polling loop.
            select: [
                'id',
                'chatflowId',
                'workspaceId',
                'userId',
                'runId',
                'nodeId',
                'nodeLabel',
                'status',
                'durationMs',
                'missingVariables',
                'runArgs',
                'createdDate',
                'variables'
            ],
            take: Math.min(args.limit ?? 100, 200)
        })
        const filtered = args.before ? rows.filter((r) => r.createdDate < new Date(args.before as string)) : rows
        return filtered.map(toSummary)
    } catch (err) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: debugVariableSnapshotService.list - ${getErrorMessage(err)}`
        )
    }
}

const get = async (scope: SnapshotScope, snapshotId: string): Promise<DebugVariableSnapshot> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariableSnapshot)
        const row = await repo.findOne({
            where: {
                id: Equal(snapshotId),
                chatflowId: Equal(scope.chatflowId),
                workspaceId: Equal(scope.workspaceId),
                userId: Equal(scope.userId)
            }
        })
        if (!row) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `DebugVariableSnapshot ${snapshotId} not found`)
        return row
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: debugVariableSnapshotService.get - ${getErrorMessage(err)}`
        )
    }
}

const wipe = async (scope: SnapshotScope): Promise<{ deletedCount: number }> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariableSnapshot)
        const result = await repo.delete({
            chatflowId: Equal(scope.chatflowId) as any,
            workspaceId: Equal(scope.workspaceId) as any,
            userId: Equal(scope.userId) as any
        })
        return { deletedCount: result.affected ?? 0 }
    } catch (err) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: debugVariableSnapshotService.wipe - ${getErrorMessage(err)}`
        )
    }
}

export default {
    captureFromCurrentState,
    list,
    get,
    wipe,
    enforceRetention,
    DEBUG_SNAPSHOT_MAX_PER_SCOPE
}
