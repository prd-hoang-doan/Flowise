import { Tool, ToolParams } from '@langchain/core/tools'
import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../src/Interface'
import { DataSource } from 'typeorm'
import { SkillCompiler, formatToolName } from './compiler/SkillCompiler'
import {
    MultimodalContentPart,
    MULTIMODAL_CONTENT_KEY,
    SkillAssetInput,
    SkillNodeInput,
    SkillEdgeInput,
    NodeCompileConfig,
    NodeEmbeddingInput
} from './compiler/types'
import { compileFromNodes, computeCompileHash } from './compiler/nodeCompiler'
import { retrieveRelevantNodes } from './compiler/semanticRetriever'

export { MultimodalContentPart, MULTIMODAL_CONTENT_KEY }

class SkillFileTool extends Tool {
    name: string
    description: string
    private content: string
    private multimodalContent: MultimodalContentPart[] | null
    // Node-aware fields (Phase 4)
    private nodes: SkillNodeInput[] | null
    private edges: SkillEdgeInput[] | null
    private skillName: string
    private skillDescription: string
    private fileAssets: SkillAssetInput[]
    private nodeCompileConfig: NodeCompileConfig | null
    private maxRetrievedNodes: number
    // Embedding fields (Phase 5)
    private embeddings: NodeEmbeddingInput[]
    private embeddingModelConfig: ICommonObject | null
    private embeddingModelInstance: any | null

    constructor(
        fields: ToolParams & {
            name: string
            description: string
            content: string
            multimodalContent?: MultimodalContentPart[] | null
            nodes?: SkillNodeInput[] | null
            edges?: SkillEdgeInput[] | null
            skillName?: string
            skillDescription?: string
            fileAssets?: SkillAssetInput[]
            nodeCompileConfig?: NodeCompileConfig | null
            maxRetrievedNodes?: number
            embeddings?: NodeEmbeddingInput[]
            embeddingModelConfig?: ICommonObject | null
        }
    ) {
        super(fields)
        this.name = fields.name
        this.description = fields.description
        this.content = fields.content
        this.multimodalContent = fields.multimodalContent ?? null
        this.nodes = fields.nodes ?? null
        this.edges = fields.edges ?? null
        this.skillName = fields.skillName ?? ''
        this.skillDescription = fields.skillDescription ?? ''
        this.fileAssets = fields.fileAssets ?? []
        this.nodeCompileConfig = fields.nodeCompileConfig ?? null
        this.maxRetrievedNodes = fields.maxRetrievedNodes ?? 20
        this.embeddings = fields.embeddings ?? []
        this.embeddingModelConfig = fields.embeddingModelConfig ?? null
        this.embeddingModelInstance = null
    }

    /**
     * Generate query embedding using the configured embedding model.
     * Returns null if no model is configured or the call fails.
     */
    private async generateQueryEmbedding(query: string): Promise<number[] | null> {
        if (!this.embeddingModelConfig || !this.embeddingModelConfig.name) return null
        if (!this.embeddings.length) return null

        try {
            // Lazy-init the embedding model instance (cache across calls)
            if (!this.embeddingModelInstance) {
                const { createEmbeddingInstance } = await import('./compiler/embeddingAdapter')
                this.embeddingModelInstance = await createEmbeddingInstance(this.embeddingModelConfig)
            }
            const result = await this.embeddingModelInstance.embedQuery(query)
            return result
        } catch {
            // Embedding failure — degrade to keyword-only
            return null
        }
    }

    async _call(input: string): Promise<string> {
        // Node-aware retrieval path: select relevant nodes based on user query
        if (this.nodes && this.nodes.length > 0 && this.nodeCompileConfig) {
            // Generate query embedding (if model config available)
            const queryEmbedding = await this.generateQueryEmbedding(input)

            const relevantNodes = retrieveRelevantNodes(input, this.nodes, this.edges || [], this.embeddings, queryEmbedding, {
                maxNodes: this.maxRetrievedNodes
            })

            const { compiledPrompt, multimodalPayload } = compileFromNodes(
                this.skillName,
                this.skillDescription,
                relevantNodes,
                this.fileAssets,
                this.nodeCompileConfig
            )

            if (this.nodeCompileConfig.executionMode === 'multimodal' && multimodalPayload.length > 0) {
                return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: multimodalPayload })
            }
            return compiledPrompt
        }

        // Backward compat: return pre-compiled content
        if (this.multimodalContent) {
            return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: this.multimodalContent })
        }
        return this.content
    }
}

class SkillTool implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Skill Tool'
        this.name = 'skillTool'
        this.version = 1.0
        this.type = 'Skill Tool'
        this.icon = 'skill.svg'
        this.category = 'Tools'
        this.description = 'Use skill files from folders configured in workspace'
        this.inputs = [
            {
                label: 'Skill Folder',
                name: 'skillFolderId',
                type: 'asyncOptions',
                loadMethod: 'listFolders'
            },
            {
                label: 'Skill Files',
                name: 'skillFiles',
                type: 'asyncMultiOptions',
                loadMethod: 'listFiles',
                refresh: true
            },
            {
                label: 'Execution Mode',
                name: 'executionMode',
                type: 'options',
                options: [
                    { label: 'Summary (default, cheap, stable)', name: 'summary' },
                    { label: 'Multimodal (advanced, visual reasoning)', name: 'multimodal' }
                ],
                default: 'summary',
                optional: true,
                description: 'Summary sends text captions only. Multimodal sends actual image/document content to the LLM.'
            },
            {
                label: 'Max Asset Context (chars)',
                name: 'maxAssetContext',
                type: 'number',
                default: 2000,
                optional: true,
                description: 'Maximum total characters for asset context appended to the skill prompt (summary mode).'
            },
            {
                label: 'Max Multimodal Assets',
                name: 'maxMultimodalAssets',
                type: 'number',
                default: 5,
                optional: true,
                description: 'Maximum number of assets to include as multimodal content (multimodal mode).'
            },
            {
                label: 'Max Document Characters',
                name: 'maxDocumentChars',
                type: 'number',
                default: 5000,
                optional: true,
                description: 'Maximum characters to extract from each document asset (multimodal mode).'
            }
        ]
        this.baseClasses = ['Tool']
    }

    //@ts-ignore
    loadMethods = {
        listFolders: async (_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> => {
            try {
                const appDataSource = options.appDataSource as DataSource
                const databaseEntities = options.databaseEntities as IDatabaseEntity
                if (!appDataSource || !databaseEntities?.['SkillFolder']) {
                    return []
                }

                const searchOptions = options.searchOptions || {}
                const folders = await appDataSource.getRepository(databaseEntities['SkillFolder']).find({
                    where: { ...searchOptions }
                })

                return folders.map((folder: any) => ({
                    label: folder.name,
                    name: folder.id,
                    description: folder.description || ''
                }))
            } catch (error) {
                return []
            }
        },
        listFiles: async (nodeData: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> => {
            try {
                const folderId = nodeData.inputs?.skillFolderId as string
                if (!folderId) {
                    return [
                        {
                            label: 'No Files Available',
                            name: 'error',
                            description: 'Select a skill folder first, then refresh'
                        }
                    ]
                }

                const appDataSource = options.appDataSource as DataSource
                const databaseEntities = options.databaseEntities as IDatabaseEntity
                if (!appDataSource || !databaseEntities?.['SkillFile']) {
                    return []
                }

                const searchOptions = options.searchOptions || {}
                const files = await appDataSource.getRepository(databaseEntities['SkillFile']).find({
                    where: { ...searchOptions, folderId }
                })

                files.sort((a: any, b: any) => a.name.localeCompare(b.name))

                return files.map((file: any) => ({
                    label: file.name,
                    name: file.id,
                    description: file.description || file.name
                }))
            } catch (error) {
                return [
                    {
                        label: 'No Files Available',
                        name: 'error',
                        description: 'Select a skill folder first, then refresh'
                    }
                ]
            }
        }
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const tools = await this.getTools(nodeData, options)

        const _skillFiles = nodeData.inputs?.skillFiles
        let selectedFileIds: string[] = []
        if (_skillFiles) {
            try {
                selectedFileIds = typeof _skillFiles === 'string' ? JSON.parse(_skillFiles) : _skillFiles
            } catch (error) {
                console.error('Error parsing skill files:', error)
            }
        }

        return tools.filter((tool: Tool) => selectedFileIds.includes((tool as any).fileId))
    }

    async getTools(nodeData: INodeData, options: ICommonObject): Promise<Tool[]> {
        const folderId = nodeData.inputs?.skillFolderId as string
        if (!folderId) {
            throw new Error('Skill Folder is required')
        }

        const executionMode = ((nodeData.inputs?.executionMode as string) || 'summary') as 'summary' | 'multimodal'
        const maxAssetContext = parseInt(nodeData.inputs?.maxAssetContext as string, 10) || 2000
        const maxMultimodalAssets = parseInt(nodeData.inputs?.maxMultimodalAssets as string, 10) || 5
        const maxDocumentChars = parseInt(nodeData.inputs?.maxDocumentChars as string, 10) || 5000

        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        if (!appDataSource || !databaseEntities?.['SkillFolder'] || !databaseEntities?.['SkillFile']) {
            throw new Error('Database not available')
        }

        const folder = await appDataSource.getRepository(databaseEntities['SkillFolder']).findOneBy({ id: folderId })
        if (!folder) {
            throw new Error(`Skill folder ${folderId} not found`)
        }

        const searchOptions = options.searchOptions || {}
        const files = await appDataSource.getRepository(databaseEntities['SkillFile']).find({
            where: { ...searchOptions, folderId }
        })

        let assetsByFileId: Record<string, SkillAssetInput[]> = {}
        if (databaseEntities?.['SkillAsset']) {
            try {
                const assets = await appDataSource.getRepository(databaseEntities['SkillAsset']).find({
                    where: { ...searchOptions, folderId }
                })
                for (const asset of assets) {
                    if (!assetsByFileId[asset.fileId]) {
                        assetsByFileId[asset.fileId] = []
                    }
                    assetsByFileId[asset.fileId].push(asset as SkillAssetInput)
                }
            } catch {
                // SkillAsset table may not exist yet (pre-migration); gracefully degrade
            }
        }

        const compiler = new SkillCompiler()
        const compileConfig = { executionMode, maxAssetContext, maxMultimodalAssets, maxDocumentChars }

        // Load nodes and edges for node-aware compilation (Phase 4)
        let nodesByFileId: Record<string, SkillNodeInput[]> = {}
        let edgesByFileId: Record<string, SkillEdgeInput[]> = {}
        if (databaseEntities?.['SkillNode']) {
            try {
                const allNodes = await appDataSource.getRepository(databaseEntities['SkillNode']).find({
                    where: { ...searchOptions, folderId },
                    order: { priority: 'DESC', orderIndex: 'ASC' }
                })
                for (const node of allNodes) {
                    if (!nodesByFileId[node.skillFileId]) nodesByFileId[node.skillFileId] = []
                    nodesByFileId[node.skillFileId].push(node as SkillNodeInput)
                }
            } catch {
                // SkillNode table may not exist yet (pre-migration); gracefully degrade
            }
        }
        if (databaseEntities?.['SkillEdge']) {
            try {
                const allEdges = await appDataSource.getRepository(databaseEntities['SkillEdge']).find({
                    where: { ...searchOptions, folderId }
                })
                for (const edge of allEdges) {
                    if (!edgesByFileId[edge.skillFileId]) edgesByFileId[edge.skillFileId] = []
                    edgesByFileId[edge.skillFileId].push(edge as SkillEdgeInput)
                }
            } catch {
                // SkillEdge table may not exist yet (pre-migration); gracefully degrade
            }
        }

        // Check compile cache for node-aware compilations
        let cacheByFileKey: Record<string, { compiledPrompt: string }> = {}
        if (databaseEntities?.['SkillCompileCache']) {
            try {
                const cacheEntries = await appDataSource.getRepository(databaseEntities['SkillCompileCache']).find({
                    where: { ...searchOptions, folderId, executionMode }
                })
                for (const entry of cacheEntries) {
                    cacheByFileKey[`${entry.skillFileId}:${entry.hash}`] = { compiledPrompt: entry.compiledPrompt }
                }
            } catch {
                // SkillCompileCache table may not exist yet
            }
        }

        // Load embeddings for semantic retrieval (Phase 5)
        let embeddingsByFileId: Record<string, NodeEmbeddingInput[]> = {}
        if (databaseEntities?.['SkillNodeEmbedding']) {
            try {
                const allEmbeddings = await appDataSource.getRepository(databaseEntities['SkillNodeEmbedding']).find({
                    where: { ...searchOptions, folderId }
                })
                for (const emb of allEmbeddings) {
                    const fileId = emb.skillFileId as string
                    if (!embeddingsByFileId[fileId]) embeddingsByFileId[fileId] = []
                    embeddingsByFileId[fileId].push({
                        nodeId: emb.nodeId as string,
                        embedding: JSON.parse(emb.embedding as string),
                        dimension: emb.dimension as number
                    })
                }
            } catch {
                // SkillNodeEmbedding table may not exist yet
            }
        }

        // Parse embedding model config from folder (Phase 5)
        let embeddingModelConfig: ICommonObject | null = null
        if ((folder as any).embeddingModelConfig) {
            try {
                embeddingModelConfig = JSON.parse((folder as any).embeddingModelConfig)
            } catch {
                // Invalid config — skip embedding
            }
        }

        const nodeCompileConfig: NodeCompileConfig = {
            executionMode,
            maxAssetContext,
            maxMultimodalAssets,
            maxDocumentChars,
            maxTokenBudget: 0 // 0 = unlimited at init; trimming happens at retrieval time
        }

        return files.map((file: any) => {
            const fileAssets = assetsByFileId[file.id] || []
            const fileNodes = nodesByFileId[file.id] || []
            const fileEdges = edgesByFileId[file.id] || []
            const fileEmbeddings = embeddingsByFileId[file.id] || []

            let summaryContent: string
            let multimodalContent: MultimodalContentPart[] | null = null

            if (fileNodes.length > 0) {
                // Node-aware path: check cache first
                const cacheHash = computeCompileHash(fileNodes, fileAssets, executionMode, maxAssetContext)
                const cached = cacheByFileKey[`${file.id}:${cacheHash}`]

                if (cached) {
                    summaryContent = cached.compiledPrompt
                } else {
                    // Compile from nodes
                    const result = compiler.compileForToolFromNodes(
                        { id: folder.id, name: folder.name, description: folder.description },
                        { id: file.id, name: file.name, description: file.description, content: file.content },
                        fileNodes,
                        fileAssets,
                        compileConfig
                    )
                    summaryContent = result.summaryContent
                    multimodalContent = result.multimodalContent

                    // Save to cache asynchronously (fire-and-forget)
                    if (databaseEntities?.['SkillCompileCache']) {
                        try {
                            const cacheRepo = appDataSource.getRepository(databaseEntities['SkillCompileCache'])
                            cacheRepo
                                .delete({ skillFileId: file.id, executionMode, ...searchOptions })
                                .then(() => {
                                    const entry = cacheRepo.create({
                                        skillFileId: file.id,
                                        folderId,
                                        hash: cacheHash,
                                        compiledPrompt: summaryContent,
                                        tokenCount: result.tokenEstimate,
                                        executionMode,
                                        workspaceId: searchOptions.workspaceId || ''
                                    })
                                    cacheRepo.save(entry).catch(() => {})
                                })
                                .catch(() => {})
                        } catch {
                            // Cache save is best-effort
                        }
                    }
                }
            } else {
                // Backward compat: no nodes, use raw content compilation
                const result = compiler.compileForTool(
                    { id: folder.id, name: folder.name, description: folder.description },
                    { id: file.id, name: file.name, description: file.description, content: file.content },
                    fileAssets,
                    compileConfig,
                    files.length
                )
                summaryContent = result.summaryContent
                multimodalContent = result.multimodalContent
            }

            const tool = new SkillFileTool({
                name: formatToolName(file.name),
                description: file.description || `Skill: ${file.name}`,
                content: summaryContent,
                multimodalContent,
                nodes: fileNodes.length > 0 ? fileNodes : null,
                edges: fileEdges.length > 0 ? fileEdges : null,
                skillName: file.name,
                skillDescription: file.description || '',
                fileAssets,
                nodeCompileConfig: fileNodes.length > 0 ? nodeCompileConfig : null,
                embeddings: fileEmbeddings,
                embeddingModelConfig
            })
            ;(tool as any).fileId = file.id
            return tool
        })
    }
}

module.exports = { nodeClass: SkillTool }
