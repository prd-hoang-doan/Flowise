import { StatusCodes } from 'http-status-codes'
import { Equal, In, LessThan } from 'typeorm'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import debugVariableSnapshotService from './debugVariableSnapshotService'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { DEBUG_NODE_SENTINELS, DebugVariableScope, IDebugVariable, IDebugVariableSummary } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { DEBUG_VAR_INLINE_MAX_BYTES, DEBUG_VAR_TTL_DAYS } from '../../utils/agentflow-step-debug/constants'

export interface DebugVariableScopeArgs {
    chatflowId: string
    workspaceId: string
    userId: string
}

const inferValueType = (value: unknown): IDebugVariable['valueType'] => {
    if (Array.isArray(value)) return 'array'
    if (value === null || value === undefined) return 'json'
    switch (typeof value) {
        case 'string':
            return 'string'
        case 'number':
            return 'number'
        case 'boolean':
            return 'boolean'
        default:
            return 'json'
    }
}

const scopeOf = (nodeId: string): DebugVariableScope => {
    switch (nodeId) {
        case DEBUG_NODE_SENTINELS.FLOW_STATE:
            return 'flow_state'
        case DEBUG_NODE_SENTINELS.FORM:
            return 'form'
        case DEBUG_NODE_SENTINELS.WEBHOOK:
            return 'webhook'
        case DEBUG_NODE_SENTINELS.CHAT_HISTORY:
            return 'chat_history'
        case DEBUG_NODE_SENTINELS.SYSTEM:
            return 'system'
        default:
            return 'node'
    }
}

const toSummary = (row: DebugVariable): IDebugVariableSummary => ({
    id: row.id,
    scope: scopeOf(row.nodeId),
    nodeId: row.nodeId,
    name: row.name,
    valueType: row.valueType,
    edited: row.edited,
    visible: row.visible,
    sizeBytes: row.sizeBytes,
    isTruncated: false,
    description: row.description,
    updatedDate: row.updatedDate
})

/**
 * List all Debug Variables visible to a builder for a flow. Uses an explicit
 * `select` clause to defer the (potentially large) `value` column to the detail
 * endpoint, matching architecture §6.4.
 */
const list = async (scope: DebugVariableScopeArgs, nodeId?: string): Promise<IDebugVariableSummary[]> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const where: any = {
            chatflowId: Equal(scope.chatflowId),
            workspaceId: Equal(scope.workspaceId),
            userId: Equal(scope.userId)
        }
        if (nodeId) where.nodeId = Equal(nodeId)
        const rows = await repo.find({
            where,
            select: [
                'id',
                'chatflowId',
                'workspaceId',
                'userId',
                'nodeId',
                'name',
                'valueType',
                'sizeBytes',
                'edited',
                'visible',
                'description',
                'updatedDate'
            ],
            order: { nodeId: 'ASC', name: 'ASC' }
        })
        return rows.map(toSummary)
    } catch (err) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.list - ${getErrorMessage(err)}`)
    }
}

const get = async (scope: DebugVariableScopeArgs, varId: string): Promise<DebugVariable> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const row = await repo.findOne({
            where: {
                id: Equal(varId),
                chatflowId: Equal(scope.chatflowId),
                workspaceId: Equal(scope.workspaceId),
                userId: Equal(scope.userId)
            }
        })
        if (!row) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `DebugVariable ${varId} not found`)
        return row
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.get - ${getErrorMessage(err)}`)
    }
}

/**
 * Builder-driven override of a Debug Variable value. Flags `edited=true` so the
 * Inspector can render a "modified" badge that survives until the next Step Run
 * for this (nodeId, name) overwrites it.
 */
const update = async (
    scope: DebugVariableScopeArgs,
    varId: string,
    patch: { value?: unknown; visible?: boolean; description?: string | null }
): Promise<DebugVariable> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const row = await get(scope, varId)
        if (!row.editable) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, `DebugVariable ${varId} is not editable`)
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'value')) {
            const size = Buffer.byteLength(typeof patch.value === 'string' ? patch.value : JSON.stringify(patch.value ?? ''), 'utf8')
            if (size > DEBUG_VAR_INLINE_MAX_BYTES) {
                throw new InternalFlowiseError(
                    StatusCodes.REQUEST_TOO_LONG,
                    `DebugVariable '${row.name}' is ${size} bytes (cap=${DEBUG_VAR_INLINE_MAX_BYTES}). Reduce the payload or wait for V1.1 storage offload.`
                )
            }
            row.value = patch.value
            row.valueType = inferValueType(patch.value)
            row.sizeBytes = size
            row.edited = true
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'visible')) {
            row.visible = !!patch.visible
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
            row.description = patch.description ?? null
        }
        return await repo.save(row)
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.update - ${getErrorMessage(err)}`)
    }
}

/**
 * Reset a Debug Variable to the most recent run's value. Re-derives the value
 * from `DebugNodeExecution` so the builder can throw away a manual edit and
 * snap back to "what the last Step Run produced". When no source run exists,
 * the variable row is deleted entirely so the builder is forced to re-run.
 */
const reset = async (scope: DebugVariableScopeArgs, varId: string): Promise<DebugVariable | null> => {
    try {
        const appDataSource = getRunningExpressApp().AppDataSource
        const repo = appDataSource.getRepository(DebugVariable)
        const execRepo = appDataSource.getRepository(DebugNodeExecution)
        const row = await get(scope, varId)
        const lastRun = await execRepo.findOne({
            where: {
                chatflowId: Equal(scope.chatflowId),
                workspaceId: Equal(scope.workspaceId),
                userId: Equal(scope.userId),
                nodeId: Equal(row.nodeId)
            },
            order: { createdDate: 'DESC' }
        })

        const sourceValue = extractValueFromLastRun(lastRun, row.nodeId, row.name)
        if (sourceValue === undefined) {
            await repo.delete({ id: row.id })
            return null
        }
        const size = Buffer.byteLength(typeof sourceValue === 'string' ? sourceValue : JSON.stringify(sourceValue ?? ''), 'utf8')
        row.value = sourceValue
        row.valueType = inferValueType(sourceValue)
        row.sizeBytes = size
        row.edited = false
        return await repo.save(row)
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.reset - ${getErrorMessage(err)}`)
    }
}

const extractValueFromLastRun = (lastRun: DebugNodeExecution | null, nodeId: string, name: string): unknown => {
    if (!lastRun) return undefined
    const data = lastRun.data as any
    if (!data) return undefined
    if (nodeId === DEBUG_NODE_SENTINELS.FLOW_STATE) {
        return data?.state?.[name]
    }
    if (nodeId === DEBUG_NODE_SENTINELS.FORM) {
        return data?.output?.form?.[name]
    }
    if (nodeId === DEBUG_NODE_SENTINELS.WEBHOOK) {
        return data?.output?.webhook?.[name]
    }
    if (nodeId === DEBUG_NODE_SENTINELS.SYSTEM) {
        if (name === 'question') return data?.output?.question
        return undefined
    }
    if (nodeId === DEBUG_NODE_SENTINELS.CHAT_HISTORY) {
        return data?.chatHistory
    }
    return data?.output?.[name]
}

const remove = async (scope: DebugVariableScopeArgs, varId: string): Promise<void> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const row = await get(scope, varId)
        await repo.delete({ id: row.id })
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.remove - ${getErrorMessage(err)}`)
    }
}

/**
 * Wipe all of a builder's Debug Variables for a flow. Used by the Inspector's
 * "Clear debug state" affordance to start from a clean slate.
 */
const wipe = async (scope: DebugVariableScopeArgs): Promise<{ deletedCount: number }> => {
    try {
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const result = await repo.delete({
            chatflowId: Equal(scope.chatflowId) as any,
            workspaceId: Equal(scope.workspaceId) as any,
            userId: Equal(scope.userId) as any
        })
        // Snapshots reference the same (chatflow, workspace, user) tuple, so a
        // wipe must clear them too — otherwise the Variable Pool panel would
        // still display historical entries the user just asked us to forget.
        // Best-effort: a failure here should not block the primary wipe.
        try {
            await debugVariableSnapshotService.wipe(scope)
        } catch {
            /* ignore — snapshot wipe is auxiliary */
        }
        return { deletedCount: result.affected ?? 0 }
    } catch (err) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.wipe - ${getErrorMessage(err)}`)
    }
}

/**
 * GC entry. Drops Debug Variables whose `lastRunAt` is older than `idleDays`
 * (or whose `updatedDate` is older if `lastRunAt` was never set). Variables
 * created via PATCH only count from `updatedDate`.
 */
const gc = async (opts: { idleDays?: number } = {}): Promise<{ deletedCount: number }> => {
    try {
        const idleDays = opts.idleDays ?? DEBUG_VAR_TTL_DAYS
        const cutoff = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000)
        const repo = getRunningExpressApp().AppDataSource.getRepository(DebugVariable)
        const stale = await repo.find({
            where: [{ lastRunAt: LessThan(cutoff) }, { lastRunAt: null as any, updatedDate: LessThan(cutoff) } as any]
        })
        if (stale.length === 0) return { deletedCount: 0 }
        const result = await repo.delete({ id: In(stale.map((s) => s.id)) })
        return { deletedCount: result.affected ?? 0 }
    } catch (err) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: debugVariableService.gc - ${getErrorMessage(err)}`)
    }
}

export default {
    list,
    get,
    update,
    reset,
    remove,
    wipe,
    gc
}
