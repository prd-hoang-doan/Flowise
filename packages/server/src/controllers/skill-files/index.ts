import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import skillFilesService from '../../services/skill-files'

const createSkillFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.createSkillFile - body not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.createSkillFile - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.createSkillFile - folderId not provided!`
            )
        }
        const body = req.body
        const fileBody: Record<string, unknown> = {}
        if (body.name !== undefined) fileBody.name = body.name
        if (body.content !== undefined) fileBody.content = body.content

        const apiResponse = await skillFilesService.createSkillFile(folderId, fileBody, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteSkillFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.deleteSkillFile - id not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.deleteSkillFile - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.deleteSkillFile - folderId not provided!`
            )
        }
        const apiResponse = await skillFilesService.deleteSkillFile(req.params.id, folderId, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllSkillFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.getAllSkillFiles - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.getAllSkillFiles - folderId not provided!`
            )
        }
        const apiResponse = await skillFilesService.getAllSkillFiles(folderId, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getSkillFileById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.getSkillFileById - id not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.getSkillFileById - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.getSkillFileById - folderId not provided!`
            )
        }
        const apiResponse = await skillFilesService.getSkillFileById(req.params.id, folderId, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateSkillFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.updateSkillFile - id not provided!`
            )
        }
        if (!req.body) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.updateSkillFile - body not provided!`
            )
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.updateSkillFile - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.updateSkillFile - folderId not provided!`
            )
        }
        const body = req.body
        const fileBody: Record<string, unknown> = {}
        if (body.name !== undefined) fileBody.name = body.name
        if (body.content !== undefined) fileBody.content = body.content
        const apiResponse = await skillFilesService.updateSkillFile(req.params.id, folderId, fileBody, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createSkillFile,
    deleteSkillFile,
    getAllSkillFiles,
    getSkillFileById,
    updateSkillFile
}
