import { v4 as uuidv4 } from 'uuid'
import { DataSource } from 'typeorm'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { IFileUpload, IServerSideEventStreamer } from 'flowise-components'
import {
    ExecutionState,
    IAgentflowExecutedData,
    IComponentNodes,
    IDebugVariableSummary,
    IReactFlowEdge,
    IReactFlowNode,
    IReactFlowObject,
    IStepRunArgs,
    IStepRunResult,
    IncomingAgentflowInput,
    IMessage
} from '../../Interface'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { StatusCodes } from 'http-status-codes'
import logger from '../logger'
import { Telemetry } from '../telemetry'
import { CachePool } from '../../CachePool'
import { UsageCacheManager } from '../../UsageCacheManager'
import { executeNode, IAgentFlowRuntime } from '../buildAgentflow'
import { constructGraphs, getAPIOverrideConfig } from '../index'
import { DebugVariablePool } from './DebugVariablePool'
import { DebugVariableSaver, DebugVariableTooLargeError } from './DebugVariableSaver'
import { DEBUG_VAR_INLINE_MAX_BYTES, STEP_RUN_ALLOWED_NODES, STEP_RUN_DEFERRED_NODES } from './constants'
import { acquireStepRunSlot, releaseStepRunSlot } from './concurrency'

export interface StepRunnerDeps {
    appDataSource: DataSource
    componentNodes: IComponentNodes
    cachePool: CachePool
    usageCacheManager: UsageCacheManager
    telemetry: Telemetry
    sseStreamer?: IServerSideEventStreamer
}

export interface StepRunnerCtor extends StepRunnerDeps {
    chatflow: ChatFlow
    args: IStepRunArgs
}

export class StepRunUnsupportedNodeError extends Error {
    constructor(public readonly nodeName: string, public readonly deferred: boolean) {
        super(
            deferred
                ? `Step Run for node type '${nodeName}' is coming in V1.1`
                : `Step Run for node type '${nodeName}' is not supported`
        )
        this.name = 'StepRunUnsupportedNodeError'
    }
}

export class StepRunMissingVariablesError extends Error {
    constructor(public readonly missingVariables: string[]) {
        super(`Step Run blocked: missing variables [${missingVariables.join(', ')}]`)
        this.name = 'StepRunMissingVariablesError'
    }
}

/**
 * Orchestrates a single Step Run.
 *
 * Reuses `executeNode` directly (`isRecursive=true`, `parentExecutionId=undefined`)
 * so the existing per-node execution path is shared with full flow runs.
 * `executeNode` never writes to the `Execution` table on its own — that's owned
 * by `executeAgentFlow`'s queue loop — so the Step Run is naturally isolated
 * from production execution history.
 */
export class StepRunner {
    private readonly deps: StepRunnerDeps
    private readonly chatflow: ChatFlow
    private readonly args: IStepRunArgs

    constructor(opts: StepRunnerCtor) {
        const { chatflow, args, ...deps } = opts
        this.deps = deps
        this.chatflow = chatflow
        this.args = args
    }

    async run(): Promise<IStepRunResult> {
        const { chatflowId, nodeId, userId, workspaceId, streaming, chatId } = this.args
        const { sseStreamer, telemetry, appDataSource, componentNodes, cachePool, usageCacheManager } = this.deps

        acquireStepRunSlot(chatflowId, userId)
        const startedAt = Date.now()

        try {
            const parsed: IReactFlowObject = JSON.parse(this.chatflow.flowData)
            const nodes: IReactFlowNode[] = (parsed.nodes || []).filter((n) => n.data?.name !== 'stickyNoteAgentflow')
            const edges: IReactFlowEdge[] = parsed.edges || []

            const reactFlowNode = nodes.find((n) => n.id === nodeId)
            if (!reactFlowNode) {
                throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node '${nodeId}' not found in chatflow ${chatflowId}`)
            }
            const nodeName = reactFlowNode.data?.name
            if (!nodeName) {
                throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Node '${nodeId}' has no data.name`)
            }
            if (STEP_RUN_DEFERRED_NODES.has(nodeName)) {
                throw new StepRunUnsupportedNodeError(nodeName, true)
            }
            if (!STEP_RUN_ALLOWED_NODES.has(nodeName)) {
                throw new StepRunUnsupportedNodeError(nodeName, false)
            }
            // Children of iteration / loop never run standalone — the parent
            // node owns their context. The deferred-node check above blocks the
            // parents themselves; this blocks the children.
            if (reactFlowNode.parentNode) {
                throw new StepRunUnsupportedNodeError(nodeName, true)
            }

            this.enforceInputCap(this.args.inputs)

            const pool = await DebugVariablePool.build({
                appDataSource,
                chatflowId,
                workspaceId,
                userId,
                nodes,
                edges,
                targetNodeId: nodeId,
                requestInputs: this.args.inputs,
                requestQuestion: this.args.question
            })

            if (pool.missingVariables.length > 0) {
                throw new StepRunMissingVariablesError(pool.missingVariables)
            }

            telemetry.sendTelemetry('agentflow_debug_step_run_start', {
                chatflowId,
                nodeId,
                nodeName,
                workspaceId
            })

            sseStreamer?.streamAgentFlowEvent(chatId, 'INPROGRESS')

            const { graph } = constructGraphs(nodes, edges)
            const { graph: reversedGraph } = constructGraphs(nodes, edges, { isReversed: true })
            const { nodeOverrides, variableOverrides, apiOverrideStatus } = getAPIOverrideConfig(this.chatflow)

            const incomingInput: IncomingAgentflowInput = {
                question: this.args.question,
                form: undefined,
                webhook: undefined,
                overrideConfig: {},
                history: [] as IMessage[],
                streaming
            }

            const fileUploads: IFileUpload[] | undefined = this.args.files as unknown as IFileUpload[] | undefined

            const agentflowRuntime: IAgentFlowRuntime = {
                state: pool.agentflowRuntime.state ?? {},
                chatHistory: pool.agentflowRuntime.chatHistory ?? [],
                form: pool.agentflowRuntime.form ?? {},
                webhook: pool.agentflowRuntime.webhook ?? {}
            }

            const abortController = this.args.abortController ?? new AbortController()

            let status: ExecutionState = 'INPROGRESS'
            let nodeData: any
            let capturedVariables: IDebugVariableSummary[] = []
            const apiMessageId = uuidv4()
            const sessionId = this.args.sessionId || chatId

            try {
                const { result } = await executeNode({
                    nodeId,
                    reactFlowNode,
                    nodes,
                    edges,
                    graph,
                    reversedGraph,
                    incomingInput,
                    chatflow: this.chatflow,
                    chatId,
                    sessionId,
                    apiMessageId,
                    pastChatHistory: agentflowRuntime.chatHistory ?? [],
                    prependedChatHistory: [],
                    appDataSource,
                    usageCacheManager,
                    telemetry,
                    componentNodes,
                    cachePool,
                    sseStreamer: sseStreamer!,
                    baseURL: this.args.baseURL,
                    overrideConfig: {},
                    apiOverrideStatus,
                    nodeOverrides,
                    variableOverrides,
                    uploadedFilesContent: '',
                    fileUploads,
                    agentFlowExecutedData: pool.agentFlowExecutedData,
                    agentflowRuntime,
                    abortController,
                    isInternal: this.args.isInternal,
                    isRecursive: true,
                    parentExecutionId: undefined,
                    orgId: this.args.orgId,
                    workspaceId,
                    subscriptionId: this.args.subscriptionId,
                    productId: this.args.productId
                })
                nodeData = result
                status = 'FINISHED'
            } catch (err) {
                const message = getErrorMessage(err)
                if (message.includes('Aborted')) {
                    status = 'STOPPED'
                    nodeData = { id: nodeId, name: nodeName, error: 'Step run cancelled' }
                } else {
                    status = 'ERROR'
                    nodeData = { id: nodeId, name: nodeName, error: message }
                    logger.error(`[StepRunner]: Error executing step ${nodeId}: ${message}`)
                }
            }

            const durationMs = Date.now() - startedAt
            const executedData: IAgentflowExecutedData = {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                data: nodeData,
                previousNodeIds: reversedGraph[nodeId] ?? [],
                status
            }

            sseStreamer?.streamNextAgentFlowEvent(chatId, {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                status
            })
            sseStreamer?.streamAgentFlowExecutedDataEvent(chatId, [executedData])
            sseStreamer?.streamAgentFlowEvent(chatId, status)

            // Skip variable persistence on STOPPED to keep the prior good state.
            if (status === 'FINISHED') {
                try {
                    await DebugVariableSaver.save({
                        appDataSource,
                        chatflowId,
                        workspaceId,
                        userId,
                        reactFlowNode,
                        nodeLabel: reactFlowNode.data.label,
                        status,
                        durationMs,
                        nodeData
                    })
                    capturedVariables = await this.summariseCapturedVariables(reactFlowNode, nodeData)
                } catch (saveErr) {
                    if (saveErr instanceof DebugVariableTooLargeError) {
                        throw new InternalFlowiseError(
                            StatusCodes.REQUEST_TOO_LONG,
                            `Step Run output exceeds the inline cap: variable '${saveErr.varName}' is ${saveErr.sizeBytes} bytes (cap=${DEBUG_VAR_INLINE_MAX_BYTES}). Storage offload is deferred to V1.1.`
                        )
                    }
                    throw saveErr
                }
            } else if (status === 'ERROR') {
                await DebugVariableSaver.save({
                    appDataSource,
                    chatflowId,
                    workspaceId,
                    userId,
                    reactFlowNode,
                    nodeLabel: reactFlowNode.data.label,
                    status,
                    durationMs,
                    nodeData
                })
            }

            telemetry.sendTelemetry('agentflow_debug_step_run_finish', {
                chatflowId,
                nodeId,
                nodeName,
                workspaceId,
                status,
                durationMs
            })

            return {
                nodeId,
                nodeLabel: reactFlowNode.data.label,
                status,
                data: nodeData,
                durationMs,
                capturedVariables
            }
        } finally {
            releaseStepRunSlot(chatflowId, userId)
        }
    }

    /**
     * Enforces the hard cap on `inputs` before the run starts. V1.0 has no
     * storage offload — request bodies bigger than the cap return HTTP 413
     * before any work is done.
     */
    private enforceInputCap(inputs?: Record<string, unknown>): void {
        if (!inputs) return
        for (const [name, value] of Object.entries(inputs)) {
            const size = Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? ''), 'utf8')
            if (size > DEBUG_VAR_INLINE_MAX_BYTES) {
                throw new InternalFlowiseError(
                    StatusCodes.REQUEST_TOO_LONG,
                    `Step Run input '${name}' is ${size} bytes (cap=${DEBUG_VAR_INLINE_MAX_BYTES}). Reduce the payload or wait for V1.1 storage offload.`
                )
            }
        }
    }

    private async summariseCapturedVariables(
        reactFlowNode: IReactFlowNode,
        nodeData: any
    ): Promise<IDebugVariableSummary[]> {
        // Best-effort summarisation directly from the in-memory result rather
        // than re-querying the DB. Keeps the response shape stable with the
        // GET /debug/variables list endpoint.
        const summaries: IDebugVariableSummary[] = []
        const pushSummary = (scope: IDebugVariableSummary['scope'], nodeId: string, name: string, value: unknown) => {
            const size = Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? ''), 'utf8')
            summaries.push({
                id: `${nodeId}:${name}`,
                scope,
                nodeId,
                name,
                valueType:
                    Array.isArray(value)
                        ? 'array'
                        : typeof value === 'string'
                        ? 'string'
                        : typeof value === 'number'
                        ? 'number'
                        : typeof value === 'boolean'
                        ? 'boolean'
                        : 'json',
                edited: false,
                visible: true,
                sizeBytes: size,
                isTruncated: false,
                updatedDate: new Date()
            })
        }

        if (nodeData?.output && typeof nodeData.output === 'object' && !Array.isArray(nodeData.output)) {
            for (const [name, value] of Object.entries(nodeData.output as Record<string, unknown>)) {
                pushSummary('node', reactFlowNode.id, name, value)
            }
        }
        if (nodeData?.state && typeof nodeData.state === 'object' && !Array.isArray(nodeData.state)) {
            for (const [name, value] of Object.entries(nodeData.state as Record<string, unknown>)) {
                pushSummary('flow_state', '__flow_state__', name, value)
            }
        }
        return summaries
    }
}
