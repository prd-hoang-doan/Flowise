import { StatusCodes } from 'http-status-codes'
import { SkillV2 } from '../../database/entities/SkillV2'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import {
    CompileInput,
    CreateSkillDto,
    PublishedPointer,
    SkillBundle,
    SkillDocument,
    SkillFileTree,
    SkillNodePayload,
    UpdateSkillDto
} from './entities'
import { SkillV2Compiler } from './compiler/SkillV2Compiler'
import * as SkillV2Storage from './SkillV2Storage'
import * as SkillBundleManager from './bundle/SkillBundleManager'
import { buildSkillGraph, SkillGraphDTO } from './bundle/SkillGraphBuilder'
import { canonicalJson, sha256 } from './utils/digest'
import { parseFileTree, serializeFileTree, buildIndex, computePath, classifyKind } from './utils/tree'

/**
 * Skill-row CRUD + publish pipeline. Node-level tree mutations live in
 * SkillTreeService.ts to keep this class focused on row-level concerns.
 */

const repo = () => getRunningExpressApp().AppDataSource.getRepository(SkillV2)

export const createSkill = async (workspaceId: string, dto: CreateSkillDto): Promise<SkillV2> => {
    try {
        if (!dto.name || !dto.name.trim()) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Skill name is required')
        }

        // UNIQUE (workspaceId, name) — enforced in service because SQLite/MySQL indexes differ.
        const existing = await repo().findOneBy({ workspaceId, name: dto.name.trim() })
        if (existing) {
            throw new InternalFlowiseError(StatusCodes.CONFLICT, `A skill named "${dto.name}" already exists`)
        }

        const emptyTree: SkillFileTree = { nodes: [] }
        const fileTree = serializeFileTree(emptyTree)
        const contentDigest = sha256(canonicalJson({ fileTree: emptyTree, nodes: [] }))

        const row = repo().create({
            workspaceId,
            name: dto.name.trim(),
            description: dto.description ?? null,
            iconSrc: dto.iconSrc ?? null,
            color: dto.color ?? null,
            fileTree,
            contentDigest,
            publishedBundleId: null
        })
        return await repo().save(row)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.createSkill - ${getErrorMessage(error)}`)
    }
}

export const getSkillById = async (workspaceId: string, skillId: string): Promise<SkillV2> => {
    const row = await repo().findOneBy({ id: skillId, workspaceId })
    if (!row) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Skill ${skillId} not found`)
    return row
}

export const listSkills = async (workspaceId: string, page = -1, limit = -1) => {
    try {
        const qb = repo().createQueryBuilder('skill_v2').orderBy('skill_v2.updatedDate', 'DESC')
        if (page > 0 && limit > 0) {
            qb.skip((page - 1) * limit)
            qb.take(limit)
        }
        qb.andWhere('skill_v2.workspaceId = :workspaceId', { workspaceId })
        const [data, total] = await qb.getManyAndCount()
        const shaped = data.map((row) => shapeForList(row))
        return page > 0 && limit > 0 ? { data: shaped, total } : shaped
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.listSkills - ${getErrorMessage(error)}`)
    }
}

const shapeForList = (row: SkillV2) => {
    const tree = parseFileTree(row.fileTree)
    const nodeCount = tree.nodes.length
    const fileCount = tree.nodes.filter((n) => n.node_type === 'file').length
    return {
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        description: row.description,
        iconSrc: row.iconSrc,
        color: row.color,
        contentDigest: row.contentDigest,
        publishedBundleId: row.publishedBundleId,
        createdDate: row.createdDate,
        updatedDate: row.updatedDate,
        nodeCount,
        fileCount
    }
}

export const updateSkill = async (workspaceId: string, skillId: string, dto: UpdateSkillDto): Promise<SkillV2> => {
    try {
        const row = await getSkillById(workspaceId, skillId)

        if (dto.name !== undefined) {
            const name = dto.name.trim()
            if (!name) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Skill name cannot be empty')
            if (name !== row.name) {
                const conflict = await repo().findOneBy({ workspaceId, name })
                if (conflict) throw new InternalFlowiseError(StatusCodes.CONFLICT, `A skill named "${name}" already exists`)
                row.name = name
            }
        }
        if (dto.description !== undefined) row.description = dto.description ?? null
        if (dto.iconSrc !== undefined) row.iconSrc = dto.iconSrc ?? null
        if (dto.color !== undefined) row.color = dto.color ?? null

        return await repo().save(row)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.updateSkill - ${getErrorMessage(error)}`)
    }
}

export const deleteSkill = async (workspaceId: string, skillId: string): Promise<void> => {
    try {
        await getSkillById(workspaceId, skillId) // 404 if missing
        await repo().delete({ id: skillId, workspaceId })
        await SkillV2Storage.deleteSkillPrefix(workspaceId, skillId)
        SkillBundleManager.invalidateSkill(workspaceId, skillId)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.deleteSkill - ${getErrorMessage(error)}`)
    }
}

// -----------------------------------------------------------------------------
// Compile + publish
// -----------------------------------------------------------------------------

/**
 * Build a `CompileInput` by reading every file node's payload from storage.
 * This is the only place that does a full storage traversal per skill.
 */
const loadCompileInput = async (row: SkillV2): Promise<CompileInput> => {
    const tree = parseFileTree(row.fileTree)
    const index = buildIndex(tree)
    const nodeDocuments: SkillDocument[] = []

    for (const node of tree.nodes) {
        if (node.node_type !== 'file') continue
        const kind = classifyKind(node.extension)
        const path = computePath(node.id, index)
        const meta = await SkillV2Storage.getNodeMeta(row.workspaceId, row.id, node.id)
        const digest = meta?.digest ?? ''

        let content = ''
        let metadata: SkillNodePayload['metadata'] = undefined
        if (kind !== 'binary') {
            const payload = await SkillV2Storage.getNodeJson(row.workspaceId, row.id, node.id)
            if (payload) {
                content = payload.content ?? ''
                metadata = payload.metadata
            }
        }

        nodeDocuments.push({
            nodeId: node.id,
            kind,
            path,
            filename: node.name,
            extension: node.extension,
            content,
            metadata: metadata ?? { tools: {} },
            contentDigest: digest
        })
    }

    return { skillId: row.id, workspaceId: row.workspaceId, fileTree: tree, nodeDocuments }
}

export const compileAll = async (workspaceId: string, skillId: string): Promise<SkillBundle> => {
    try {
        const row = await getSkillById(workspaceId, skillId)
        const input = await loadCompileInput(row)
        const compiler = new SkillV2Compiler()
        const bundle = compiler.compileAll(input)
        return bundle
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.compileAll - ${getErrorMessage(error)}`)
    }
}

export const publish = async (workspaceId: string, skillId: string): Promise<SkillBundle> => {
    try {
        const bundle = await compileAll(workspaceId, skillId)
        await SkillBundleManager.putBundle(bundle)

        // Write resolved markdown sidecars for inspection.
        for (const entry of Object.values(bundle.entries)) {
            if (entry.kind === 'skill') {
                await SkillV2Storage.putResolvedMd(workspaceId, skillId, bundle.bundleId, entry.nodeId, entry.content)
            }
        }

        const pointer: PublishedPointer = { currentBundleId: bundle.bundleId, publishedAt: bundle.builtAt }
        await SkillV2Storage.putPublishedPointer(workspaceId, skillId, pointer)

        await repo().update({ id: skillId, workspaceId }, { publishedBundleId: bundle.bundleId })
        return bundle
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.publish - ${getErrorMessage(error)}`)
    }
}

export const loadPublishedBundle = async (workspaceId: string, skillId: string): Promise<SkillBundle | null> => {
    const row = await getSkillById(workspaceId, skillId)
    if (!row.publishedBundleId) return null
    return SkillBundleManager.getBundle(workspaceId, skillId, row.publishedBundleId)
}

export const loadDraftBundle = async (workspaceId: string, skillId: string): Promise<SkillBundle> => {
    const bundle = await compileAll(workspaceId, skillId)
    return bundle
}

export const getGraph = async (workspaceId: string, skillId: string, mode: 'draft' | 'published' = 'draft'): Promise<SkillGraphDTO> => {
    try {
        const bundle = mode === 'published' ? await loadPublishedBundle(workspaceId, skillId) : await loadDraftBundle(workspaceId, skillId)
        if (!bundle) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'No bundle published yet')
        }
        return buildSkillGraph(bundle)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: skillsV2Service.getGraph - ${getErrorMessage(error)}`)
    }
}

export const getDependencies = async (workspaceId: string, skillId: string, nodeId?: string) => {
    const bundle = await compileAll(workspaceId, skillId)
    if (!nodeId) {
        const allIds = Object.keys(bundle.entries)
        return aggregateEntries(bundle, allIds)
    }
    const entry = bundle.entries[nodeId]
    if (!entry) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node ${nodeId} not found`)
    const direct = { tools: entry.tools.dependencies, files: entry.files.references.map((f) => f.nodeId) }
    const transitive = aggregateEntries(bundle, collectTransitive(bundle, nodeId))
    return { direct, transitive }
}

const collectTransitive = (bundle: SkillBundle, nodeId: string): string[] => {
    const out = new Set<string>([nodeId])
    const stack = [nodeId]
    while (stack.length) {
        const cur = stack.pop()!
        for (const dep of bundle.dependencyGraph[cur] || []) {
            if (!out.has(dep)) {
                out.add(dep)
                stack.push(dep)
            }
        }
    }
    return Array.from(out)
}

const aggregateEntries = (bundle: SkillBundle, nodeIds: string[]) => {
    const tools: string[] = []
    const files: string[] = []
    const seenTools = new Set<string>()
    const seenFiles = new Set<string>()
    for (const id of nodeIds) {
        const entry = bundle.entries[id]
        if (!entry) continue
        for (const dep of entry.tools.dependencies) {
            const key = `${dep.provider}.${dep.toolName}`
            if (!seenTools.has(key)) {
                tools.push(key)
                seenTools.add(key)
            }
        }
        for (const f of entry.files.references) {
            if (!seenFiles.has(f.nodeId)) {
                files.push(f.nodeId)
                seenFiles.add(f.nodeId)
            }
        }
    }
    return { tools, files }
}

// -----------------------------------------------------------------------------
// Internal helpers used by SkillTreeService
// -----------------------------------------------------------------------------

export const saveFileTree = async (workspaceId: string, skillId: string, tree: SkillFileTree): Promise<SkillV2> => {
    const row = await getSkillById(workspaceId, skillId)
    const serialized = serializeFileTree(tree)
    row.fileTree = serialized
    row.contentDigest = await computeContentDigest(workspaceId, skillId, tree)
    const saved = await repo().save(row)
    SkillBundleManager.invalidateSkill(workspaceId, skillId)
    return saved
}

export const computeContentDigest = async (workspaceId: string, skillId: string, tree: SkillFileTree): Promise<string> => {
    const nodes: Array<{ id: string; digest: string }> = []
    for (const node of tree.nodes) {
        if (node.node_type !== 'file') continue
        const meta = await SkillV2Storage.getNodeMeta(workspaceId, skillId, node.id)
        nodes.push({ id: node.id, digest: meta?.digest ?? '' })
    }
    nodes.sort((a, b) => a.id.localeCompare(b.id))
    return sha256(canonicalJson({ fileTree: tree, nodes }))
}
