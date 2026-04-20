import { addArrayFilesToStorage, getFileFromStorage, removeFolderFromStorage, removeSpecificFileFromStorage } from 'flowise-components'
import { PublishedPointer, SkillBundle, SkillNodeMeta, SkillNodePayload } from './entities'
import { guessMime } from './utils/tree'
import { sha256 } from './utils/digest'

/**
 * SkillV2Storage — per-skill object-storage wrapper over Flowise's IStorageProvider.
 *
 * Layout (all keys relative to the storage provider's root):
 *
 *   skills-v2/{workspaceId}/{skillId}/
 *     nodes/{nodeId}.json            # md / data / code payloads (content + metadata)
 *     nodes/{nodeId}.bin             # binary payloads
 *     nodes/{nodeId}.meta.json       # sidecar: {digest, size, mime}
 *     artifacts/{bundleId}/bundle.json
 *     artifacts/{bundleId}/resolved/{nodeId}.md
 *     published.json                 # {"currentBundleId": "..."}
 *
 * This class is intentionally thin; every method maps to one IStorageProvider call.
 */

const SKILLS_V2_ROOT = 'skills-v2'

const prefix = (workspaceId: string, skillId: string): string[] => [SKILLS_V2_ROOT, workspaceId, skillId]

// ---------- low-level helpers ----------

const writeBuffer = async (mime: string, buffer: Buffer, filename: string, ...paths: string[]): Promise<void> => {
    // `addArrayFilesToStorage` handles name-collision uniqueness internally; we want deterministic names,
    // so we pre-delete the target file if it exists, ignoring errors.
    try {
        await removeSpecificFileFromStorage(...paths, filename)
    } catch {
        /* noop */
    }
    await addArrayFilesToStorage(mime, buffer, filename, [filename], ...paths)
}

const readBuffer = async (filename: string, ...paths: string[]): Promise<Buffer | null> => {
    try {
        return await getFileFromStorage(filename, ...paths)
    } catch {
        return null
    }
}

// ---------- JSON payloads (skill / data / code nodes) ----------

export const putNodeJson = async (
    workspaceId: string,
    skillId: string,
    nodeId: string,
    payload: SkillNodePayload,
    extension: string
): Promise<SkillNodeMeta> => {
    const json = JSON.stringify(payload)
    const buf = Buffer.from(json, 'utf8')
    const mime = guessMime(extension)
    await writeBuffer('application/json', buf, `${nodeId}.json`, ...prefix(workspaceId, skillId), 'nodes')
    const meta: SkillNodeMeta = { digest: sha256(buf), size: buf.length, mime }
    await putNodeMeta(workspaceId, skillId, nodeId, meta)
    return meta
}

export const getNodeJson = async (workspaceId: string, skillId: string, nodeId: string): Promise<SkillNodePayload | null> => {
    const buf = await readBuffer(`${nodeId}.json`, ...prefix(workspaceId, skillId), 'nodes')
    if (!buf) return null
    try {
        return JSON.parse(buf.toString('utf8')) as SkillNodePayload
    } catch {
        return null
    }
}

// ---------- Binary payloads ----------

export const putNodeBinary = async (
    workspaceId: string,
    skillId: string,
    nodeId: string,
    buffer: Buffer,
    mime: string
): Promise<SkillNodeMeta> => {
    await writeBuffer(mime, buffer, `${nodeId}.bin`, ...prefix(workspaceId, skillId), 'nodes')
    const meta: SkillNodeMeta = { digest: sha256(buffer), size: buffer.length, mime }
    await putNodeMeta(workspaceId, skillId, nodeId, meta)
    return meta
}

export const getNodeBinary = async (workspaceId: string, skillId: string, nodeId: string): Promise<Buffer | null> => {
    return readBuffer(`${nodeId}.bin`, ...prefix(workspaceId, skillId), 'nodes')
}

// ---------- Per-node meta sidecar ----------

export const putNodeMeta = async (workspaceId: string, skillId: string, nodeId: string, meta: SkillNodeMeta): Promise<void> => {
    const buf = Buffer.from(JSON.stringify(meta), 'utf8')
    await writeBuffer('application/json', buf, `${nodeId}.meta.json`, ...prefix(workspaceId, skillId), 'nodes')
}

export const getNodeMeta = async (workspaceId: string, skillId: string, nodeId: string): Promise<SkillNodeMeta | null> => {
    const buf = await readBuffer(`${nodeId}.meta.json`, ...prefix(workspaceId, skillId), 'nodes')
    if (!buf) return null
    try {
        return JSON.parse(buf.toString('utf8')) as SkillNodeMeta
    } catch {
        return null
    }
}

// ---------- Node delete ----------

export const deleteNodeAssets = async (workspaceId: string, skillId: string, nodeId: string): Promise<void> => {
    const base = prefix(workspaceId, skillId).concat('nodes')
    for (const fname of [`${nodeId}.json`, `${nodeId}.bin`, `${nodeId}.meta.json`]) {
        try {
            await removeSpecificFileFromStorage(...base, fname)
        } catch {
            /* noop */
        }
    }
}

// ---------- Bundle artifacts ----------

export const putBundle = async (workspaceId: string, skillId: string, bundleId: string, bundle: SkillBundle): Promise<void> => {
    const buf = Buffer.from(JSON.stringify(bundle), 'utf8')
    await writeBuffer('application/json', buf, `bundle.json`, ...prefix(workspaceId, skillId), 'artifacts', bundleId)
}

export const getBundle = async (workspaceId: string, skillId: string, bundleId: string): Promise<SkillBundle | null> => {
    const buf = await readBuffer(`bundle.json`, ...prefix(workspaceId, skillId), 'artifacts', bundleId)
    if (!buf) return null
    try {
        return JSON.parse(buf.toString('utf8')) as SkillBundle
    } catch {
        return null
    }
}

export const putResolvedMd = async (
    workspaceId: string,
    skillId: string,
    bundleId: string,
    nodeId: string,
    content: string
): Promise<void> => {
    const buf = Buffer.from(content, 'utf8')
    await writeBuffer('text/markdown', buf, `${nodeId}.md`, ...prefix(workspaceId, skillId), 'artifacts', bundleId, 'resolved')
}

// ---------- Published pointer ----------

export const putPublishedPointer = async (workspaceId: string, skillId: string, pointer: PublishedPointer): Promise<void> => {
    const buf = Buffer.from(JSON.stringify(pointer), 'utf8')
    await writeBuffer('application/json', buf, `published.json`, ...prefix(workspaceId, skillId))
}

export const getPublishedPointer = async (workspaceId: string, skillId: string): Promise<PublishedPointer | null> => {
    const buf = await readBuffer(`published.json`, ...prefix(workspaceId, skillId))
    if (!buf) return null
    try {
        return JSON.parse(buf.toString('utf8')) as PublishedPointer
    } catch {
        return null
    }
}

// ---------- Full-skill cleanup ----------

export const deleteSkillPrefix = async (workspaceId: string, skillId: string): Promise<void> => {
    try {
        await removeFolderFromStorage(...prefix(workspaceId, skillId))
    } catch {
        /* noop */
    }
}
