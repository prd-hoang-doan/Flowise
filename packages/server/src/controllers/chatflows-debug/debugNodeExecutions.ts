import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import chatflowsService from '../../services/chatflows'
import debugNodeExecutionService from '../../services/chatflows-debug/debugNodeExecutionService'
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
    return scope
}

const getLastRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const scope = await ensureChatflow(req)
        const nodeId = req.params.nodeId
        if (!nodeId) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `nodeId path param is required`)
        const row = await debugNodeExecutionService.getLastRun(scope, nodeId)
        return res.json(row ?? null)
    } catch (err) {
        next(err)
    }
}

const listForNode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const scope = await ensureChatflow(req)
        const nodeId = req.params.nodeId
        if (!nodeId) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `nodeId path param is required`)
        const rows = await debugNodeExecutionService.listVariablesForNode(scope, nodeId)
        return res.json({ data: rows })
    } catch (err) {
        next(err)
    }
}

export default {
    getLastRun,
    listForNode
}
