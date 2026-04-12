/**
 * Node retrieval service — server-side wrapper for loading nodes/edges
 * and delegating to the pure retrieval algorithm.
 *
 * This module provides DB-aware functions for node retrieval that can
 * be used by server-side callers. The pure retrieval algorithm lives
 * in packages/components/nodes/tools/SkillTool/compiler/retriever.ts.
 */

import { SkillNode } from '../../database/entities/SkillNode'
import { SkillEdge } from '../../database/entities/SkillEdge'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

/**
 * Load all nodes for a skill file, ordered by priority (desc) then orderIndex (asc).
 */
export async function loadNodesForFile(skillFileId: string, workspaceId: string): Promise<SkillNode[]> {
    const appServer = getRunningExpressApp()
    return appServer.AppDataSource.getRepository(SkillNode).find({
        where: { skillFileId, workspaceId },
        order: { priority: 'DESC', orderIndex: 'ASC' }
    })
}

/**
 * Load all edges for a skill file.
 */
export async function loadEdgesForFile(skillFileId: string, workspaceId: string): Promise<SkillEdge[]> {
    const appServer = getRunningExpressApp()
    return appServer.AppDataSource.getRepository(SkillEdge).find({
        where: { skillFileId, workspaceId }
    })
}

/**
 * Load nodes for an entire folder, grouped by skillFileId.
 */
export async function loadNodesForFolder(folderId: string, workspaceId: string): Promise<Record<string, SkillNode[]>> {
    const appServer = getRunningExpressApp()
    const nodes = await appServer.AppDataSource.getRepository(SkillNode).find({
        where: { folderId, workspaceId },
        order: { priority: 'DESC', orderIndex: 'ASC' }
    })

    const grouped: Record<string, SkillNode[]> = {}
    for (const node of nodes) {
        if (!grouped[node.skillFileId]) grouped[node.skillFileId] = []
        grouped[node.skillFileId].push(node)
    }
    return grouped
}

/**
 * Load edges for an entire folder, grouped by skillFileId.
 */
export async function loadEdgesForFolder(folderId: string, workspaceId: string): Promise<Record<string, SkillEdge[]>> {
    const appServer = getRunningExpressApp()
    const edges = await appServer.AppDataSource.getRepository(SkillEdge).find({
        where: { folderId, workspaceId }
    })

    const grouped: Record<string, SkillEdge[]> = {}
    for (const edge of edges) {
        if (!grouped[edge.skillFileId]) grouped[edge.skillFileId] = []
        grouped[edge.skillFileId].push(edge)
    }
    return grouped
}
