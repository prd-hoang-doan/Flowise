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
        if (body.description !== undefined) fileBody.description = body.description
        if (body.filename !== undefined) fileBody.filename = body.filename
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

/**
 * Update a skill file. Only fields provided in the body will be updated
 * @param req Request object. Expects body to contain any of the following fields: name, description, filename, content
 * @param req.content the content of the markdown file. This should be a string in markdown format below the front matter
 * ---
 * name: marketing_copy_generator
 * description: Generate marketing copy based on a product description
 * ---
 * <content goes here>
 */
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
        if (body.description !== undefined) fileBody.description = body.description
        if (body.filename !== undefined) fileBody.filename = body.filename
        if (body.content !== undefined) fileBody.content = body.content
        const apiResponse = await skillFilesService.updateSkillFile(req.params.id, folderId, fileBody, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const compilePreview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: skillFilesController.compilePreview - id not provided!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: skillFilesController.compilePreview - workspace not found!`)
        }
        const folderId = req.params.folderId
        if (!folderId) {
            throw new InternalFlowiseError(
                StatusCodes.PRECONDITION_FAILED,
                `Error: skillFilesController.compilePreview - folderId not provided!`
            )
        }
        const config = {
            executionMode: req.query.executionMode as string | undefined,
            maxAssetContext: req.query.maxAssetContext ? parseInt(req.query.maxAssetContext as string, 10) : undefined,
            maxMultimodalAssets: req.query.maxMultimodalAssets ? parseInt(req.query.maxMultimodalAssets as string, 10) : undefined,
            maxDocumentChars: req.query.maxDocumentChars ? parseInt(req.query.maxDocumentChars as string, 10) : undefined
        }
        const apiResponse = await skillFilesService.compilePreview(req.params.id, folderId, workspaceId, config)
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
    updateSkillFile,
    compilePreview
}
