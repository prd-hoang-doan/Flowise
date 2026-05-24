import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { v4 as uuidv4 } from 'uuid'
import chatflowsService from '../../services/chatflows'
import chatflowsDebugService from '../../services/chatflows-debug'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { IReactFlowObject, IStepRunArgs, MODE } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import logger from '../../utils/logger'
import { StepRunConcurrencyExceededError } from '../../utils/agentflow-step-debug/concurrency'
import { StepRunMissingVariablesError, StepRunUnsupportedNodeError } from '../../utils/agentflow-step-debug/StepRunner'

const shortUuid = (): string => uuidv4().replace(/-/g, '').slice(0, 12)

const resolveScope = (req: Request) => {
    const workspaceId = req.user?.activeWorkspaceId
    const userId = req.user?.id
    if (!workspaceId) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `workspaceId is required`)
    if (!userId) throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, `userId is required`)
    return { workspaceId, userId }
}

const ensureAgentflow = async (req: Request) => {
    const chatflowId = req.params.id
    const { workspaceId } = resolveScope(req)
    const chatflow = await chatflowsService.getChatflowById(chatflowId, workspaceId)
    if (!chatflow) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Chatflow ${chatflowId} not found`)
    if (chatflow.type !== 'AGENTFLOW') {
        throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Step Debugger only supports AGENTFLOW chatflows`)
    }
    return chatflow
}

const translateError = (err: unknown): InternalFlowiseError => {
    if (err instanceof InternalFlowiseError) return err
    if (err instanceof StepRunUnsupportedNodeError) {
        return new InternalFlowiseError(StatusCodes.UNPROCESSABLE_ENTITY, err.message)
    }
    if (err instanceof StepRunMissingVariablesError) {
        return new InternalFlowiseError(
            StatusCodes.UNPROCESSABLE_ENTITY,
            JSON.stringify({ code: 'STEP_RUN_MISSING_VARIABLES', missingVariables: err.missingVariables })
        )
    }
    if (err instanceof StepRunConcurrencyExceededError) {
        return new InternalFlowiseError(StatusCodes.TOO_MANY_REQUESTS, err.message)
    }
    return new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, getErrorMessage(err))
}

/**
 * POST /chatflows/:id/debug/nodes/:nodeId/run
 *
 * Branches by `Accept` header: SSE stream for `text/event-stream`, JSON
 * otherwise. The SSE branch mirrors `controllers/predictions/index.ts` — same
 * Redis subscribe/unsubscribe envelope, same `addClient` / `removeClient`
 * lifecycle, same flushHeaders. Only the keying changes: a synthetic
 * `step:<flow>:<user>:<node>:<uuid>` chatId guarantees this stream cannot
 * collide with a live chat the builder may also have open.
 */
const stepRun = async (req: Request, res: Response, next: NextFunction) => {
    let chatId: string | undefined
    const isQueueMode = process.env.MODE === MODE.QUEUE
    const sseStreamer = getRunningExpressApp().sseStreamer
    let didSubscribe = false
    try {
        const chatflow = await ensureAgentflow(req)
        const { workspaceId, userId } = resolveScope(req)
        const nodeId = req.params.nodeId
        if (!nodeId) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `nodeId path param is required`)

        // Validate that the nodeId is actually in the flow before we open the
        // SSE stream — saves a half-built stream on a 404 path param typo.
        const parsed: IReactFlowObject = JSON.parse(chatflow.flowData)
        if (!parsed.nodes?.some((n) => n.id === nodeId)) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node '${nodeId}' not found in chatflow ${chatflow.id}`)
        }

        const acceptsSSE = (req.headers.accept ?? '').includes('text/event-stream') || req.body?.streaming === true
        chatId = `step:${chatflow.id}:${userId}:${nodeId}:${shortUuid()}`

        const abortController = new AbortController()
        req.on('close', () => {
            if (!res.writableEnded) abortController.abort()
        })

        const args: IStepRunArgs = {
            chatflowId: chatflow.id,
            nodeId,
            userId,
            workspaceId,
            orgId: (req.user as any)?.activeOrganizationId ?? '',
            subscriptionId: (req.user as any)?.activeOrganizationSubscriptionId ?? '',
            productId: (req.user as any)?.activeOrganizationProductId ?? '',
            inputs: req.body?.inputs,
            files: req.body?.files,
            question: req.body?.question,
            sessionId: req.body?.sessionId,
            streaming: acceptsSSE,
            chatId,
            baseURL: `${req.protocol}://${req.get('host')}`,
            isInternal: false,
            abortController
        }

        if (acceptsSSE) {
            sseStreamer.addClient(chatId, res)
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no')
            res.flushHeaders()

            if (isQueueMode) {
                await getRunningExpressApp().redisSubscriber.subscribe(chatId)
                didSubscribe = true
            }
            try {
                const result = await chatflowsDebugService.runStep({ chatflow, args })
                sseStreamer.streamMetadataEvent(chatId, result as any)
            } catch (err) {
                logger.error(`[StepDebugger]: step run failed: ${getErrorMessage(err)}`)
                if (chatId) sseStreamer.streamErrorEvent(chatId, getErrorMessage(err))
                throw translateError(err)
            } finally {
                if (isQueueMode && didSubscribe && chatId) {
                    await getRunningExpressApp().redisSubscriber.unsubscribe(chatId)
                }
                if (chatId) sseStreamer.removeClient(chatId)
            }
        } else {
            const result = await chatflowsDebugService.runStep({ chatflow, args })
            return res.json(result)
        }
    } catch (err) {
        next(translateError(err))
    }
}

export default {
    stepRun
}
