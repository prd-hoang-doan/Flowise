import { StatusCodes } from 'http-status-codes'
import path from 'path'
import fs from 'fs'
import { SkillAsset } from '../../database/entities/SkillAsset'
import { SkillFile } from '../../database/entities/SkillFile'
import { SkillFolder } from '../../database/entities/SkillFolder'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { getUploadPath } from '../../utils'
import captionService from './captionService'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

const getSkillAssetUploadDir = (folderId: string, fileId: string): string => {
    return path.join(getUploadPath(), 'skill-assets', folderId, fileId)
}

const createSkillAsset = async (folderId: string, fileId: string, file: Express.Multer.File, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()

        // Verify folder exists and belongs to workspace
        const folder = await appServer.AppDataSource.getRepository(SkillFolder).findOneBy({
            id: folderId,
            workspaceId
        })
        if (!folder) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFolder ${folderId} not found`)
        }

        // Verify file exists and belongs to folder
        const skillFile = await appServer.AppDataSource.getRepository(SkillFile).findOneBy({
            id: fileId,
            folderId,
            workspaceId
        })
        if (!skillFile) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillFile ${fileId} not found`)
        }

        // Validate mime type
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            throw new InternalFlowiseError(
                StatusCodes.BAD_REQUEST,
                `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
            )
        }

        // Store file to disk
        const uploadDir = getSkillAssetUploadDir(folderId, fileId)
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = path.join(uploadDir, sanitizedFilename)

        // If multer already wrote the file (disk storage), move it; otherwise write from buffer
        if (file.path) {
            fs.renameSync(file.path, storagePath)
        } else if (file.buffer) {
            fs.writeFileSync(storagePath, file.buffer)
        }

        // Check for existing asset with same filename and replace
        const existing = await appServer.AppDataSource.getRepository(SkillAsset).findOneBy({
            fileId,
            filename: sanitizedFilename,
            workspaceId
        })
        if (existing) {
            existing.mimeType = file.mimetype
            existing.storagePath = storagePath
            existing.caption = existing.caption || undefined
            const dbResponse = await appServer.AppDataSource.getRepository(SkillAsset).save(existing)
            return dbResponse
        }

        // Create new asset record
        const newAsset = new SkillAsset()
        newAsset.folderId = folderId
        newAsset.fileId = fileId
        newAsset.filename = sanitizedFilename
        newAsset.mimeType = file.mimetype
        newAsset.storagePath = storagePath
        newAsset.caption = captionService.generateFallbackCaption(sanitizedFilename)
        newAsset.workspaceId = workspaceId

        const asset = appServer.AppDataSource.getRepository(SkillAsset).create(newAsset)
        const dbResponse = await appServer.AppDataSource.getRepository(SkillAsset).save(asset)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.createSkillAsset - ${getErrorMessage(error)}`
        )
    }
}

const getAllSkillAssets = async (folderId: string, fileId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const data = await appServer.AppDataSource.getRepository(SkillAsset).find({
            where: { folderId, fileId, workspaceId },
            order: { updatedDate: 'DESC' }
        })
        return data
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.getAllSkillAssets - ${getErrorMessage(error)}`
        )
    }
}

const getSkillAssetById = async (assetId: string, folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = await appServer.AppDataSource.getRepository(SkillAsset).findOneBy({
            id: assetId,
            folderId,
            workspaceId
        })
        if (!dbResponse) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillAsset ${assetId} not found`)
        }
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.getSkillAssetById - ${getErrorMessage(error)}`
        )
    }
}

const updateSkillAssetCaption = async (assetId: string, folderId: string, caption: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const asset = await appServer.AppDataSource.getRepository(SkillAsset).findOneBy({
            id: assetId,
            folderId,
            workspaceId
        })
        if (!asset) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `SkillAsset ${assetId} not found`)
        }
        asset.caption = caption
        const dbResponse = await appServer.AppDataSource.getRepository(SkillAsset).save(asset)
        return dbResponse
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.updateSkillAssetCaption - ${getErrorMessage(error)}`
        )
    }
}

const deleteSkillAsset = async (assetId: string, folderId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const asset = await appServer.AppDataSource.getRepository(SkillAsset).findOneBy({
            id: assetId,
            folderId,
            workspaceId
        })
        if (asset && fs.existsSync(asset.storagePath)) {
            fs.unlinkSync(asset.storagePath)
        }
        const dbResponse = await appServer.AppDataSource.getRepository(SkillAsset).delete({
            id: assetId,
            folderId,
            workspaceId
        })
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.deleteSkillAsset - ${getErrorMessage(error)}`
        )
    }
}

const getAssetsByFileId = async (fileId: string, workspaceId: string): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const data = await appServer.AppDataSource.getRepository(SkillAsset).find({
            where: { fileId, workspaceId }
        })
        return data
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: skillAssetsService.getAssetsByFileId - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createSkillAsset,
    getAllSkillAssets,
    getSkillAssetById,
    updateSkillAssetCaption,
    deleteSkillAsset,
    getAssetsByFileId
}
