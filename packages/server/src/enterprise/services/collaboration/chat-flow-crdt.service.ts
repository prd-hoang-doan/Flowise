import { LoroDoc, LoroMap } from 'loro-crdt'
import { DataSource } from 'typeorm'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { LoggedInUser } from '../../Interface.Enterprise'
import logger from '../../../utils/logger'
import chatflowsService from '../../../services/chatflows'

interface CrdtDocMetadata {
    chatflowId: string
    workspaceId: string
    lastAccessTime: number
    isDirty: boolean
    updatedByUser?: LoggedInUser | null
}

/**
 * Service responsible for managing Loro CRDT documents for chatflows
 * Provides conflict-free collaborative editing capabilities
 */
export class ChatFlowCrdtService {
    private dataSource: DataSource
    private docs: Map<string, LoroDoc> = new Map()
    private metadata: Map<string, CrdtDocMetadata> = new Map()
    private savingChatflows: Set<string> = new Set()
    private saveIntervalId: NodeJS.Timeout | null = null
    private cleanupIntervalId: NodeJS.Timeout | null = null

    // Configuration
    private readonly SAVE_INTERVAL_MS = 5_000 // 5 seconds
    private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
    private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
    private readonly MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB warning threshold

    constructor() {
        const appServer = getRunningExpressApp()
        this.dataSource = appServer.AppDataSource
        this.startPeriodicSave()
        this.startPeriodicCleanup()
    }

    /**
     * Initialize a Loro document from existing flowData
     */
    async initializeDoc(chatflowId: string, flowData: any, workspaceId: string): Promise<LoroDoc> {
        const doc = new LoroDoc()

        // Create root structure
        const flowMap = doc.getMap('flow')
        const nodesMap = flowMap.setContainer('nodes', new LoroMap())
        const edgesMap = flowMap.setContainer('edges', new LoroMap())
        const viewportMap = flowMap.setContainer('viewport', new LoroMap())

        // Hydrate nodes
        for (const node of flowData.nodes || []) {
            const nodeMap = nodesMap.setContainer(node.id, new LoroMap())
            this.setPropertiesRecursive(nodeMap, node)
        }

        // Hydrate edges
        for (const edge of flowData.edges || []) {
            const edgeMap = edgesMap.setContainer(edge.id, new LoroMap())
            this.setPropertiesRecursive(edgeMap, edge)
        }

        // Hydrate viewport
        viewportMap.set('x', flowData.viewport?.x ?? 0)
        viewportMap.set('y', flowData.viewport?.y ?? 0)
        viewportMap.set('zoom', flowData.viewport?.zoom ?? 1)

        this.docs.set(chatflowId, doc)
        this.metadata.set(chatflowId, {
            chatflowId,
            workspaceId,
            lastAccessTime: Date.now(),
            isDirty: false
        })

        logger.info(`✅ [CRDT]: Initialized doc for chatflow ${chatflowId}`)
        return doc
    }

    /**
     * Get or load a Loro document for a chatflow
     */
    async getDoc(chatflowId: string, workspaceId: string): Promise<LoroDoc> {
        // Update access time
        const meta = this.metadata.get(chatflowId)
        if (meta) {
            meta.lastAccessTime = Date.now()
        }

        // Return existing doc if available
        if (this.docs.has(chatflowId)) {
            return this.docs.get(chatflowId)!
        }

        // Load from database
        const chatFlowRepo = this.dataSource.getRepository(ChatFlow)
        const chatFlow = await chatFlowRepo.findOne({
            where: { id: chatflowId }
        })

        if (!chatFlow) {
            throw new Error(`ChatFlow ${chatflowId} not found`)
        }

        const flowData = JSON.parse(chatFlow.flowData)
        return await this.initializeDoc(chatflowId, flowData, workspaceId)
    }

    /**
     * Apply a CRDT update from a client
     */
    async applyUpdate(chatflowId: string, updateBytes: Uint8Array, user: LoggedInUser): Promise<void> {
        const doc = this.docs.get(chatflowId)
        if (!doc) {
            throw new Error(`No doc found for chatflow ${chatflowId}`)
        }

        // Apply the update
        doc.import(updateBytes)

        // Mark as dirty
        const meta = this.metadata.get(chatflowId)
        if (meta) {
            meta.isDirty = true
            meta.updatedByUser = user
            meta.lastAccessTime = Date.now()
        }

        logger.debug(`📝 [CRDT]: Applied update to chatflow ${chatflowId}`)
    }

    /**
     * Get full snapshot for a new client (base64 encoded)
     */
    getSnapshot(chatflowId: string): Uint8Array {
        const doc = this.docs.get(chatflowId)
        if (!doc) {
            throw new Error(`No doc found for chatflow ${chatflowId}`)
        }

        const snapshot = doc.export({ mode: 'snapshot' })

        // Log warning if doc is getting too large
        if (snapshot.byteLength > this.MAX_DOC_SIZE_BYTES) {
            logger.warn(`⚠️ [CRDT]: Large doc for ${chatflowId}: ${Math.round(snapshot.byteLength / 1024 / 1024)} MB`)
        }

        return snapshot
    }

    /**
     * Get incremental update based on client's version
     * Not yet implemented - requires version vector support
     */
    getDeltaUpdate(chatflowId: string, _clientVersion: Uint8Array): Uint8Array {
        // For future optimization: implement incremental sync
        // For now, return full snapshot
        return this.getSnapshot(chatflowId)
    }

    /**
     * Export Loro doc to JSON for DB persistence
     */
    exportToJSON(chatflowId: string): { nodes: any[]; edges: any[]; viewport: any } | null {
        const doc = this.docs.get(chatflowId)
        if (!doc) return null

        const flowMap = doc.getMap('flow')
        const nodesMap = flowMap.get('nodes') as LoroMap
        const edgesMap = flowMap.get('edges') as LoroMap
        const viewportMap = flowMap.get('viewport') as LoroMap

        // Convert LoroMap to plain objects
        const nodes: any[] = []
        if (nodesMap) {
            for (const [_nodeId, nodeMap] of nodesMap.entries()) {
                if (nodeMap instanceof LoroMap) {
                    nodes.push(this.loroMapToObject(nodeMap))
                }
            }
        }

        const edges: any[] = []
        if (edgesMap) {
            for (const [_edgeId, edgeMap] of edgesMap.entries()) {
                if (edgeMap instanceof LoroMap) {
                    edges.push(this.loroMapToObject(edgeMap))
                }
            }
        }

        const viewport = {
            x: viewportMap?.get('x') ?? 0,
            y: viewportMap?.get('y') ?? 0,
            zoom: viewportMap?.get('zoom') ?? 1
        }

        return { nodes, edges, viewport }
    }

    /**
     * Get document metadata (for debugging/monitoring)
     */
    getDocMetadata(chatflowId: string): { nodeCount: number; edgeCount: number; snapshotSize: number } | null {
        const doc = this.docs.get(chatflowId)
        if (!doc) return null

        const flowMap = doc.getMap('flow')
        const nodesMap = flowMap.get('nodes') as LoroMap
        const edgesMap = flowMap.get('edges') as LoroMap

        const snapshot = doc.export({ mode: 'snapshot' })

        return {
            nodeCount: nodesMap ? nodesMap.length : 0,
            edgeCount: edgesMap ? edgesMap.length : 0,
            snapshotSize: snapshot.byteLength
        }
    }

    /**
     * Remove doc from memory (called when room is empty)
     */
    async removeDoc(chatflowId: string): Promise<void> {
        // Save before removing if dirty
        const meta = this.metadata.get(chatflowId)
        if (meta?.isDirty && !this.savingChatflows.has(chatflowId)) {
            await this.saveToDB(chatflowId)
        }

        this.docs.delete(chatflowId)
        this.metadata.delete(chatflowId)
        logger.info(`🗑️ [CRDT]: Removed doc for chatflow ${chatflowId}`)
    }

    /**
     * Recursively set properties on a LoroMap (handles nested objects)
     */
    private setPropertiesRecursive(loroMap: LoroMap, obj: any): void {
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                continue
            }

            if (typeof value === 'object' && !Array.isArray(value)) {
                // Nested object -> create nested LoroMap
                const nestedMap = loroMap.setContainer(key, new LoroMap())
                this.setPropertiesRecursive(nestedMap, value)
            } else if (Array.isArray(value)) {
                // For arrays, serialize to JSON string
                // Alternative: use LoroList for CRDT array operations
                loroMap.set(key, JSON.stringify(value))
            } else {
                // Primitive value
                loroMap.set(key, value)
            }
        }
    }

    /**
     * Recursively convert LoroMap to plain object
     */
    private loroMapToObject(loroMap: LoroMap): any {
        const obj: any = {}
        for (const [key, value] of loroMap.entries()) {
            if (value instanceof LoroMap) {
                obj[key] = this.loroMapToObject(value)
            } else if (typeof value === 'string' && this.isJSONArray(value)) {
                // Deserialize arrays
                try {
                    obj[key] = JSON.parse(value)
                } catch {
                    obj[key] = value
                }
            } else {
                obj[key] = value
            }
        }
        return obj
    }

    /**
     * Check if a string is a JSON array
     */
    private isJSONArray(str: string): boolean {
        if (typeof str !== 'string') return false
        try {
            const parsed = JSON.parse(str)
            return Array.isArray(parsed)
        } catch {
            return false
        }
    }

    /**
     * Save dirty documents to database
     */
    private startPeriodicSave(): void {
        this.saveIntervalId = setInterval(async () => {
            const dirtyDocs = Array.from(this.metadata.entries())
                .filter(([id, meta]) => meta.isDirty && !this.savingChatflows.has(id))
                .map(([id]) => id)

            if (dirtyDocs.length === 0) return

            logger.debug(`💾 [CRDT]: Saving ${dirtyDocs.length} dirty docs`)

            for (const chatflowId of dirtyDocs) {
                try {
                    await this.saveToDB(chatflowId)
                } catch (error) {
                    logger.error(`❌ [CRDT]: Error saving chatflow ${chatflowId}:`, error)
                }
            }
        }, this.SAVE_INTERVAL_MS)
    }

    /**
     * Clean up idle documents from memory
     */
    private startPeriodicCleanup(): void {
        this.cleanupIntervalId = setInterval(async () => {
            const now = Date.now()
            const toRemove: string[] = []

            for (const [chatflowId, meta] of this.metadata.entries()) {
                const idleTime = now - meta.lastAccessTime
                if (idleTime > this.IDLE_TIMEOUT_MS) {
                    toRemove.push(chatflowId)
                }
            }

            if (toRemove.length > 0) {
                logger.info(`🧹 [CRDT]: Cleaning up ${toRemove.length} idle docs`)
                for (const chatflowId of toRemove) {
                    await this.removeDoc(chatflowId)
                }
            }
        }, this.CLEANUP_INTERVAL_MS)
    }

    /**
     * Save a document to the database
     */
    private async saveToDB(chatflowId: string): Promise<void> {
        const meta = this.metadata.get(chatflowId)
        if (!meta) return

        this.savingChatflows.add(chatflowId)

        try {
            const snapshot = this.exportToJSON(chatflowId)
            if (!snapshot) {
                this.savingChatflows.delete(chatflowId)
                return
            }

            const chatflow = await chatflowsService.getChatflowById(chatflowId, meta.workspaceId)
            if (!chatflow) {
                this.savingChatflows.delete(chatflowId)
                return
            }

            const user = meta.updatedByUser
            if (!user) {
                this.savingChatflows.delete(chatflowId)
                return
            }

            const updatedFlowData = {
                nodes: snapshot.nodes,
                edges: snapshot.edges,
                viewport: snapshot.viewport
            }

            const bodyChatFlow = {
                ...chatflow,
                flowData: JSON.stringify(updatedFlowData)
            }

            const updateChatflow = new ChatFlow()
            Object.assign(updateChatflow, bodyChatFlow)

            await chatflowsService.updateChatflow(
                chatflow,
                updateChatflow,
                meta.workspaceId,
                user.activeOrganizationId,
                user.activeOrganizationSubscriptionId
            )

            // Mark as clean
            meta.isDirty = false
            logger.debug(`✅ [CRDT]: Saved chatflow ${chatflowId} to DB`)
        } catch (error) {
            // Re-mark as dirty on error
            meta.isDirty = true
            logger.error(`❌ [CRDT]: Error saving chatflow ${chatflowId}:`, error)
        } finally {
            this.savingChatflows.delete(chatflowId)
        }
    }

    /**
     * Shutdown the service and cleanup resources
     */
    shutdown(): void {
        if (this.saveIntervalId) {
            clearInterval(this.saveIntervalId)
            this.saveIntervalId = null
        }

        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId)
            this.cleanupIntervalId = null
        }

        logger.info('🛑 [CRDT]: Service shutdown complete')
    }

    /**
     * Get stats for monitoring
     */
    getStats() {
        return {
            activeDocuments: this.docs.size,
            dirtyDocuments: Array.from(this.metadata.values()).filter((m) => m.isDirty).length,
            savingDocuments: this.savingChatflows.size
        }
    }
}
