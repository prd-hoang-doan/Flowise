/**
 * SkillNode service — CRUD operations for skill nodes and edges,
 * plus the extraction orchestration that ties into skill file save.
 */

import { StatusCodes } from 'http-status-codes'
import { SkillNode } from '../../database/entities/SkillNode'
import { SkillEdge } from '../../database/entities/SkillEdge'
import { SkillFile } from '../../database/entities/SkillFile'
import { SkillAsset } from '../../database/entities/SkillAsset'
import { SkillCompileCache } from '../../database/entities/SkillCompileCache'
import { SkillFolder } from '../../database/entities/SkillFolder'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { extract, computeHash, RawSkillInput } from './extractor'
import skillEmbeddingsService from '../skill-embeddings'

/**
 * Run the extraction pipeline for a skill file.
 * Compares content hash to skip extraction if content hasn't changed.
 * Called after createSkillFile(), updateSkillFile(), and asset mutations.
 *
 * @param force - Skip hash check and force re-extraction (used after asset changes)
 */
const extractNodes = async (skillFileId: string, folderId: string, workspaceId: string, force?: boolean): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()

        const file = await appServer.AppDataSource.getRepository(SkillFile).findOneBy({
            id: skillFileId,
            folderId,
            workspaceId
        })
        if (!file || !file.content) return

        // Check if content has changed (skip when forced, e.g. after asset mutations)
        if (!force) {
            const contentHash = computeHash(file.content)
            if (file.compileHash === contentHash) return // No changes, skip extraction
        }

        // Load assets for this file
        let assets: Array<{ id: string; filename: string; caption?: string }> = []
        try {
            const assetRecords = await appServer.AppDataSource.getRepository(SkillAsset).find({
                where: { folderId, fileId: skillFileId, workspaceId }
            })
            assets = assetRecords.map((a) => ({ id: a.id, filename: a.filename, caption: a.caption }))
        } catch {
            // SkillAsset table may not exist yet
        }

        const input: RawSkillInput = {
            skillFileId,
            folderId,
            name: file.name,
            description: file.description || '',
            content: file.content,
            workspaceId,
            assets
        }

        const result = extract(input)

        // Use a transaction to atomically replace nodes/edges and update hash
        await appServer.AppDataSource.transaction(async (manager) => {
            // Delete existing edges first (FK dependency on nodes)
            await manager.delete(SkillEdge, { skillFileId, workspaceId })

            // Delete existing nodes
            await manager.delete(SkillNode, { skillFileId, workspaceId })

            // Invalidate compile cache
            try {
                await manager.delete(SkillCompileCache, { skillFileId, workspaceId })
            } catch {
                // SkillCompileCache table may not exist yet
            }

            // Insert new nodes
            if (result.nodes.length > 0) {
                const nodeEntities = result.nodes.map((n) => {
                    const node = new SkillNode()
                    Object.assign(node, n)
                    return node
                })
                await manager.save(SkillNode, nodeEntities)
            }

            // Insert new edges
            if (result.edges.length > 0) {
                const edgeEntities = result.edges.map((e) => {
                    const edge = new SkillEdge()
                    Object.assign(edge, e)
                    return edge
                })
                await manager.save(SkillEdge, edgeEntities)
            }

            // Update compileHash on the skill file
            await manager.update(SkillFile, { id: skillFileId }, { compileHash: result.compileHash })
        })

        // Generate embeddings for extracted nodes (non-blocking)
        try {
            const folder = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({ id: folderId, workspaceId })
            if (folder?.embeddingModelConfig) {
                const embeddingConfig = JSON.parse(folder.embeddingModelConfig)
                if (embeddingConfig && embeddingConfig.name) {
                    // Load persisted nodes (they have IDs assigned after save)
                    const persistedNodes = await appServer.AppDataSource.getRepository(SkillNode).find({
                        where: { skillFileId, workspaceId }
                    })
                    await skillEmbeddingsService.embedNodesForFile(
                        skillFileId,
                        folderId,
                        persistedNodes,
                        embeddingConfig,
                        appServer.AppDataSource,
                        workspaceId
                    )
                }
            }
        } catch {
            // Embedding failure does not block node extraction
        }
    } catch (error) {
        // Extraction errors should not block file save — log and continue
        console.error(`[SkillNodeExtractor] Extraction failed for file ${skillFileId}: ${getErrorMessage(error)}`)
    }
}

/**
 * Get all nodes for a skill file
 */
const getNodesBySkillFileId = async (skillFileId: string, workspaceId: string): Promise<SkillNode[]> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(SkillNode).find({
            where: { skillFileId, workspaceId },
            order: { priority: 'DESC', orderIndex: 'ASC' }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillNodesService.getNodesBySkillFileId - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get all edges for a skill file
 */
const getEdgesBySkillFileId = async (skillFileId: string, workspaceId: string): Promise<SkillEdge[]> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(SkillEdge).find({
            where: { skillFileId, workspaceId }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillNodesService.getEdgesBySkillFileId - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Delete all nodes and edges for a skill file
 */
const deleteBySkillFileId = async (skillFileId: string, workspaceId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        await appServer.AppDataSource.transaction(async (manager) => {
            // Delete embeddings first (FK on nodeId)
            try {
                const { SkillNodeEmbedding } = await import('../../database/entities/SkillNodeEmbedding')
                await manager.delete(SkillNodeEmbedding, { skillFileId, workspaceId })
            } catch {
                // Table may not exist yet
            }
            await manager.delete(SkillEdge, { skillFileId, workspaceId })
            await manager.delete(SkillNode, { skillFileId, workspaceId })
            try {
                await manager.delete(SkillCompileCache, { skillFileId, workspaceId })
            } catch {
                // Table may not exist yet
            }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillNodesService.deleteBySkillFileId - ${getErrorMessage(error)}`
        )
    }
}

export default {
    extractNodes,
    getNodesBySkillFileId,
    getEdgesBySkillFileId,
    deleteBySkillFileId
}
