import { StatusCodes } from 'http-status-codes'
import { SkillFile } from '../../database/entities/SkillFile'
import { SkillFolder } from '../../database/entities/SkillFolder'
import { SkillAsset } from '../../database/entities/SkillAsset'
import { SkillCompiler } from 'flowise-components'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import skillNodesService from '../skill-nodes'

/**
 * Extract name and description from YAML front matter in markdown content.
 * Expected format:
 * ---
 * name: marketing_copy_generator
 * description: Generate marketing copy based on a product description
 * ---
 * <content goes here>
 */
const extractFrontMatter = (content: string): { name?: string; description?: string; assets?: string[] } => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!match) return {}

    const frontMatter = match[1]
    const result: { name?: string; description?: string; assets?: string[] } = {}

    const nameMatch = frontMatter.match(/^name:\s*(.+)$/m)
    if (nameMatch) result.name = nameMatch[1].trim()

    const descMatch = frontMatter.match(/^description:\s*(.+)$/m)
    if (descMatch) result.description = descMatch[1].trim()

    // Parse assets list (YAML array format)
    const assetsMatch = frontMatter.match(/^assets:\s*\n((?:\s+-\s+.+\n?)*)/m)
    if (assetsMatch) {
        const assetsBlock = assetsMatch[1]
        const assets = assetsBlock
            .split('\n')
            .map((line: string) => line.replace(/^\s+-\s+/, '').trim())
            .filter((line: string) => line.length > 0)
        if (assets.length > 0) result.assets = assets
    }

    return result
}

const createSkillFile = async (folderId: string, requestBody: any, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()

        // Verify folder exists and belongs to workspace
        const folder = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({
            id: folderId,
            workspaceId: workspaceId
        })
        if (!folder) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFolder ${folderId} not found`)
        }

        const newFile = new SkillFile()
        Object.assign(newFile, requestBody)
        if (requestBody.content) {
            const { name, description } = extractFrontMatter(requestBody.content)
            if (name) newFile.name = name
            if (description) newFile.description = description
        }
        newFile.folderId = folderId
        newFile.workspaceId = workspaceId
        const file = appServer.AppDataSource.getRepository(SkillFile).create(newFile)
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).save(file)

        // Trigger node extraction pipeline (non-blocking on errors)
        if (dbResponse.content) {
            skillNodesService.extractNodes(dbResponse.id, folderId, workspaceId).catch(() => {})
        }

        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.createSkillFile - ${getErrorMessage(error)}`
        )
    }
}

const deleteSkillFile = async (fileId: string, folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).delete({
            id: fileId,
            folderId: folderId,
            workspaceId: workspaceId
        })
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.deleteSkillFile - ${getErrorMessage(error)}`
        )
    }
}

const getAllSkillFiles = async (folderId: string, workspaceId: string) => {
    try {
        const appServer = getRunningExpressApp()
        const data = await appServer.AppDataSource.getRepository(SkillFile).find({
            where: { folderId, workspaceId },
            order: { updatedDate: 'DESC' }
        })
        return data
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.getAllSkillFiles - ${getErrorMessage(error)}`
        )
    }
}

const getSkillFileById = async (fileId: string, folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).findOneBy({
            id: fileId,
            folderId: folderId,
            workspaceId: workspaceId
        })
        if (!dbResponse) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFile ${fileId} not found`)
        }
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.getSkillFileById - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Update a skill file. Only fields provided in the body will be updated
 * @param fileId The ID of the skill file to update
 * @param folderId The ID of the folder containing the skill file
 * @param fileBody An object containing the fields to update
 * @param workspaceId The ID of the workspace containing the skill file
 * @param fileBody.content the content of the markdown file. This should be a string in markdown format below the front matter
 * ---
 * name: marketing_copy_generator
 * description: Generate marketing copy based on a product description
 * ---
 * <content goes here>
 */
const updateSkillFile = async (fileId: string, folderId: string, fileBody: any, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const file = await appServer.AppDataSource.getRepository(SkillFile).findOneBy({
            id: fileId,
            folderId: folderId,
            workspaceId: workspaceId
        })
        if (!file) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFile ${fileId} not found`)
        }
        const updateFile = new SkillFile()
        Object.assign(updateFile, fileBody)
        if (fileBody.content) {
            const { name, description } = extractFrontMatter(fileBody.content)
            if (name) updateFile.name = name
            if (description) updateFile.description = description
        }
        appServer.AppDataSource.getRepository(SkillFile).merge(file, updateFile)
        file.folderId = folderId
        file.workspaceId = workspaceId
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).save(file)

        // Trigger node extraction pipeline if content changed (non-blocking on errors)
        if (fileBody.content) {
            skillNodesService.extractNodes(dbResponse.id, folderId, workspaceId).catch(() => {})
        }

        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.updateSkillFile - ${getErrorMessage(error)}`
        )
    }
}

const compilePreview = async (
    fileId: string,
    folderId: string,
    workspaceId: string,
    config?: { executionMode?: string; maxAssetContext?: number; maxMultimodalAssets?: number; maxDocumentChars?: number }
): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const folder = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({
            id: folderId,
            workspaceId
        })
        if (!folder) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFolder ${folderId} not found`)
        }

        const file = await appServer.AppDataSource.getRepository(SkillFile).findOneBy({
            id: fileId,
            folderId,
            workspaceId
        })
        if (!file) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFile ${fileId} not found`)
        }

        const allFiles = await appServer.AppDataSource.getRepository(SkillFile).find({
            where: { folderId, workspaceId }
        })

        let assets: any[] = []
        try {
            assets = await appServer.AppDataSource.getRepository(SkillAsset).find({
                where: { folderId, fileId, workspaceId }
            })
        } catch {
            // SkillAsset table may not exist yet
        }

        const compiler = new SkillCompiler()
        const output = compiler.compile(
            { id: folder.id, name: folder.name, description: folder.description },
            { id: file.id, name: file.name, description: file.description, content: file.content },
            assets,
            {
                executionMode: (config?.executionMode as 'summary' | 'multimodal') || 'summary',
                maxAssetContext: config?.maxAssetContext ?? 2000,
                maxMultimodalAssets: config?.maxMultimodalAssets ?? 5,
                maxDocumentChars: config?.maxDocumentChars ?? 5000
            },
            allFiles.length
        )

        return {
            metadata: output.metadata,
            compiledPrompt: output.compiledPrompt,
            tokenEstimate: output.tokenEstimate,
            hash: output.hash
        }
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.compilePreview - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createSkillFile,
    deleteSkillFile,
    getAllSkillFiles,
    getSkillFileById,
    updateSkillFile,
    compilePreview
}
