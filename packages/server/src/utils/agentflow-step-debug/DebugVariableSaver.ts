import { DataSource, Equal } from 'typeorm'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { DebugNodeExecution } from '../../database/entities/DebugNodeExecution'
import { INodeExecutionData } from 'flowise-components'
import { DEBUG_NODE_SENTINELS, DebugVariableValueType, ExecutionState, IReactFlowNode } from '../../Interface'
import { DEBUG_VAR_INLINE_MAX_BYTES, EXCLUDED_OUTPUT_KEYS } from './constants'

export class DebugVariableTooLargeError extends Error {
    constructor(public readonly varName: string, public readonly sizeBytes: number) {
        super(`Debug variable '${varName}' exceeds the inline cap (${sizeBytes} bytes > ${DEBUG_VAR_INLINE_MAX_BYTES})`)
        this.name = 'DebugVariableTooLargeError'
    }
}

export interface SaverArgs {
    appDataSource: DataSource
    chatflowId: string
    workspaceId: string
    userId: string
    reactFlowNode: IReactFlowNode
    nodeLabel: string
    status: ExecutionState
    durationMs: number
    nodeData: INodeExecutionData
}

const inferValueType = (value: unknown): DebugVariableValueType => {
    if (Array.isArray(value)) return 'array'
    if (value === null || value === undefined) return 'json'
    switch (typeof value) {
        case 'string':
            return 'string'
        case 'number':
            return 'number'
        case 'boolean':
            return 'boolean'
        case 'object':
            return 'json'
        default:
            return 'json'
    }
}

const sizeOf = (value: unknown): number => {
    if (value === null || value === undefined) return 0
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
    try {
        return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
    } catch {
        return 0
    }
}

const guardSize = (name: string, value: unknown): number => {
    const size = sizeOf(value)
    if (size > DEBUG_VAR_INLINE_MAX_BYTES) {
        throw new DebugVariableTooLargeError(name, size)
    }
    return size
}

/**
 * Persist a Step Run's outputs and Flow State mutations as Debug Variables, and
 * record the run itself in `DebugNodeExecution`. Mirrors the per-node "what just
 * happened" surface from `executeAgentFlow` but routes the data into the
 * per-builder Debug Variable namespace instead of the workspace-shared
 * `Execution` table.
 *
 * Iteration / Loop *child* nodes never write here — the parent owns their scope.
 */
export class DebugVariableSaver {
    static async save(args: SaverArgs): Promise<void> {
        const { appDataSource, chatflowId, workspaceId, userId, reactFlowNode, nodeLabel, status, durationMs, nodeData } = args
        const nodeId = reactFlowNode.id

        // Iteration / Loop child nodes inherit their parent's debug scope; the
        // parent run already captured the iteration's collated output via
        // executeNode's normal flow.
        if (reactFlowNode.parentNode) {
            await this.recordRun({ appDataSource, chatflowId, workspaceId, userId, nodeId, nodeLabel, nodeData, status, durationMs })
            return
        }

        const debugVarRepo = appDataSource.getRepository(DebugVariable)
        const now = new Date()

        // 1. Per-node outputs → real `nodeId`. Skip metadata-only keys so the
        //    debugger stays focused on what the builder actually reads in
        //    template references.
        if (nodeData?.output && typeof nodeData.output === 'object' && !Array.isArray(nodeData.output)) {
            for (const [name, value] of Object.entries(nodeData.output as Record<string, unknown>)) {
                if (EXCLUDED_OUTPUT_KEYS.has(name)) continue
                if (value === undefined) continue
                const sizeBytes = guardSize(name, value)
                await this.upsertVariable(debugVarRepo, {
                    chatflowId,
                    workspaceId,
                    userId,
                    nodeId,
                    name,
                    value,
                    valueType: inferValueType(value),
                    sizeBytes,
                    editable: true,
                    visible: true,
                    edited: false,
                    lastRunAt: now
                })
            }
        }

        // 2. Flow State mutations → '__flow_state__'. Captures `state` writes
        //    that nodes like LLM/Tool/CustomFunction/Loop emit via
        //    `updateFlowState`.
        if (nodeData?.state && typeof nodeData.state === 'object' && !Array.isArray(nodeData.state)) {
            for (const [name, value] of Object.entries(nodeData.state as Record<string, unknown>)) {
                if (value === undefined) continue
                const sizeBytes = guardSize(name, value)
                await this.upsertVariable(debugVarRepo, {
                    chatflowId,
                    workspaceId,
                    userId,
                    nodeId: DEBUG_NODE_SENTINELS.FLOW_STATE,
                    name,
                    value,
                    valueType: inferValueType(value),
                    sizeBytes,
                    editable: true,
                    visible: true,
                    edited: false,
                    lastRunAt: now
                })
            }
        }

        // 3. Start-node fan-out → '__form__', '__webhook__', '__system__'.
        //    These surface the request envelope the Start node observed so
        //    downstream nodes can be step-run with the same context.
        if (reactFlowNode.data?.name === 'startAgentflow' && nodeData?.output && typeof nodeData.output === 'object') {
            const out = nodeData.output as Record<string, unknown>
            if (out.form && typeof out.form === 'object' && !Array.isArray(out.form)) {
                for (const [name, value] of Object.entries(out.form as Record<string, unknown>)) {
                    if (value === undefined) continue
                    const sizeBytes = guardSize(name, value)
                    await this.upsertVariable(debugVarRepo, {
                        chatflowId,
                        workspaceId,
                        userId,
                        nodeId: DEBUG_NODE_SENTINELS.FORM,
                        name,
                        value,
                        valueType: inferValueType(value),
                        sizeBytes,
                        editable: true,
                        visible: true,
                        edited: false,
                        lastRunAt: now
                    })
                }
            }
            if (out.webhook && typeof out.webhook === 'object' && !Array.isArray(out.webhook)) {
                for (const [name, value] of Object.entries(out.webhook as Record<string, unknown>)) {
                    if (value === undefined) continue
                    const sizeBytes = guardSize(name, value)
                    await this.upsertVariable(debugVarRepo, {
                        chatflowId,
                        workspaceId,
                        userId,
                        nodeId: DEBUG_NODE_SENTINELS.WEBHOOK,
                        name,
                        value,
                        valueType: inferValueType(value),
                        sizeBytes,
                        editable: true,
                        visible: true,
                        edited: false,
                        lastRunAt: now
                    })
                }
            }
            if (typeof out.question === 'string') {
                const sizeBytes = guardSize('question', out.question)
                await this.upsertVariable(debugVarRepo, {
                    chatflowId,
                    workspaceId,
                    userId,
                    nodeId: DEBUG_NODE_SENTINELS.SYSTEM,
                    name: 'question',
                    value: out.question,
                    valueType: 'string',
                    sizeBytes,
                    editable: true,
                    visible: true,
                    edited: false,
                    lastRunAt: now
                })
            }
        }

        // 4. Track the run itself.
        await this.recordRun({ appDataSource, chatflowId, workspaceId, userId, nodeId, nodeLabel, nodeData, status, durationMs })
    }

    private static async upsertVariable(
        repo: ReturnType<DataSource['getRepository']>,
        row: {
            chatflowId: string
            workspaceId: string
            userId: string
            nodeId: string
            name: string
            value: unknown
            valueType: DebugVariableValueType
            sizeBytes: number
            editable: boolean
            visible: boolean
            edited: boolean
            lastRunAt: Date
        }
    ): Promise<void> {
        // Conditional upsert keyed on the composite uniqueness contract.
        // Doing a manual find+merge rather than `repo.upsert(...)` to stay portable
        // across MariaDB (which lacks `ON CONFLICT` parity with Postgres/SQLite).
        const existing = await repo.findOne({
            where: {
                chatflowId: Equal(row.chatflowId),
                userId: Equal(row.userId),
                nodeId: Equal(row.nodeId),
                name: Equal(row.name)
            } as any
        })
        if (existing) {
            ;(existing as any).value = row.value
            ;(existing as any).valueType = row.valueType
            ;(existing as any).sizeBytes = row.sizeBytes
            ;(existing as any).edited = false
            ;(existing as any).lastRunAt = row.lastRunAt
            await repo.save(existing)
        } else {
            const entity = (repo as any).create({
                chatflowId: row.chatflowId,
                workspaceId: row.workspaceId,
                userId: row.userId,
                nodeId: row.nodeId,
                name: row.name,
                value: row.value,
                valueType: row.valueType,
                visible: row.visible,
                editable: row.editable,
                edited: row.edited,
                sizeBytes: row.sizeBytes,
                lastRunAt: row.lastRunAt
            })
            await repo.save(entity)
        }
    }

    private static async recordRun(args: {
        appDataSource: DataSource
        chatflowId: string
        workspaceId: string
        userId: string
        nodeId: string
        nodeLabel: string
        nodeData: INodeExecutionData
        status: ExecutionState
        durationMs: number
    }): Promise<void> {
        const repo = args.appDataSource.getRepository(DebugNodeExecution)
        const entity = repo.create({
            chatflowId: args.chatflowId,
            workspaceId: args.workspaceId,
            userId: args.userId,
            nodeId: args.nodeId,
            nodeLabel: args.nodeLabel,
            data: args.nodeData,
            status: args.status,
            durationMs: args.durationMs
        })
        await repo.save(entity)
    }
}
