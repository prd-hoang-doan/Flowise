import { DataSource } from 'typeorm'
import { Variable } from '../../database/entities/Variable'
import { DebugVariable } from '../../database/entities/DebugVariable'
import {
    DEBUG_NODE_SENTINELS,
    DebugVariableScope,
    ExecutionState,
    IAgentflowExecutedData,
    IMessage,
    IReactFlowEdge,
    IReactFlowNode
} from '../../Interface'
import { getWorkspaceSearchOptions } from '../../enterprise/utils/ControllerServiceUtils'
import { IAgentFlowRuntime } from '../buildAgentflow'

export interface PoolBuildArgs {
    appDataSource: DataSource
    chatflowId: string
    workspaceId: string
    userId: string
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    targetNodeId: string
    /** Override values supplied with the Step Run request — highest priority. */
    requestInputs?: Record<string, unknown>
    /** Form payload submitted with the run, if any. */
    requestForm?: Record<string, unknown>
    /** Webhook payload submitted with the run, if any. */
    requestWebhook?: Record<string, unknown>
    /** Question submitted with the run, if any. */
    requestQuestion?: string
}

export interface PoolBuildResult {
    agentflowRuntime: IAgentFlowRuntime
    agentFlowExecutedData: IAgentflowExecutedData[]
    availableVariables: Variable[]
    missingVariables: string[]
}

/**
 * Walks the target node + its upstream ancestors and extracts every `{{ ... }}`
 * template reference. The Step Runner uses the list to compute `missingVariables`
 * after the pool is materialised.
 */
const extractTemplateReferences = (nodes: IReactFlowNode[], edges: IReactFlowEdge[], targetNodeId: string): Set<string> => {
    const references = new Set<string>()
    const visited = new Set<string>()
    const queue: string[] = [targetNodeId]

    while (queue.length > 0) {
        const nodeId = queue.shift() as string
        if (visited.has(nodeId)) continue
        visited.add(nodeId)
        const node = nodes.find((n) => n.id === nodeId)
        if (!node) continue
        const serialized = JSON.stringify(node.data?.inputs ?? {})
        const matches = serialized.match(/{{\s*([^}]+?)\s*}}/g)
        if (matches) {
            for (const m of matches) {
                references.add(m.replace(/[{}]/g, '').trim())
            }
        }
        const upstream = edges.filter((e) => e.target === nodeId).map((e) => e.source)
        for (const up of upstream) {
            if (!visited.has(up)) queue.push(up)
        }
    }

    return references
}

/**
 * Build a synthetic `IAgentflowExecutedData` for a real (non-sentinel) nodeId
 * from its persisted Debug Variable rows. The shape mirrors what
 * `resolveVariables` consumes when it traverses `nodeId.output.path` references
 * during a full run.
 */
const synthesizeExecutedData = (nodeId: string, rows: DebugVariable[], nodeLabel: string): IAgentflowExecutedData => {
    const output: Record<string, unknown> = {}
    for (const row of rows) {
        output[row.name] = row.value
    }
    return {
        nodeId,
        nodeLabel,
        previousNodeIds: [],
        status: 'FINISHED' as ExecutionState,
        data: {
            id: nodeId,
            name: nodeLabel,
            input: {},
            output,
            state: {}
        } as any
    }
}

const scopeForSentinel = (nodeId: string): DebugVariableScope => {
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

export { scopeForSentinel }

export class DebugVariablePool {
    /**
     * Compose the three input sources (request overrides, persisted Debug Variables,
     * live flow defaults from `Variable`) into the runtime shapes that
     * `executeNode` + `resolveVariables` already understand.
     */
    static async build(args: PoolBuildArgs): Promise<PoolBuildResult> {
        const { appDataSource, chatflowId, workspaceId, userId, nodes, edges, targetNodeId } = args

        const debugVarRepo = appDataSource.getRepository(DebugVariable)
        const variableRepo = appDataSource.getRepository(Variable)

        const [rows, availableVariables] = await Promise.all([
            debugVarRepo.find({
                where: { chatflowId, workspaceId, userId }
            }),
            variableRepo.findBy(getWorkspaceSearchOptions(workspaceId))
        ])

        const nodeRowsByNodeId = new Map<string, DebugVariable[]>()
        const flowState: Record<string, unknown> = {}
        const form: Record<string, unknown> = {}
        const webhook: Record<string, unknown> = {}
        const systemBag: Record<string, unknown> = {}
        let chatHistory: IMessage[] = []

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
                case DEBUG_NODE_SENTINELS.CHAT_HISTORY:
                    if (Array.isArray(row.value)) chatHistory = row.value as IMessage[]
                    break
                case DEBUG_NODE_SENTINELS.SYSTEM:
                    systemBag[row.name] = row.value
                    break
                default: {
                    const bucket = nodeRowsByNodeId.get(row.nodeId) ?? []
                    bucket.push(row)
                    nodeRowsByNodeId.set(row.nodeId, bucket)
                }
            }
        }

        // Apply request-level overrides (highest priority). The request inputs
        // payload is treated as a flat overlay onto `agentflowRuntime.state` so
        // builders can pin a Flow State key from the Run Step Form without
        // touching the DB.
        if (args.requestInputs && typeof args.requestInputs === 'object') {
            for (const [k, v] of Object.entries(args.requestInputs)) flowState[k] = v
        }
        if (args.requestForm && typeof args.requestForm === 'object') {
            for (const [k, v] of Object.entries(args.requestForm)) form[k] = v
        }
        if (args.requestWebhook && typeof args.requestWebhook === 'object') {
            for (const [k, v] of Object.entries(args.requestWebhook)) webhook[k] = v
        }
        if (typeof args.requestQuestion === 'string') {
            systemBag.question = args.requestQuestion
        }

        const agentflowRuntime: IAgentFlowRuntime = {
            state: flowState,
            chatHistory,
            form,
            webhook
        }

        // Synthesise an IAgentflowExecutedData per real-node DebugVariable bucket
        // so `resolveVariables` resolves `{{ nodeId.output.path }}` unchanged.
        const agentFlowExecutedData: IAgentflowExecutedData[] = []
        for (const [nodeId, nodeRows] of nodeRowsByNodeId.entries()) {
            const node = nodes.find((n) => n.id === nodeId)
            const label = node?.data?.label ?? nodeId
            agentFlowExecutedData.push(synthesizeExecutedData(nodeId, nodeRows, label))
        }

        const missingVariables = this.computeMissingVariables({
            nodes,
            edges,
            targetNodeId,
            flowState,
            form,
            webhook,
            systemBag,
            availableVariables,
            nodeRowsByNodeId
        })

        return {
            agentflowRuntime,
            agentFlowExecutedData,
            availableVariables,
            missingVariables
        }
    }

    /**
     * Walk every template reference in the target node + its ancestors and
     * report any that the pool cannot satisfy. Surfaces blockers in the
     * controller before `executeNode` even starts, mirroring Dify's
     * "missing inputs" pre-check.
     */
    static computeMissingVariables(opts: {
        nodes: IReactFlowNode[]
        edges: IReactFlowEdge[]
        targetNodeId: string
        flowState: Record<string, unknown>
        form: Record<string, unknown>
        webhook: Record<string, unknown>
        systemBag: Record<string, unknown>
        availableVariables: Variable[]
        nodeRowsByNodeId: Map<string, DebugVariable[]>
    }): string[] {
        const references = extractTemplateReferences(opts.nodes, opts.edges, opts.targetNodeId)
        const missing = new Set<string>()
        const varNames = new Set(opts.availableVariables.map((v) => v.name))

        for (const ref of references) {
            if (ref === '$question' || ref === '$file_attachment') {
                if (opts.systemBag[ref.slice(1)] === undefined && opts.systemBag.question === undefined) missing.add(ref)
                continue
            }
            if (ref === '$chat_history' || ref === '$runtime_messages_length' || ref === '$current_date_time' || ref === '$loop_count') {
                continue
            }
            if (ref.startsWith('$iteration')) continue

            if (ref.startsWith('$flow.state.')) {
                const key = ref.slice('$flow.state.'.length).split('.')[0]
                if (opts.flowState[key] === undefined) missing.add(ref)
                continue
            }
            if (ref.startsWith('$flow.')) continue

            if (ref.startsWith('$form.')) {
                const key = ref.slice('$form.'.length).split('.')[0]
                if (opts.form[key] === undefined) missing.add(ref)
                continue
            }
            if (ref.startsWith('$webhook.')) {
                const key = ref.slice('$webhook.'.length).split('.')[0]
                if (opts.webhook[key] === undefined) missing.add(ref)
                continue
            }
            if (ref.startsWith('$vars.')) {
                const key = ref.slice('$vars.'.length).split('.')[0]
                if (!varNames.has(key)) missing.add(ref)
                continue
            }

            const outputMatch = ref.match(/^(.*?)\.output\.(.+)$/)
            if (outputMatch) {
                const [, nodePart] = outputMatch
                const nodeId = nodePart.replace(/\\/g, '')
                if (!opts.nodeRowsByNodeId.has(nodeId)) missing.add(ref)
                continue
            }

            // Bare nodeId references such as `{{ llmAgentflow_1 }}` resolve to
            // that node's primary output. Treat missing only if no row exists.
            const cleanRef = ref.replace(/\\/g, '')
            const refNode = opts.nodes.find((n) => n.id === cleanRef)
            if (refNode && !opts.nodeRowsByNodeId.has(cleanRef)) {
                missing.add(ref)
            }
        }

        return Array.from(missing).sort()
    }
}
