import { StatusCodes } from 'http-status-codes'
import { SkillFile } from '../../database/entities/SkillFile'
import { SkillFolder } from '../../database/entities/SkillFolder'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

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
        newFile.folderId = folderId
        newFile.workspaceId = workspaceId
        const file = appServer.AppDataSource.getRepository(SkillFile).create(newFile)
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).save(file)
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
        appServer.AppDataSource.getRepository(SkillFile).merge(file, updateFile)
        file.folderId = folderId
        file.workspaceId = workspaceId
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFile).save(file)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFilesService.updateSkillFile - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createSkillFile,
    deleteSkillFile,
    getAllSkillFiles,
    getSkillFileById,
    updateSkillFile
}
