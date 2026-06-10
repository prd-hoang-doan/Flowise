import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import chatflowsService from '../../services/chatflows'
import debugVariableSnapshotService from '../../services/chatflows-debug/debugVariableSnapshotService'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'

/**
 * Read-only controllers for the Debug Variable Pool snapshot timeline.
 * Snapshot creation happens inside the StepRunner — there is intentionally
 * no POST endpoint here, so the UI cannot drift from the authoritative
 * runner-side capture path.
 */

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
        const limit = req.query.limit ? Number(req.query.limit) : undefined
        const before = (req.query.before as string | undefined) ?? undefined
        const rows = await debugVariableSnapshotService.list({ ...scope, limit, before })
        return res.json({ data: rows })
    } catch (err) {
        next(err)
    }
}

const get = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { scope } = await ensureChatflow(req)
        const row = await debugVariableSnapshotService.get(scope, req.params.snapshotId)
        return res.json(row)
    } catch (err) {
        next(err)
    }
}

export default {
    listSnapshots: list,
    getSnapshot: get
}
