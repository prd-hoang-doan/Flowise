import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import skillFoldersService from '../../services/skill-folders'
import { getPageAndLimitParams } from '../../utils/pagination'

const createSkillFolder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFoldersController.createSkillFolder - body not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFoldersController.createSkillFolder - workspace not found!`)
        }
        const body = req.body
        const folderBody: Record<string, unknown> = {}
        if (body.name !== undefined) folderBody.name = body.name
        if (body.color !== undefined) folderBody.color = body.color
        if (body.iconSrc !== undefined) folderBody.iconSrc = body.iconSrc
        if (body.description !== undefined) folderBody.description = body.description
        folderBody.workspaceId = workspaceId

        const apiResponse = await skillFoldersService.createSkillFolder(folderBody)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteSkillFolder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFoldersController.deleteSkillFolder - id not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFoldersController.deleteSkillFolder - workspace not found!`)
        }
        const apiResponse = await skillFoldersService.deleteSkillFolder(req.params.id, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllSkillFolders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await skillFoldersService.getAllSkillFolders(req.user?.activeWorkspaceId, page, limit)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getSkillFolderById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFoldersController.getSkillFolderById - id not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFoldersController.getSkillFolderById - workspace not found!`)
        }
        const apiResponse = await skillFoldersService.getSkillFolderById(req.params.id, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateSkillFolder = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFoldersController.updateSkillFolder - id not provided!`
            )
        }
        if (!req.body) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFoldersController.updateSkillFolder - body not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFoldersController.updateSkillFolder - workspace not found!`)
        }
        const body = req.body
        const folderBody: Record<string, unknown> = {}
        if (body.name !== undefined) folderBody.name = body.name
        if (body.color !== undefined) folderBody.color = body.color
        if (body.iconSrc !== undefined) folderBody.iconSrc = body.iconSrc
        if (body.description !== undefined) folderBody.description = body.description
        if (body.captionModelConfig !== undefined) folderBody.captionModelConfig = body.captionModelConfig
        const apiResponse = await skillFoldersService.updateSkillFolder(req.params.id, folderBody, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createSkillFolder,
    deleteSkillFolder,
    getAllSkillFolders,
    getSkillFolderById,
    updateSkillFolder
}
