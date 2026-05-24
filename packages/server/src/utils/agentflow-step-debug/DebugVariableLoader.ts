import { DataSource, Equal } from 'typeorm'
import { DebugVariable } from '../../database/entities/DebugVariable'
import { DEBUG_NODE_SENTINELS, DebugVariableScope } from '../../Interface'

const scopeToNodeId = (scope: DebugVariableScope, fallbackNodeId?: string): string => {
    switch (scope) {
        case 'flow_state':
            return DEBUG_NODE_SENTINELS.FLOW_STATE
        case 'form':
            return DEBUG_NODE_SENTINELS.FORM
        case 'webhook':
            return DEBUG_NODE_SENTINELS.WEBHOOK
        case 'chat_history':
            return DEBUG_NODE_SENTINELS.CHAT_HISTORY
        case 'system':
            return DEBUG_NODE_SENTINELS.SYSTEM
        case 'node':
            if (!fallbackNodeId) throw new Error('DebugVariableLoader: nodeId is required for scope=node')
            return fallbackNodeId
    }
}

/**
 * Thin façade exposing `get(scope, name)` for the missing-vars pre-check and
 * for ad-hoc reads by future tooling. Distinct from `DebugVariablePool` so that
 * call sites that don't need the full merged pool can resolve a single value
 * without rebuilding everything.
 */
export class DebugVariableLoader {
    constructor(
        private readonly appDataSource: DataSource,
        private readonly scopeArgs: { chatflowId: string; workspaceId: string; userId: string }
    ) {}

    async get(scope: DebugVariableScope, name: string, nodeId?: string): Promise<unknown | undefined> {
        const row = await this.appDataSource.getRepository(DebugVariable).findOne({
            where: {
                chatflowId: Equal(this.scopeArgs.chatflowId),
                workspaceId: Equal(this.scopeArgs.workspaceId),
                userId: Equal(this.scopeArgs.userId),
                nodeId: Equal(scopeToNodeId(scope, nodeId)),
                name: Equal(name)
            }
        })
        return row?.value
    }
}
