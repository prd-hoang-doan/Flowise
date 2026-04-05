import { Tool, ToolParams } from '@langchain/core/tools'
import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../src/Interface'
import { DataSource } from 'typeorm'

class SkillFileTool extends Tool {
    name: string
    description: string
    private content: string

    constructor(fields: ToolParams & { name: string; description: string; content: string }) {
        super(fields)
        this.name = fields.name
        this.description = fields.description
        this.content = fields.content
    }

    async _call(): Promise<string> {
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

        return files.map((file: any) => {
            const toolName = this.formatToolName(file.name)
            const tool = new SkillFileTool({
                name: toolName,
                description: file.description || `Skill: ${file.name}`,
                content: file.content || ''
            })
            ;(tool as any).fileId = file.id
            return tool
        })
    }

    private formatToolName = (name: string): string => name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

module.exports = { nodeClass: SkillTool }
