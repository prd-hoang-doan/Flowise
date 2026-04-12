/**
 * SkillCompileCache service — CRUD operations for compiled skill prompt caching.
 * Stores compiled output keyed by a content hash to avoid redundant recompilation.
 */

import { SkillCompileCache } from '../../database/entities/SkillCompileCache'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { getErrorMessage } from '../../errors/utils'

/**
 * Find a cached compilation by skillFileId, hash, and executionMode.
 */
const findCache = async (
    skillFileId: string,
    hash: string,
    executionMode: string,
    workspaceId: string
): Promise<SkillCompileCache | null> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(SkillCompileCache).findOneBy({
            skillFileId,
            hash,
            executionMode,
            workspaceId
        })
    } catch {
        return null
    }
}

/**
 * Save a compiled prompt to the cache.
 * Replaces any existing cache entry for the same skillFileId + executionMode.
 */
const saveCache = async (
    skillFileId: string,
    folderId: string,
    hash: string,
    compiledPrompt: string,
    tokenCount: number,
    executionMode: string,
    workspaceId: string
): Promise<SkillCompileCache | null> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(SkillCompileCache)

        // Remove stale entries for this file + mode
        await repo.delete({ skillFileId, executionMode, workspaceId })

        const entry = new SkillCompileCache()
        entry.skillFileId = skillFileId
        entry.folderId = folderId
        entry.hash = hash
        entry.compiledPrompt = compiledPrompt
        entry.tokenCount = tokenCount
        entry.executionMode = executionMode
        entry.workspaceId = workspaceId

        return await repo.save(entry)
    } catch (error) {
        console.error(`[SkillCompileCache] Save failed: ${getErrorMessage(error)}`)
        return null
    }
}

/**
 * Invalidate all cache entries for a skill file.
 */
const invalidateByFileId = async (skillFileId: string, workspaceId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        await appServer.AppDataSource.getRepository(SkillCompileCache).delete({
            skillFileId,
            workspaceId
        })
    } catch {
        // Table may not exist yet
    }
}

/**
 * Invalidate all cache entries for a folder.
 */
const invalidateByFolderId = async (folderId: string, workspaceId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        await appServer.AppDataSource.getRepository(SkillCompileCache).delete({
            folderId,
            workspaceId
        })
    } catch {
        // Table may not exist yet
    }
}

export default {
    findCache,
    saveCache,
    invalidateByFileId,
    invalidateByFolderId
}
