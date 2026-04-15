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
import { ICallStrategy, createCallStrategy } from './compiler/callStrategy'
import { createInitCompileStrategy } from './compiler/initCompileStrategy'

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
    // Mode-driven strategy
    private folderMode: string
    private strategy: ICallStrategy

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
            embeddingModelInstance?: any | null
            folderMode?: string
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
        this.embeddingModelInstance = fields.embeddingModelInstance ?? null
        this.folderMode = fields.folderMode ?? 'simple'
        this.strategy = createCallStrategy(this.folderMode)
    }

    async _call(input: string): Promise<string> {
        return this.strategy.execute(input, {
            content: this.content,
            multimodalContent: this.multimodalContent,
            nodes: this.nodes,
            edges: this.edges,
            skillName: this.skillName,
            skillDescription: this.skillDescription,
            fileAssets: this.fileAssets,
            nodeCompileConfig: this.nodeCompileConfig,
            maxRetrievedNodes: this.maxRetrievedNodes,
            embeddings: this.embeddings,
            embeddingModelConfig: this.embeddingModelConfig,
            embeddingModelInstance: this.embeddingModelInstance
        })
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

        // Determine folder mode — use explicit mode or infer for backward compatibility
        const folderMode = inferFolderMode(folder as any, databaseEntities)
        const isAdvancedOrDedicated = folderMode === 'advanced' || folderMode === 'dedicated'
        const isDedicated = folderMode === 'dedicated'

        // Load assets (advanced + dedicated only)
        let assetsByFileId: Record<string, SkillAssetInput[]> = {}
        if (isAdvancedOrDedicated && databaseEntities?.['SkillAsset']) {
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

        // Load nodes and edges for node-aware compilation (dedicated only)
        let nodesByFileId: Record<string, SkillNodeInput[]> = {}
        let edgesByFileId: Record<string, SkillEdgeInput[]> = {}
        if (isDedicated && databaseEntities?.['SkillNode']) {
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
        if (isDedicated && databaseEntities?.['SkillEdge']) {
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

        // Check compile cache for node-aware compilations (dedicated only)
        let cacheByFileKey: Record<string, { compiledPrompt: string }> = {}
        if (isDedicated && databaseEntities?.['SkillCompileCache']) {
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

        // Load embeddings for semantic retrieval (dedicated only)
        let embeddingsByFileId: Record<string, NodeEmbeddingInput[]> = {}
        if (isDedicated && databaseEntities?.['SkillNodeEmbedding']) {
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

        // Parse embedding model config and create instance (dedicated only)
        let embeddingModelConfig: ICommonObject | null = null
        let embeddingModelInstance: any = null
        if (isDedicated && (folder as any).embeddingModelConfig) {
            try {
                embeddingModelConfig = JSON.parse((folder as any).embeddingModelConfig)
            } catch {
                // Invalid config — skip embedding
            }
        }
        if (isDedicated && embeddingModelConfig && embeddingModelConfig.name) {
            try {
                const { createEmbeddingInstance } = await import('./compiler/embeddingAdapter')
                embeddingModelInstance = await createEmbeddingInstance(embeddingModelConfig, options)
            } catch (err) {
                console.log(`Failed to create embedding model instance: ${err}`)
            }
        }

        const nodeCompileConfig: NodeCompileConfig = {
            executionMode,
            maxAssetContext,
            maxMultimodalAssets,
            maxDocumentChars,
            maxTokenBudget: 0 // 0 = unlimited at init; trimming happens at retrieval time
        }

        const initStrategy = createInitCompileStrategy(folderMode, compiler)
        const cacheRepo =
            isDedicated && databaseEntities?.['SkillCompileCache']
                ? appDataSource.getRepository(databaseEntities['SkillCompileCache'])
                : undefined

        return files.map((file: any) => {
            const fileAssets = assetsByFileId[file.id] || []
            const fileNodes = nodesByFileId[file.id] || []
            const fileEdges = edgesByFileId[file.id] || []
            const fileEmbeddings = embeddingsByFileId[file.id] || []

            const { summaryContent, multimodalContent } = initStrategy.compile({
                folder: { id: folder.id, name: folder.name, description: folder.description },
                file: { id: file.id, name: file.name, description: file.description, content: file.content },
                assets: fileAssets,
                nodes: fileNodes,
                compileConfig,
                totalFileCount: files.length,
                cacheByFileKey,
                cacheRepo,
                searchOptions,
                folderId,
                executionMode
            })

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
                embeddingModelConfig,
                embeddingModelInstance,
                folderMode
            })
            ;(tool as any).fileId = file.id
            return tool
        })
    }
}

/**
 * Infer folder mode for backward compatibility.
 * If folder.mode is set, use it directly.
 * Otherwise infer from available data:
 *   - nodes exist → 'dedicated'
 *   - assets exist → 'advanced'
 *   - otherwise → 'simple'
 */
function inferFolderMode(folder: any, databaseEntities: IDatabaseEntity): string {
    if (folder.mode) return folder.mode
    if (databaseEntities?.['SkillNode']) return 'dedicated'
    if (databaseEntities?.['SkillAsset']) return 'advanced'
    return 'simple'
}

module.exports = { nodeClass: SkillTool }
