/**
 * SkillEmbeddingService — generates and persists embedding vectors for skill nodes.
 * Supports incremental embedding (skip unchanged nodes) and batch processing.
 */

import crypto from 'crypto'
import { DataSource } from 'typeorm'
import { ISkillNode } from '../../Interface'
import { SkillNode } from '../../database/entities/SkillNode'
import { SkillNodeEmbedding } from '../../database/entities/SkillNodeEmbedding'
import { prepareEmbeddingText } from './textPreparation'
import { createEmbeddingInstance, EmbeddingModelConfig } from './embeddingProvider'
import logger from '../../utils/logger'

export interface EmbedResult {
    embedded: number
    skipped: number
    errors: number
    timeMs: number
}

function computeContentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex')
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

/**
 * Generate embeddings for all nodes in a skill file.
 * Skips nodes whose contentHash hasn't changed.
 */
const embedNodesForFile = async (
    skillFileId: string,
    folderId: string,
    nodes: ISkillNode[],
    config: EmbeddingModelConfig,
    appDataSource: DataSource,
    workspaceId: string
): Promise<EmbedResult> => {
    const start = Date.now()
    let embedded = 0
    let skipped = 0
    let errors = 0

    try {
        const embeddingRepo = appDataSource.getRepository(SkillNodeEmbedding)
        const nodeRepo = appDataSource.getRepository(SkillNode)

        // Load existing embeddings for these nodes
        const existingEmbeddings = await embeddingRepo.find({
            where: { skillFileId, workspaceId }
        })
        const embeddingByNodeId = new Map(existingEmbeddings.map((e) => [e.nodeId, e]))

        // Prepare texts and check which nodes need embedding
        const nodesToEmbed: Array<{ node: ISkillNode; text: string; hash: string }> = []
        for (const node of nodes) {
            const text = prepareEmbeddingText(node)
            const hash = computeContentHash(text)

            const existing = embeddingByNodeId.get(node.id)
            if (existing && existing.contentHash === hash) {
                skipped++
                continue
            }
            nodesToEmbed.push({ node, text, hash })
        }

        if (nodesToEmbed.length === 0) {
            return { embedded, skipped, errors, timeMs: Date.now() - start }
        }

        // Create embedding model instance
        const embeddingModel = await createEmbeddingInstance(config)
        const batchSize = config.inputs?.batchSize ? parseInt(config.inputs.batchSize, 10) : 100
        const modelId = `${config.name}`

        // Process in batches
        const batches = chunk(nodesToEmbed, batchSize)
        for (const batch of batches) {
            try {
                const texts = batch.map((b) => b.text)
                const vectors = await embeddingModel.embedDocuments(texts)

                // Persist embeddings and update embeddingText
                for (let i = 0; i < batch.length; i++) {
                    const { node, text, hash } = batch[i]
                    const vector = vectors[i]
                    const dimension = vector.length

                    const existing = embeddingByNodeId.get(node.id)
                    if (existing) {
                        // Update existing embedding
                        existing.embedding = JSON.stringify(vector)
                        existing.dimension = dimension
                        existing.modelId = modelId
                        existing.contentHash = hash
                        await embeddingRepo.save(existing)
                    } else {
                        // Insert new embedding
                        const newEmbedding = new SkillNodeEmbedding()
                        newEmbedding.nodeId = node.id
                        newEmbedding.skillFileId = skillFileId
                        newEmbedding.folderId = folderId
                        newEmbedding.embedding = JSON.stringify(vector)
                        newEmbedding.dimension = dimension
                        newEmbedding.modelId = modelId
                        newEmbedding.contentHash = hash
                        newEmbedding.workspaceId = workspaceId
                        await embeddingRepo.save(newEmbedding)
                    }

                    // Populate embeddingText on SkillNode (WI-P5-8)
                    try {
                        await nodeRepo.update(node.id, { embeddingText: text })
                    } catch {
                        // Non-critical — embeddingText population failure should not block
                    }

                    embedded++
                }
            } catch (batchError) {
                logger.error(`[SkillEmbeddingService] Batch embedding failed: ${batchError}`)
                errors += batch.length
            }
        }
    } catch (error) {
        logger.error(`[SkillEmbeddingService] embedNodesForFile failed for file ${skillFileId}: ${error}`)
        errors += nodes.length - skipped
    }

    const result = { embedded, skipped, errors, timeMs: Date.now() - start }
    logger.info(
        `[SkillEmbeddingService] File ${skillFileId}: embedded=${result.embedded}, skipped=${result.skipped}, errors=${result.errors}, time=${result.timeMs}ms`
    )
    return result
}

/**
 * Re-embed all nodes in a folder (e.g. after model config change).
 */
const reembedFolder = async (
    folderId: string,
    config: EmbeddingModelConfig,
    appDataSource: DataSource,
    workspaceId: string
): Promise<EmbedResult> => {
    const start = Date.now()
    let totalEmbedded = 0
    let totalSkipped = 0
    let totalErrors = 0

    try {
        const nodeRepo = appDataSource.getRepository(SkillNode)
        const embeddingRepo = appDataSource.getRepository(SkillNodeEmbedding)

        // Delete all existing embeddings for this folder (model changed)
        await embeddingRepo.delete({ folderId, workspaceId })

        // Load all nodes in the folder
        const allNodes = await nodeRepo.find({ where: { folderId, workspaceId } })

        // Group by skillFileId
        const nodesByFile = new Map<string, ISkillNode[]>()
        for (const node of allNodes) {
            const fileNodes = nodesByFile.get(node.skillFileId) || []
            fileNodes.push(node)
            nodesByFile.set(node.skillFileId, fileNodes)
        }

        // Embed each file's nodes
        for (const [fileId, fileNodes] of nodesByFile) {
            const result = await embedNodesForFile(fileId, folderId, fileNodes, config, appDataSource, workspaceId)
            totalEmbedded += result.embedded
            totalSkipped += result.skipped
            totalErrors += result.errors
        }
    } catch (error) {
        logger.error(`[SkillEmbeddingService] reembedFolder failed for folder ${folderId}: ${error}`)
    }

    const result = { embedded: totalEmbedded, skipped: totalSkipped, errors: totalErrors, timeMs: Date.now() - start }
    logger.info(
        `[SkillEmbeddingService] Folder ${folderId} re-embed: embedded=${result.embedded}, skipped=${result.skipped}, errors=${result.errors}, time=${result.timeMs}ms`
    )
    return result
}

/**
 * Delete embeddings for a skill file (cleanup on file delete).
 */
const deleteBySkillFileId = async (skillFileId: string, appDataSource: DataSource, workspaceId: string): Promise<void> => {
    try {
        await appDataSource.getRepository(SkillNodeEmbedding).delete({ skillFileId, workspaceId })
    } catch (error) {
        logger.error(`[SkillEmbeddingService] deleteBySkillFileId failed for file ${skillFileId}: ${error}`)
    }
}

/**
 * Delete all embeddings for a folder (cleanup on folder delete).
 */
const deleteByFolderId = async (folderId: string, appDataSource: DataSource, workspaceId: string): Promise<void> => {
    try {
        await appDataSource.getRepository(SkillNodeEmbedding).delete({ folderId, workspaceId })
    } catch (error) {
        logger.error(`[SkillEmbeddingService] deleteByFolderId failed for folder ${folderId}: ${error}`)
    }
}

export default {
    embedNodesForFile,
    reembedFolder,
    deleteBySkillFileId,
    deleteByFolderId
}
