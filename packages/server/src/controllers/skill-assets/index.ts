import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import path from 'path'
import fs from 'fs'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import skillAssetsService from '../../services/skill-assets'

const uploadSkillAsset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillAssetsController.uploadSkillAsset - workspace not found!`)
        }
        const { folderId, fileId } = req.params
        if (!folderId || !fileId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.uploadSkillAsset - folderId and fileId are required!`
            )
        }

        const files = req.files as Express.Multer.File[]
        if (!files || files.length === 0) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.uploadSkillAsset - no files provided!`
            )
        }

        const results = []
        for (const file of files) {
            const result = await skillAssetsService.createSkillAsset(folderId, fileId, file, workspaceId)
            results.push(result)
        }

        return res.json(results.length === 1 ? results[0] : results)
    } catch (error) {
        next(error)
    }
}

const getAllSkillAssets = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillAssetsController.getAllSkillAssets - workspace not found!`)
        }
        const { folderId, fileId } = req.params
        if (!folderId || !fileId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.getAllSkillAssets - folderId and fileId are required!`
            )
        }
        const apiResponse = await skillAssetsService.getAllSkillAssets(folderId, fileId, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getSkillAsset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillAssetsController.getSkillAsset - workspace not found!`)
        }
        const { folderId, assetId } = req.params
        if (!folderId || !assetId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.getSkillAsset - folderId and assetId are required!`
            )
        }
        const asset = await skillAssetsService.getSkillAssetById(assetId, folderId, workspaceId)

        // Serve the file
        const filePath = asset.storagePath
        if (!fs.existsSync(filePath)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Asset file not found on disk`)
        }

        // Prevent path traversal
        const resolvedPath = path.resolve(filePath)
        if (!resolvedPath.startsWith(path.resolve(asset.storagePath))) {
            throw new InternalFlowiseError(StatusCodes.FORBIDDEN, `Invalid file path`)
        }

        res.setHeader('Content-Type', asset.mimeType)
        res.setHeader('Content-Disposition', `inline; filename="${asset.filename}"`)
        return res.sendFile(resolvedPath)
    } catch (error) {
        next(error)
    }
}

const updateSkillAssetCaption = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(
                StatusCodes.NOT_FOUND,
                `Error: skillAssetsController.updateSkillAssetCaption - workspace not found!`
            )
        }
        const { folderId, assetId } = req.params
        if (!folderId || !assetId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.updateSkillAssetCaption - folderId and assetId are required!`
            )
        }
        const { caption } = req.body
        if (caption === undefined) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.updateSkillAssetCaption - caption not provided!`
            )
        }
        const apiResponse = await skillAssetsService.updateSkillAssetCaption(assetId, folderId, caption, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteSkillAsset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillAssetsController.deleteSkillAsset - workspace not found!`)
        }
        const { folderId, assetId } = req.params
        if (!folderId || !assetId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillAssetsController.deleteSkillAsset - folderId and assetId are required!`
            )
        }
        const apiResponse = await skillAssetsService.deleteSkillAsset(assetId, folderId, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    uploadSkillAsset,
    getAllSkillAssets,
    getSkillAsset,
    updateSkillAssetCaption,
    deleteSkillAsset
}
