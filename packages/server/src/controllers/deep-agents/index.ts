import { Request, Response, NextFunction } from 'express'
import deepAgentsService, { DeepAgentSessionFilters } from '../../services/deep-agents'
import { DeepAgentSessionStatus } from '../../Interface'
import { deepAgentOrchestrator } from './orchestrator-v2'

// ==============================|| SESSION ENDPOINTS ||============================== //

const createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title } = req.body
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            return res.status(400).json({ message: 'Workspace ID is required' })
        }
        const session = await deepAgentsService.createSession(title || 'New Research Session', workspaceId)
        return res.status(201).json(session)
    } catch (error) {
        next(error)
    }
}

const getSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        const detail = await deepAgentsService.getSessionDetail(sessionId, workspaceId)
        return res.json(detail)
    } catch (error) {
        next(error)
    }
}

const getAllSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filters: DeepAgentSessionFilters = {
            workspaceId: req.user?.activeWorkspaceId
        }

        if (req.query.status) {
            const statusValue = req.query.status as string
            if (['ACTIVE', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(statusValue)) {
                filters.status = statusValue as DeepAgentSessionStatus
            }
        }
        if (req.query.page) filters.page = parseInt(req.query.page as string, 10)
        if (req.query.limit) filters.limit = parseInt(req.query.limit as string, 10)

        const result = await deepAgentsService.getAllSessions(filters)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

const deleteSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        await deepAgentsService.deleteSession(sessionId, workspaceId)
        return res.json({ message: 'Session deleted' })
    } catch (error) {
        next(error)
    }
}

const cancelSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        // Signal the orchestrator to stop execution
        deepAgentOrchestrator.cancelExecution(sessionId)
        const session = await deepAgentsService.updateSessionStatus(sessionId, 'CANCELLED', workspaceId)
        return res.json(session)
    } catch (error) {
        next(error)
    }
}

// ==============================|| MESSAGE ENDPOINTS ||============================== //

const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const { content } = req.body
        const workspaceId = req.user?.activeWorkspaceId

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ message: 'Message content is required' })
        }

        // Verify session exists and belongs to workspace
        const session = await deepAgentsService.getSessionById(sessionId, workspaceId)

        // If session title is default, update it with first prompt (truncated)
        if (session.title === 'New Research Session') {
            const truncatedTitle = content.length > 100 ? content.substring(0, 100) + '...' : content
            session.title = truncatedTitle
            const appServer = (await import('../../utils/getRunningExpressApp')).getRunningExpressApp()
            await appServer.AppDataSource.getRepository((await import('../../database/entities/DeepAgentSession')).DeepAgentSession).save(
                session
            )
        }

        // Save user message
        const userMessage = await deepAgentsService.addMessage(sessionId, 'user', content)

        // Trigger agent orchestration asynchronously
        deepAgentOrchestrator.execute(sessionId, content, workspaceId!)

        return res.status(201).json(userMessage)
    } catch (error) {
        next(error)
    }
}

const getMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        // Verify session access
        await deepAgentsService.getSessionById(sessionId, workspaceId)
        const messages = await deepAgentsService.getMessagesBySessionId(sessionId)
        return res.json(messages)
    } catch (error) {
        next(error)
    }
}

// ==============================|| ARTIFACT ENDPOINTS ||============================== //

const getArtifacts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        await deepAgentsService.getSessionById(sessionId, workspaceId)
        const artifacts = await deepAgentsService.getArtifactsBySessionId(sessionId)
        return res.json(artifacts)
    } catch (error) {
        next(error)
    }
}

const exportArtifact = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        const format = (req.query.format as string) || 'md'
        const version = req.query.version ? parseInt(req.query.version as string, 10) : undefined

        const session = await deepAgentsService.getSessionById(sessionId, workspaceId)

        let artifact
        if (version) {
            artifact = await deepAgentsService.getArtifactByVersion(sessionId, version)
        } else {
            artifact = await deepAgentsService.getLatestArtifact(sessionId)
        }
        if (!artifact) {
            return res.status(404).json({ message: 'No artifact found for this session' })
        }

        const mimeTypes: Record<string, string> = {
            md: 'text/markdown',
            txt: 'text/plain',
            html: 'text/html'
        }

        const extensions: Record<string, string> = {
            md: '.md',
            txt: '.txt',
            html: '.html'
        }

        const mimeType = mimeTypes[format] || 'text/markdown'
        const extension = extensions[format] || '.md'

        // FR-8: Generate a descriptive filename from session title
        const safeTitle = (session.title || 'artifact')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 60)
        const versionSuffix = artifact.version > 1 ? `-v${artifact.version}` : ''

        let content = artifact.content
        // Convert markdown to other formats if needed
        if (format === 'html') {
            content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${session.title}</title></head><body>${artifact.content}</body></html>`
        }

        res.setHeader('Content-Type', mimeType)
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}${versionSuffix}${extension}"`)
        return res.send(content)
    } catch (error) {
        next(error)
    }
}

// ==============================|| SSE STREAM ENDPOINT ||============================== //

const streamSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId

        // Verify session access
        await deepAgentsService.getSessionById(sessionId, workspaceId)

        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()

        // Register this client for session updates
        deepAgentOrchestrator.addClient(sessionId, res)

        // Clean up on disconnect
        req.on('close', () => {
            deepAgentOrchestrator.removeClient(sessionId, res)
        })
    } catch (error) {
        next(error)
    }
}

// ==============================|| STEP ENDPOINTS ||============================== //

const getSteps = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = req.params.id
        const workspaceId = req.user?.activeWorkspaceId
        await deepAgentsService.getSessionById(sessionId, workspaceId)
        const steps = await deepAgentsService.getStepsBySessionId(sessionId)
        return res.json(steps)
    } catch (error) {
        next(error)
    }
}

export default {
    createSession,
    getSessionById,
    getAllSessions,
    deleteSession,
    cancelSession,
    sendMessage,
    getMessages,
    getArtifacts,
    exportArtifact,
    streamSession,
    getSteps
}
