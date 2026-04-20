import { SkillBundle } from '../entities'
import * as SkillV2Storage from '../SkillV2Storage'

/**
 * Two-tier cache (process memory → object storage) for compiled `SkillBundle`s.
 *
 * Redis is intentionally omitted in this first cut — Flowise core does not
 * expose a shared Redis client today. The memory cache gives single-process
 * O(1) hits; storage gives correctness across process restarts.
 *
 * Cache keys: `${workspaceId}:${skillId}:${bundleId}`.
 */

interface CacheEntry {
    bundle: SkillBundle
    expiresAt: number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 128

const memoryCache = new Map<string, CacheEntry>()

const makeKey = (workspaceId: string, skillId: string, bundleId: string): string => `${workspaceId}:${skillId}:${bundleId}`

const evictIfNeeded = (): void => {
    while (memoryCache.size > MAX_ENTRIES) {
        // LRU approximation — Map preserves insertion order, so delete the first key.
        const firstKey = memoryCache.keys().next().value as string | undefined
        if (!firstKey) break
        memoryCache.delete(firstKey)
    }
}

export const getBundle = async (workspaceId: string, skillId: string, bundleId: string): Promise<SkillBundle | null> => {
    const key = makeKey(workspaceId, skillId, bundleId)
    const entry = memoryCache.get(key)
    if (entry && entry.expiresAt > Date.now()) {
        // Bump recency: delete + reinsert
        memoryCache.delete(key)
        memoryCache.set(key, entry)
        return entry.bundle
    }
    if (entry) memoryCache.delete(key)

    const fromStorage = await SkillV2Storage.getBundle(workspaceId, skillId, bundleId)
    if (!fromStorage) return null
    memoryCache.set(key, { bundle: fromStorage, expiresAt: Date.now() + DEFAULT_TTL_MS })
    evictIfNeeded()
    return fromStorage
}

export const putBundle = async (bundle: SkillBundle): Promise<void> => {
    await SkillV2Storage.putBundle(bundle.workspaceId, bundle.skillId, bundle.bundleId, bundle)
    const key = makeKey(bundle.workspaceId, bundle.skillId, bundle.bundleId)
    memoryCache.set(key, { bundle, expiresAt: Date.now() + DEFAULT_TTL_MS })
    evictIfNeeded()
}

export const invalidateSkill = (workspaceId: string, skillId: string): void => {
    const prefix = `${workspaceId}:${skillId}:`
    for (const key of memoryCache.keys()) {
        if (key.startsWith(prefix)) memoryCache.delete(key)
    }
}

export const clearAll = (): void => {
    memoryCache.clear()
}
