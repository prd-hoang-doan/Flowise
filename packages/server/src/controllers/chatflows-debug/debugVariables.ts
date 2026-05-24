import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import chatflowsService from '../../services/chatflows'
import debugVariableService from '../../services/chatflows-debug/debugVariableService'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'

const resolveScope = (req: Request) => {
    const workspaceId = req.user?.activeWorkspaceId
    const userId = req.user?.id
    if (!workspaceId) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `workspaceId is required`)
    if (!userId) throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, `userId is required`)
    return { chatflowId: req.params.id, workspaceId, userId }
}

const ensureChatflow = async (req: Request) => {
    const scope = resolveScope(req)
    const chatflow = await chatflowsService.getChatflowById(scope.chatflowId, scope.workspaceId)
    if (!chatflow) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Chatflow ${scope.chatflowId} not found`)
    if (chatflow.type !== 'AGENTFLOW') {
        throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Step Debugger only supports AGENTFLOW chatflows`)
    }
    return { scope, chatflow }
}

const list = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const nodeId = (req.query.nodeId as string | undefined) ?? undefined
        const rows = await debugVariableService.list(scope, nodeId)
        return res.json({ data: rows })
    } catch (err) {
        next(err)
    }
}

const get = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const varId = req.params.varId
        const row = await debugVariableService.get(scope, varId)
        return res.json(row)
    } catch (err) {
        next(err)
    }
}

const update = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const varId = req.params.varId
        const patch = {
            value: req.body?.value,
            visible: req.body?.visible,
            description: req.body?.description
        }
        const row = await debugVariableService.update(scope, varId, patch)
        return res.json(row)
    } catch (err) {
        next(err)
    }
}

const reset = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const varId = req.params.varId
        const row = await debugVariableService.reset(scope, varId)
        return res.json(row ?? { deleted: true })
    } catch (err) {
        next(err)
    }
}

const remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const varId = req.params.varId
        await debugVariableService.remove(scope, varId)
        return res.status(StatusCodes.NO_CONTENT).end()
    } catch (err) {
        next(err)
    }
}

const wipe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const result = await debugVariableService.wipe(scope)
        return res.json(result)
    } catch (err) {
        next(err)
    }
}

export default {
    list,
    get,
    update,
    reset,
    remove,
    wipe
}
