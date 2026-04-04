import { StatusCodes } from 'http-status-codes'
import { SkillFolder } from '../../database/entities/SkillFolder'
import { SkillFile } from '../../database/entities/SkillFile'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const createSkillFolder = async (requestBody: any): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const newFolder = new SkillFolder()
        Object.assign(newFolder, requestBody)
        const folder = appServer.AppDataSource.getRepository(SkillFolder).create(newFolder)
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFolder).save(folder)
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFoldersService.createSkillFolder - ${getErrorMessage(error)}`
        )
    }
}

const deleteSkillFolder = async (folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFolder).delete({
            id: folderId,
            workspaceId: workspaceId
        })
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFoldersService.deleteSkillFolder - ${getErrorMessage(error)}`
        )
    }
}

const getAllSkillFolders = async (workspaceId?: string, page: number = -1, limit: number = -1) => {
    try {
        const appServer = getRunningExpressApp()
        const queryBuilder = appServer.AppDataSource.getRepository(SkillFolder)
            .createQueryBuilder('skill_folder')
            .orderBy('skill_folder.updatedDate', 'DESC')

        if (page > 0 && limit > 0) {
            queryBuilder.skip((page - 1) * limit)
            queryBuilder.take(limit)
        }
        if (workspaceId) queryBuilder.andWhere('skill_folder.workspaceId = :workspaceId', { workspaceId })
        const [data, total] = await queryBuilder.getManyAndCount()

        // Add file count for each folder
        const folderIds = data.map((f) => f.id)
        let fileCounts: Record<string, number> = {}
        if (folderIds.length > 0) {
            const counts = await appServer.AppDataSource.getRepository(SkillFile)
                .createQueryBuilder('skill_file')
                .select('skill_file.folderId', 'folderId')
                .addSelect('COUNT(*)', 'count')
                .where('skill_file.folderId IN (:...folderIds)', { folderIds })
                .groupBy('skill_file.folderId')
                .getRawMany()
            fileCounts = counts.reduce((acc: Record<string, number>, row: any) => {
                acc[row.folderId] = parseInt(row.count, 10)
                return acc
            }, {})
        }

        const dataWithCount = data.map((folder) => ({
            ...folder,
            fileCount: fileCounts[folder.id] || 0
        }))

        if (page > 0 && limit > 0) {
            return { data: dataWithCount, total }
        } else {
            return dataWithCount
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFoldersService.getAllSkillFolders - ${getErrorMessage(error)}`
        )
    }
}

const getSkillFolderById = async (folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({
            id: folderId,
            workspaceId: workspaceId
        })
        if (!dbResponse) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFolder ${folderId} not found`)
        }
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFoldersService.getSkillFolderById - ${getErrorMessage(error)}`
        )
    }
}

const updateSkillFolder = async (folderId: string, folderBody: any, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const folder = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({
            id: folderId,
            workspaceId: workspaceId
        })
        if (!folder) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFolder ${folderId} not found`)
        }
        const updateFolder = new SkillFolder()
        Object.assign(updateFolder, folderBody)
        appServer.AppDataSource.getRepository(SkillFolder).merge(folder, updateFolder)
        folder.workspaceId = workspaceId
        const dbResponse = await appServer.AppDataSource.getRepository(SkillFolder).save(folder)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillFoldersService.updateSkillFolder - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createSkillFolder,
    deleteSkillFolder,
    getAllSkillFolders,
    getSkillFolderById,
    updateSkillFolder
}
