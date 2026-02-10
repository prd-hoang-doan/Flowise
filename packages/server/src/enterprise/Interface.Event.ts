// Websocket - Collaboration Events
export interface IEventData {
    type: string
}

export interface IJoinChatFlowEvent extends IEventData {
    type: 'JOIN_CHAT_FLOW'
    chatflowId: string
    sessionId: string
    color: string
    timestamp: number
    protocolVersion?: 'crdt-v1' // Optional: if specified, use CRDT protocol
}

export interface ILeaveChatFlowEvent extends IEventData {
    type: 'LEAVE_CHAT_FLOW'
    chatflowId: string
    sessionId: string
}

export interface IUserColorUpdatedEvent extends IEventData {
    type: 'USER_COLOR_UPDATED'
    chatflowId: string
    sessionId: string
    color: string
}

export interface IUserHeartbeatEvent extends IEventData {
    type: 'USER_HEARTBEAT'
    chatflowId: string
    sessionId: string
    status: 'active' | 'idle' | 'away'
    timestamp: number
}

export interface IRequestSnapshotSyncEvent extends IEventData {
    type: 'REQUEST_SNAPSHOT_SYNC'
    chatflowId: string
}

export interface INodeUpdatedEvent extends IEventData {
    type: 'NODE_UPDATED'
    chatflowId: string
    timestamp: number
    changeType: 'add' | 'remove' | 'update' | 'position' | 'dimensions' | 'select'
    nodeId: string
    node: Record<string, any>
    edge?: Record<string, any>
}

export interface IEdgeUpdatedEvent extends IEventData {
    type: 'EDGE_UPDATED'
    chatflowId: string
    timestamp: number
    changeType: 'add' | 'remove' | 'buttonedge'
    edgeId: string
    edge: Record<string, any>
    node?: Record<string, any>
}

export interface ICursorMovedEvent extends IEventData {
    type: 'CURSOR_MOVED'
    chatflowId: string
    sessionId: string
    name: string
    color: string
    x: number
    y: number
}

export interface INodePresenceUpdatedEvent extends IEventData {
    type: 'NODE_PRESENCE_UPDATED'
    chatflowId: string
    sessionId: string
    nodeId: string
    action: 'enter' | 'leave' | 'edit_start' | 'edit_end'
}

// CRDT Events
export interface ICrdtInitEvent extends IEventData {
    type: 'CRDT_INIT'
    chatflowId: string
    sessionId: string
    protocolVersion: 'crdt-v1'
    color: string // For presence
    timestamp: number
    stateVector?: string // Optional: base64-encoded client state vector for incremental sync
}

export interface ICrdtUpdateEvent extends IEventData {
    type: 'CRDT_UPDATE'
    chatflowId: string
    sessionId: string
    update: string // base64-encoded Loro update (Uint8Array)
    timestamp: number
}

export interface ICrdtSyncRequestEvent extends IEventData {
    type: 'CRDT_SYNC_REQUEST'
    chatflowId: string
    sessionId: string
    stateVector?: string // Optional: base64-encoded client state for incremental sync
}

export type IEvent =
    | IJoinChatFlowEvent
    | ILeaveChatFlowEvent
    | IUserColorUpdatedEvent
    | IUserHeartbeatEvent
    | IRequestSnapshotSyncEvent
    | INodeUpdatedEvent
    | IEdgeUpdatedEvent
    | ICursorMovedEvent
    | INodePresenceUpdatedEvent
    | ICrdtInitEvent
    | ICrdtUpdateEvent
    | ICrdtSyncRequestEvent
