import fs from 'fs'
import { Tool, ToolParams } from '@langchain/core/tools'
import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../src/Interface'
import { DataSource } from 'typeorm'

export interface MultimodalContentPart {
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
}

export const MULTIMODAL_CONTENT_KEY = '__multimodal'

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

        const executionMode = (nodeData.inputs?.executionMode as string) || 'summary'
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

        let assetsByFileId: Record<string, any[]> = {}
        if (databaseEntities?.['SkillAsset']) {
            try {
                const assets = await appDataSource.getRepository(databaseEntities['SkillAsset']).find({
                    where: { ...searchOptions, folderId }
                })
                for (const asset of assets) {
                    if (!assetsByFileId[asset.fileId]) {
                        assetsByFileId[asset.fileId] = []
                    }
                    assetsByFileId[asset.fileId].push(asset)
                }
            } catch {
                // SkillAsset table may not exist yet (pre-migration); gracefully degrade
            }
        }

        return files.map((file: any) => {
            const toolName = this.formatToolName(file.name)
            const fileAssets = assetsByFileId[file.id] || []

            const summaryContent = this.compileSkillContent(file.name, file.content || '', fileAssets, maxAssetContext)

            let multimodalContent: MultimodalContentPart[] | null = null
            if (executionMode === 'multimodal' && fileAssets.length > 0) {
                try {
                    multimodalContent = this.compileMultimodalContent(
                        file.name,
                        file.content || '',
                        fileAssets,
                        maxMultimodalAssets,
                        maxDocumentChars
                    )
                } catch (err) {
                    console.error(`Multimodal compilation failed for ${file.name}, falling back to summary:`, err)
                }
            }

            const tool = new SkillFileTool({
                name: toolName,
                description: file.description || `Skill: ${file.name}`,
                content: summaryContent,
                multimodalContent
            })
            ;(tool as any).fileId = file.id
            return tool
        })
    }

    private static readonly MIME_CATEGORIES: Record<string, string[]> = {
        Images: ['image/'],
        Documents: [
            'application/pdf',
            'text/html',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml'
        ],
        Data: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml', 'application/vnd.ms-excel']
    }

    private categorizeAsset(mimeType: string): string {
        for (const [category, prefixes] of Object.entries(SkillTool.MIME_CATEGORIES)) {
            if (prefixes.some((prefix) => mimeType.startsWith(prefix))) return category
        }
        return 'Other'
    }

    /**
     * Compile skill content with structured format: skill name, instructions, and
     * asset context grouped by MIME-type category, truncated to maxAssetContext.
     */
    private compileSkillContent(skillName: string, rawContent: string, assets: any[], maxAssetContext: number): string {
        const instructions = rawContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()

        const parts: string[] = [`Skill: ${this.formatToolName(skillName)}`]

        if (instructions) {
            parts.push(`\nInstructions:\n${instructions}`)
        }

        const captionedAssets = assets.filter((a: any) => a.caption?.trim())
        if (captionedAssets.length === 0) return parts.join('\n')

        const grouped: Record<string, { filename: string; caption: string }[]> = {}
        for (const asset of captionedAssets) {
            const category = this.categorizeAsset(asset.mimeType || 'application/octet-stream')
            if (!grouped[category]) grouped[category] = []
            grouped[category].push({ filename: asset.filename, caption: asset.caption.trim() })
        }

        let assetBlock = ''
        const categoryOrder = ['Images', 'Documents', 'Data', 'Other']
        for (const category of categoryOrder) {
            const items = grouped[category]
            if (!items?.length) continue
            assetBlock += `\n${category}:\n`
            for (const item of items) {
                const line = `- ${item.filename} → ${item.caption}`
                if (assetBlock.length + line.length + 1 > maxAssetContext) {
                    assetBlock += '- … (truncated)\n'
                    parts.push(`\nAssets:${assetBlock}`)
                    return parts.join('\n')
                }
                assetBlock += `${line}\n`
            }
        }

        if (assetBlock) {
            parts.push(`\nAssets:${assetBlock.trimEnd()}`)
        }

        return parts.join('\n')
    }

    /**
     * Compile multimodal content: text instructions plus actual image data URIs
     * and extracted document text for LLMs that support vision/multimodal input.
     */
    private compileMultimodalContent(
        skillName: string,
        rawContent: string,
        assets: any[],
        maxMultimodalAssets: number,
        maxDocumentChars: number
    ): MultimodalContentPart[] {
        const instructions = rawContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()

        const parts: MultimodalContentPart[] = []

        let textPart = `Skill: ${this.formatToolName(skillName)}`
        if (instructions) {
            textPart += `\n\nInstructions:\n${instructions}`
        }
        parts.push({ type: 'text', text: textPart })

        let assetCount = 0
        for (const asset of assets) {
            if (assetCount >= maxMultimodalAssets) break

            const category = this.categorizeAsset(asset.mimeType || 'application/octet-stream')

            if (category === 'Images') {
                const dataUri = SkillTool.readImageAsDataUri(asset.storagePath, asset.mimeType)
                if (dataUri) {
                    if (asset.caption?.trim()) {
                        parts.push({ type: 'text', text: `Image: ${asset.filename} — ${asset.caption.trim()}` })
                    }
                    parts.push({ type: 'image_url', image_url: { url: dataUri } })
                    assetCount++
                } else if (asset.caption?.trim()) {
                    parts.push({ type: 'text', text: `Image: ${asset.filename} → ${asset.caption.trim()}` })
                    assetCount++
                }
            } else {
                const text = SkillTool.readDocumentText(asset.storagePath, asset.mimeType, maxDocumentChars)
                if (text) {
                    parts.push({ type: 'text', text: `Document: ${asset.filename}\n${text}` })
                    assetCount++
                } else if (asset.caption?.trim()) {
                    parts.push({ type: 'text', text: `${category}: ${asset.filename} → ${asset.caption.trim()}` })
                    assetCount++
                }
            }
        }

        return parts
    }

    private static readImageAsDataUri(filePath: string, mimeType: string): string | null {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null
            const buffer = fs.readFileSync(filePath)
            return `data:${mimeType};base64,${buffer.toString('base64')}`
        } catch {
            return null
        }
    }

    private static readonly READABLE_TEXT_MIMES = ['text/plain', 'text/html', 'text/csv', 'text/markdown']

    private static readDocumentText(filePath: string, mimeType: string, maxChars: number): string | null {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null
            if (!SkillTool.READABLE_TEXT_MIMES.some((m) => mimeType.startsWith(m))) return null

            let text = fs.readFileSync(filePath, 'utf-8')

            if (mimeType === 'text/html') {
                text = text
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
            }

            return text.length > maxChars ? text.slice(0, maxChars) + '\n… (truncated)' : text
        } catch {
            return null
        }
    }

    private formatToolName = (name: string): string => name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

module.exports = { nodeClass: SkillTool }
