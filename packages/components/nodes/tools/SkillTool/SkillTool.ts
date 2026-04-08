import { Tool, ToolParams } from '@langchain/core/tools'
import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../src/Interface'
import { DataSource } from 'typeorm'
import { SkillCompiler, formatToolName } from './compiler/SkillCompiler'
import { MultimodalContentPart, MULTIMODAL_CONTENT_KEY, SkillAssetInput } from './compiler/types'

export { MultimodalContentPart, MULTIMODAL_CONTENT_KEY }

class SkillFileTool extends Tool {
    name: string
    description: string
    private content: string
    private multimodalContent: MultimodalContentPart[] | null

    constructor(
        fields: ToolParams & { name: string; description: string; content: string; multimodalContent?: MultimodalContentPart[] | null }
    ) {
        super(fields)
        this.name = fields.name
        this.description = fields.description
        this.content = fields.content
        this.multimodalContent = fields.multimodalContent ?? null
    }

    async _call(): Promise<string> {
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

        return files.map((file: any) => {
            const fileAssets = assetsByFileId[file.id] || []

            const { summaryContent, multimodalContent } = compiler.compileForTool(
                { id: folder.id, name: folder.name, description: folder.description },
                { id: file.id, name: file.name, description: file.description, content: file.content },
                fileAssets,
                compileConfig,
                files.length
            )

            const tool = new SkillFileTool({
                name: formatToolName(file.name),
                description: file.description || `Skill: ${file.name}`,
                content: summaryContent,
                multimodalContent
            })
            ;(tool as any).fileId = file.id
            return tool
        })
    }
}

module.exports = { nodeClass: SkillTool }
