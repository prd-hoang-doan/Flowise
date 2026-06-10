import {
    IAction,
    ICommonObject,
    IFileUpload,
    IHumanInput,
    INode,
    INodeData as INodeDataFromComponent,
    INodeExecutionData,
    INodeParams,
    IServerSideEventStreamer
} from 'flowise-components'
import { DataSource } from 'typeorm'
import { CachePool } from './CachePool'
import { Telemetry } from './utils/telemetry'
import { UsageCacheManager } from './UsageCacheManager'

export type MessageType = 'apiMessage' | 'userMessage'

export type ChatflowType = 'CHATFLOW' | 'MULTIAGENT' | 'ASSISTANT' | 'AGENTFLOW'

export type AssistantType = 'CUSTOM' | 'OPENAI' | 'AZURE'

export type ExecutionState = 'INPROGRESS' | 'FINISHED' | 'ERROR' | 'TERMINATED' | 'TIMEOUT' | 'STOPPED'

export enum MODE {
    QUEUE = 'queue',
    MAIN = 'main'
}

export enum ChatType {
    INTERNAL = 'INTERNAL',
    EXTERNAL = 'EXTERNAL',
    EVALUATION = 'EVALUATION',
    MCP = 'MCP',
    SCHEDULED = 'SCHEDULED',
    WEBHOOK = 'WEBHOOK'
}

export enum ChatMessageRatingType {
    THUMBS_UP = 'THUMBS_UP',
    THUMBS_DOWN = 'THUMBS_DOWN'
}

export enum Platform {
    OPEN_SOURCE = 'open source',
    CLOUD = 'cloud',
    ENTERPRISE = 'enterprise'
}

export enum UserPlan {
    STARTER = 'STARTER',
    PRO = 'PRO',
    FREE = 'FREE'
}

/**
 * Databases
 */
export interface IChatFlow {
    id: string
    name: string
    flowData: string
    updatedDate: Date
    createdDate: Date
    deployed?: boolean
    isPublic?: boolean
    apikeyid?: string
    analytic?: string
    speechToText?: string
    textToSpeech?: string
    chatbotConfig?: string
    followUpPrompts?: string
    apiConfig?: string
    category?: string
    type?: ChatflowType
    mcpServerConfig?: string
    workspaceId: string
    webhookSecret?: string | null
    webhookSecretConfigured?: boolean
}

export interface IChatMessage {
    id: string
    role: MessageType
    content: string
    chatflowid: string
    executionId?: string
    sourceDocuments?: string
    usedTools?: string
    fileAnnotations?: string
    agentReasoning?: string
    reasonContent?: string
    fileUploads?: string
    artifacts?: string
    chatType: string
    chatId: string
    memoryType?: string
    sessionId?: string
    createdDate: Date
    leadEmail?: string
    action?: string | null
    followUpPrompts?: string
}

export interface IChatMessageFeedback {
    id: string
    content?: string
    chatflowid: string
    chatId: string
    messageId: string
    rating: ChatMessageRatingType
    createdDate: Date
}

export interface ITool {
    id: string
    name: string
    description: string
    color: string
    iconSrc?: string
    schema?: string
    func?: string
    updatedDate: Date
    createdDate: Date
    workspaceId: string
}

export interface IAssistant {
    id: string
    details: string
    credential: string
    iconSrc?: string
    updatedDate: Date
    createdDate: Date
    workspaceId: string
}

export interface ICredential {
    id: string
    name: string
    credentialName: string
    encryptedData: string
    updatedDate: Date
    createdDate: Date
    workspaceId: string
}

export interface IVariable {
    id: string
    name: string
    value: string
    type: string
    updatedDate: Date
    createdDate: Date
    workspaceId: string
}

export interface ILead {
    id: string
    name?: string
    email?: string
    phone?: string
    chatflowid: string
    chatId: string
    createdDate: Date
}

export interface IUpsertHistory {
    id: string
    chatflowid: string
    result: string
    flowData: string
    date: Date
}

export interface IExecution {
    id: string
    executionData: string
    state: ExecutionState
    agentflowId: string
    sessionId: string
    isPublic?: boolean
    action?: string
    createdDate: Date
    updatedDate: Date
    stoppedDate: Date
    workspaceId: string
}

export type ScheduleInputMode = 'text' | 'form' | 'none'

export type StartInputType = 'chatInput' | 'formInput' | 'webhookTrigger' | 'scheduleInput'

export interface IScheduleRecord {
    id: string
    triggerType: string
    targetId: string
    nodeId?: string
    cronExpression: string
    timezone: string
    enabled: boolean
    scheduleInputMode: ScheduleInputMode
    defaultInput?: string
    defaultForm?: string
    lastRunAt?: Date
    nextRunAt?: Date
    endDate?: Date
    workspaceId: string
    createdDate: Date
    updatedDate: Date
}

export interface IScheduleTriggerLog {
    id: string
    scheduleRecordId: string
    triggerType: string
    targetId: string
    executionId?: string
    status: string
    error?: string
    elapsedTimeMs?: number
    scheduledAt: Date
    workspaceId: string
    createdDate: Date
}

export enum CustomMcpServerStatus {
    PENDING = 'PENDING',
    AUTHORIZED = 'AUTHORIZED',
    ERROR = 'ERROR'
}

export enum CustomMcpServerAuthType {
    NONE = 'NONE',
    CUSTOM_HEADERS = 'CUSTOM_HEADERS'
}

export interface ICustomMcpServer {
    id: string
    name: string
    serverUrl: string
    iconSrc?: string
    color?: string
    authType: string
    authConfig?: string
    tools?: string
    toolCount: number
    status: CustomMcpServerStatus | string
    createdDate: Date
    updatedDate: Date
    workspaceId: string
}

export interface ICustomMcpServerResponse extends Omit<ICustomMcpServer, 'authConfig'> {
    authConfig?: Record<string, any>
}

export interface IComponentNodes {
    [key: string]: INode
}

export interface IComponentCredentials {
    [key: string]: INode
}

export interface IVariableDict {
    [key: string]: string
}

export interface INodeDependencies {
    [key: string]: number
}

export interface INodeDirectedGraph {
    [key: string]: string[]
}

export interface INodeData extends INodeDataFromComponent {
    inputAnchors: INodeParams[]
    inputParams: INodeParams[]
    outputAnchors: INodeParams[]
}

export interface IReactFlowNode {
    id: string
    position: {
        x: number
        y: number
    }
    type: string
    data: INodeData
    positionAbsolute: {
        x: number
        y: number
    }
    z: number
    handleBounds: {
        source: any
        target: any
    }
    width: number
    height: number
    selected: boolean
    dragging: boolean
    parentNode?: string
    extent?: string
}

export interface IReactFlowEdge {
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    type: string
    id: string
    data: {
        label: string
    }
}

export interface IReactFlowObject {
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    viewport: {
        x: number
        y: number
        zoom: number
    }
}

export interface IExploredNode {
    [key: string]: {
        remainingLoop: number
        lastSeenDepth: number
    }
}

export interface INodeQueue {
    nodeId: string
    depth: number
}

export interface IDepthQueue {
    [key: string]: number
}

export interface IAgentflowExecutedData {
    nodeLabel: string
    nodeId: string
    data: INodeExecutionData
    previousNodeIds: string[]
    status?: ExecutionState
}

/**
 * Step Debugger — sentinel `nodeId` values used by DebugVariable rows that do
 * NOT map to a real ReactFlow node. They surface the existing Flowise namespaces
 * (Flow State, form, webhook, system, chat history) in the per-builder pool
 * without inventing new wire vocabulary.
 */
export const DEBUG_NODE_SENTINELS = {
    FLOW_STATE: '__flow_state__',
    FORM: '__form__',
    WEBHOOK: '__webhook__',
    CHAT_HISTORY: '__chat_history__',
    SYSTEM: '__system__'
} as const

export type DebugNodeSentinel = (typeof DEBUG_NODE_SENTINELS)[keyof typeof DEBUG_NODE_SENTINELS]

export type DebugVariableScope = 'node' | 'flow_state' | 'form' | 'webhook' | 'system' | 'chat_history'

export type DebugVariableValueType = 'string' | 'number' | 'boolean' | 'json' | 'array' | 'file'

export interface IDebugVariable {
    id: string
    chatflowId: string
    workspaceId: string
    userId: string
    nodeId: string
    name: string
    valueType: DebugVariableValueType
    value: unknown
    description?: string | null
    visible: boolean
    editable: boolean
    edited: boolean
    sizeBytes: number
    lastRunAt?: Date | null
    createdDate: Date
    updatedDate: Date
}

export interface IDebugNodeExecution {
    id: string
    chatflowId: string
    workspaceId: string
    userId: string
    nodeId: string
    nodeLabel: string
    data: INodeExecutionData
    status: ExecutionState
    durationMs?: number | null
    createdDate: Date
}

export type IDebugStepRunData = INodeExecutionData

export interface IDebugVariableSummary {
    id: string
    scope: DebugVariableScope
    nodeId: string
    name: string
    valueType: DebugVariableValueType
    edited: boolean
    visible: boolean
    sizeBytes: number
    isTruncated: boolean
    description?: string | null
    updatedDate: Date
}

/**
 * Snapshot of one debug variable as it existed at the moment a Step Run finished.
 * Stored inside the parent IDebugVariableSnapshotPayload bucket; carries enough
 * metadata for the UI to diff / render without a second fetch.
 */
export interface IDebugVariableSnapshotEntry {
    id?: string
    name: string
    valueType: DebugVariableValueType
    value: unknown
    sizeBytes: number
    edited?: boolean
    visible?: boolean
}

/**
 * Denormalised pool blob keyed by scope key (real nodeId or DEBUG_NODE_SENTINELS).
 * Persisted as a single JSON column on `debug_variable_snapshot.variables`.
 */
export type IDebugVariableSnapshotPayload = Record<string, IDebugVariableSnapshotEntry[]>

/**
 * Sanitised summary of the IStepRunArgs body — used by the Variable Pool panel
 * to label each snapshot with the inputs that produced it without exposing
 * full request payloads.
 */
export interface IDebugVariableSnapshotRunArgs {
    question?: string
    sessionId?: string
    hasInputs?: boolean
    hasForm?: boolean
    hasWebhook?: boolean
}

export interface IDebugVariableSnapshot {
    id: string
    chatflowId: string
    workspaceId: string
    userId: string
    runId: string
    nodeId: string
    nodeLabel: string
    status: ExecutionState
    durationMs?: number | null
    variables: IDebugVariableSnapshotPayload
    missingVariables?: string[] | null
    runArgs?: IDebugVariableSnapshotRunArgs | null
    createdDate: Date
}

/**
 * Variant of IDebugVariableSnapshot returned by the list endpoint — the full
 * `variables` blob is omitted to keep the timeline payload tiny. Detail is
 * fetched on demand via the `get` endpoint when a snapshot is selected.
 */
export interface IDebugVariableSnapshotSummary {
    id: string
    runId: string
    nodeId: string
    nodeLabel: string
    status: ExecutionState
    durationMs?: number | null
    missingVariableCount: number
    variableCount: number
    runArgs?: IDebugVariableSnapshotRunArgs | null
    createdDate: Date
}

export interface IStepRunArgs {
    chatflowId: string
    nodeId: string
    userId: string
    workspaceId: string
    orgId: string
    subscriptionId: string
    productId: string
    inputs?: Record<string, unknown>
    files?: IFileUpload[]
    question?: string
    sessionId?: string
    streaming: boolean
    chatId: string
    baseURL: string
    isInternal: boolean
    abortController?: AbortController
}

export interface IStepRunResult {
    nodeId: string
    nodeLabel: string
    status: ExecutionState
    data: INodeExecutionData
    durationMs: number
    capturedVariables: IDebugVariableSummary[]
}

export interface IMessage {
    message: string
    type: MessageType
    role?: MessageType
    content?: string
}

export interface IncomingInput {
    question: string
    overrideConfig?: ICommonObject
    chatId?: string
    sessionId?: string
    stopNodeId?: string
    uploads?: IFileUpload[]
    leadEmail?: string
    history?: IMessage[]
    action?: IAction
    streaming?: boolean
}

export interface IncomingAgentflowInput extends Omit<IncomingInput, 'question'> {
    question?: string
    form?: Record<string, any>
    humanInput?: IHumanInput
    webhook?: Record<string, any>
}

export interface IActiveChatflows {
    [key: string]: {
        startingNodes: IReactFlowNode[]
        endingNodeData?: INodeData
        inSync: boolean
        overrideConfig?: ICommonObject
        chatId?: string
    }
}

export interface IActiveCache {
    [key: string]: Map<any, any>
}

export interface IOverrideConfig {
    node: string
    nodeId: string
    label: string
    name: string
    type: string
    schema?: ICommonObject[] | Record<string, string>
}

export type ICredentialDataDecrypted = ICommonObject

// Plain credential object sent to server
export interface ICredentialReqBody {
    name: string
    credentialName: string
    plainDataObj: ICredentialDataDecrypted
    workspaceId: string
}

// Decrypted credential object sent back to client
export interface ICredentialReturnResponse extends ICredential {
    plainDataObj: ICredentialDataDecrypted
}

export interface IUploadFileSizeAndTypes {
    fileTypes: string[]
    maxUploadSize: number
}

export interface ICustomTemplate {
    id: string
    name: string
    flowData: string
    updatedDate: Date
    createdDate: Date
    description?: string
    type?: string
    badge?: string
    framework?: string
    usecases?: string
    workspaceId: string
}

export interface IFlowConfig {
    chatflowid: string
    chatflowId: string
    chatId: string
    sessionId: string
    chatHistory: IMessage[]
    apiMessageId: string
    overrideConfig?: ICommonObject
    state?: ICommonObject
    runtimeChatHistoryLength?: number
}

export interface IPredictionQueueAppServer {
    appDataSource: DataSource
    componentNodes: IComponentNodes
    sseStreamer: IServerSideEventStreamer
    telemetry: Telemetry
    cachePool: CachePool
    usageCacheManager: UsageCacheManager
}

export interface IExecuteFlowParams extends IPredictionQueueAppServer {
    incomingInput: IncomingInput
    chatflow: IChatFlow
    chatId: string
    orgId: string
    workspaceId: string
    subscriptionId: string
    productId: string
    baseURL: string
    isInternal: boolean
    isEvaluation?: boolean
    evaluationRunId?: string
    signal?: AbortController
    files?: Express.Multer.File[]
    fileUploads?: IFileUpload[]
    uploadedFilesContent?: string
    isUpsert?: boolean
    isRecursive?: boolean
    parentExecutionId?: string
    iterationContext?: ICommonObject
    isTool?: boolean
    chatType?: ChatType
}

export interface INodeOverrides {
    [key: string]: {
        label: string
        name: string
        type: string
        enabled: boolean
    }[]
}

export interface IVariableOverride {
    id: string
    name: string
    type: 'static' | 'runtime'
    enabled: boolean
}

export interface IMcpServerConfig {
    enabled: boolean
    token: string
    description?: string
    toolName?: string
}

// DocumentStore related
export * from './Interface.DocumentStore'

// Evaluations related
export * from './Interface.Evaluation'
