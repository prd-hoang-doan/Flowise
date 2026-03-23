import { StatusCodes } from 'http-status-codes'
import { DeepAgentSession } from '../../database/entities/DeepAgentSession'
import { DeepAgentMessage } from '../../database/entities/DeepAgentMessage'
import { DeepAgentStep } from '../../database/entities/DeepAgentStep'
import { DeepAgentArtifact } from '../../database/entities/DeepAgentArtifact'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { DeepAgentSessionStatus, DeepAgentStepStatus, DeepAgentArtifactStatus, DeepAgentArtifactType } from '../../Interface'

// ==============================|| SESSION OPERATIONS ||============================== //

const createSession = async (title: string, workspaceId: string): Promise<DeepAgentSession> => {
    try {
        const appServer = getRunningExpressApp()
        const sessionRepo = appServer.AppDataSource.getRepository(DeepAgentSession)

        const session = sessionRepo.create({
            title,
            status: 'ACTIVE' as DeepAgentSessionStatus,
            workspaceId
        })

        return await sessionRepo.save(session)
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.createSession - ${getErrorMessage(error)}`
        )
    }
}

const getSessionById = async (sessionId: string, workspaceId?: string): Promise<DeepAgentSession> => {
    try {
        const appServer = getRunningExpressApp()
        const sessionRepo = appServer.AppDataSource.getRepository(DeepAgentSession)

        const query: any = { id: sessionId }
        if (workspaceId) query.workspaceId = workspaceId

        const session = await sessionRepo.findOne({ where: query })
        if (!session) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Session ${sessionId} not found`)
        }
        return session
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getSessionById - ${getErrorMessage(error)}`
        )
    }
}

export interface DeepAgentSessionFilters {
    page?: number
    limit?: number
    status?: DeepAgentSessionStatus
    workspaceId?: string
}

const getAllSessions = async (filters: DeepAgentSessionFilters = {}): Promise<{ data: DeepAgentSession[]; total: number }> => {
    try {
        const appServer = getRunningExpressApp()
        const { page = 1, limit = 20, status, workspaceId } = filters

        const queryBuilder = appServer.AppDataSource.getRepository(DeepAgentSession)
            .createQueryBuilder('session')
            .orderBy('session.updatedDate', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)

        if (workspaceId) queryBuilder.andWhere('session.workspaceId = :workspaceId', { workspaceId })
        if (status) queryBuilder.andWhere('session.status = :status', { status })

        const [data, total] = await queryBuilder.getManyAndCount()
        return { data, total }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getAllSessions - ${getErrorMessage(error)}`
        )
    }
}

const updateSessionStatus = async (sessionId: string, status: DeepAgentSessionStatus, workspaceId?: string): Promise<DeepAgentSession> => {
    try {
        const session = await getSessionById(sessionId, workspaceId)
        session.status = status
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentSession).save(session)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.updateSessionStatus - ${getErrorMessage(error)}`
        )
    }
}

const deleteSession = async (sessionId: string, workspaceId?: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        // Verify session exists and belongs to workspace
        await getSessionById(sessionId, workspaceId)

        // Delete related data in order
        await appServer.AppDataSource.getRepository(DeepAgentArtifact).delete({ sessionId })
        await appServer.AppDataSource.getRepository(DeepAgentStep).delete({ sessionId })
        await appServer.AppDataSource.getRepository(DeepAgentMessage).delete({ sessionId })
        await appServer.AppDataSource.getRepository(DeepAgentSession).delete({ id: sessionId })
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.deleteSession - ${getErrorMessage(error)}`
        )
    }
}

// ==============================|| MESSAGE OPERATIONS ||============================== //

const addMessage = async (
    sessionId: string,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string
): Promise<DeepAgentMessage> => {
    try {
        const appServer = getRunningExpressApp()
        const messageRepo = appServer.AppDataSource.getRepository(DeepAgentMessage)

        const message = messageRepo.create({ sessionId, role, content })
        return await messageRepo.save(message)
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: deepAgentsService.addMessage - ${getErrorMessage(error)}`)
    }
}

const getMessagesBySessionId = async (sessionId: string): Promise<DeepAgentMessage[]> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentMessage).find({
            where: { sessionId },
            order: { createdDate: 'ASC' }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getMessagesBySessionId - ${getErrorMessage(error)}`
        )
    }
}

// ==============================|| STEP OPERATIONS ||============================== //

const addStep = async (sessionId: string, stepIndex: number, description: string, toolName?: string): Promise<DeepAgentStep> => {
    try {
        const appServer = getRunningExpressApp()
        const stepRepo = appServer.AppDataSource.getRepository(DeepAgentStep)

        const step = stepRepo.create({
            sessionId,
            stepIndex,
            description,
            status: 'PENDING' as DeepAgentStepStatus,
            toolName
        })
        return await stepRepo.save(step)
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: deepAgentsService.addStep - ${getErrorMessage(error)}`)
    }
}

const updateStep = async (
    stepId: string,
    update: Partial<Pick<DeepAgentStep, 'status' | 'toolInput' | 'toolOutput' | 'error' | 'startedAt' | 'completedAt'>>
): Promise<DeepAgentStep> => {
    try {
        const appServer = getRunningExpressApp()
        const stepRepo = appServer.AppDataSource.getRepository(DeepAgentStep)

        const step = await stepRepo.findOne({ where: { id: stepId } })
        if (!step) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Step ${stepId} not found`)
        }
        Object.assign(step, update)
        return await stepRepo.save(step)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: deepAgentsService.updateStep - ${getErrorMessage(error)}`)
    }
}

const getStepsBySessionId = async (sessionId: string): Promise<DeepAgentStep[]> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentStep).find({
            where: { sessionId },
            order: { stepIndex: 'ASC' }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getStepsBySessionId - ${getErrorMessage(error)}`
        )
    }
}

// ==============================|| ARTIFACT OPERATIONS ||============================== //

const createArtifact = async (
    sessionId: string,
    content: string,
    type: DeepAgentArtifactType = 'markdown',
    version: number = 1
): Promise<DeepAgentArtifact> => {
    try {
        const appServer = getRunningExpressApp()
        const artifactRepo = appServer.AppDataSource.getRepository(DeepAgentArtifact)

        const artifact = artifactRepo.create({
            sessionId,
            type,
            content,
            version,
            status: 'DRAFTING' as DeepAgentArtifactStatus
        })
        return await artifactRepo.save(artifact)
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.createArtifact - ${getErrorMessage(error)}`
        )
    }
}

const updateArtifact = async (
    artifactId: string,
    update: Partial<Pick<DeepAgentArtifact, 'content' | 'status'>>
): Promise<DeepAgentArtifact> => {
    try {
        const appServer = getRunningExpressApp()
        const artifactRepo = appServer.AppDataSource.getRepository(DeepAgentArtifact)

        const artifact = await artifactRepo.findOne({ where: { id: artifactId } })
        if (!artifact) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Artifact ${artifactId} not found`)
        }
        Object.assign(artifact, update)
        return await artifactRepo.save(artifact)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.updateArtifact - ${getErrorMessage(error)}`
        )
    }
}

const getArtifactsBySessionId = async (sessionId: string): Promise<DeepAgentArtifact[]> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentArtifact).find({
            where: { sessionId },
            order: { version: 'DESC' }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getArtifactsBySessionId - ${getErrorMessage(error)}`
        )
    }
}

const getLatestArtifact = async (sessionId: string): Promise<DeepAgentArtifact | null> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentArtifact).findOne({
            where: { sessionId },
            order: { version: 'DESC' }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getLatestArtifact - ${getErrorMessage(error)}`
        )
    }
}

const getArtifactByVersion = async (sessionId: string, version: number): Promise<DeepAgentArtifact | null> => {
    try {
        const appServer = getRunningExpressApp()
        return await appServer.AppDataSource.getRepository(DeepAgentArtifact).findOne({
            where: { sessionId, version }
        })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: deepAgentsService.getArtifactByVersion - ${getErrorMessage(error)}`
        )
    }
}

// ==============================|| FULL SESSION DETAIL ||============================== //

const getSessionDetail = async (sessionId: string, workspaceId?: string) => {
    const session = await getSessionById(sessionId, workspaceId)
    const messages = await getMessagesBySessionId(sessionId)
    const steps = await getStepsBySessionId(sessionId)
    const artifacts = await getArtifactsBySessionId(sessionId)

    return {
        ...session,
        messages,
        steps,
        artifacts
    }
}

export default {
    // Sessions
    createSession,
    getSessionById,
    getAllSessions,
    updateSessionStatus,
    deleteSession,
    getSessionDetail,

    // Messages
    addMessage,
    getMessagesBySessionId,

    // Steps
    addStep,
    updateStep,
    getStepsBySessionId,

    // Artifacts
    createArtifact,
    updateArtifact,
    getArtifactsBySessionId,
    getLatestArtifact,
    getArtifactByVersion
}
