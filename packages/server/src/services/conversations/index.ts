import { StatusCodes } from 'http-status-codes'
import { FindOptionsWhere, IsNull, LessThan, MoreThan, Not } from 'typeorm'
import { Conversation } from '../../database/entities/Conversation'
import { ChatMessage } from '../../database/entities/ChatMessage'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { randomBytes, pbkdf2Sync } from 'crypto'
import { ChatFlow } from '../../database/entities/ChatFlow'

/**
 * Generate a secure share token
 */
const generateShareToken = (): string => {
    return randomBytes(32).toString('hex')
}

/**
 * Hash password for share protection
 */
const hashPassword = (password: string): string => {
    const salt = randomBytes(16).toString('hex')
    const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return `${salt}:${hash}`
}

/**
 * Verify password for share protection
 */
const verifyPassword = (password: string, storedHash: string): boolean => {
    const [salt, originalHash] = storedHash.split(':')
    const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return hash === originalHash
}

const extractTitleFromQuestion = (question?: string): string => {
    if (!question) return 'New Conversation'
    const maxLength = 50
    return question.length > maxLength ? question.substring(0, maxLength) + '...' : question
}

/**
 * Create a new conversation
 */
const createConversation = async (
    chatflowId: string,
    chatId: string,
    workspaceId: string,
    userId?: string,
    question?: string
): Promise<Conversation> => {
    try {
        const appServer = getRunningExpressApp()

        // Validate the chatflowId exists
        const chatFlowRepository = appServer.AppDataSource.getRepository(ChatFlow)
        const chatFlow = await chatFlowRepository.findOne({ where: { id: chatflowId } })
        if (!chatFlow) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Invalid chatflowId')
        }

        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const newConversation = conversationRepository.create({
            title: extractTitleFromQuestion(question),
            chatflowId,
            chatId,
            workspaceId,
            userId,
            isPublic: false,
            messageCount: 0,
            lastMessageAt: new Date()
        })

        const dbResponse = await conversationRepository.save(newConversation)
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.createConversation - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get conversation by ID
 */
const getConversationById = async (conversationId: string, workspaceId?: string): Promise<Conversation | null> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const whereClause: FindOptionsWhere<Conversation> = { id: conversationId }
        if (workspaceId) {
            whereClause.workspaceId = workspaceId
        }

        const conversation = await conversationRepository.findOne({
            where: whereClause,
            relations: ['chatflow']
        })

        return conversation
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.getConversationById - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get conversation by chatId
 */
const getConversationByChatId = async (chatId: string, workspaceId?: string): Promise<Conversation | null> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const whereClause: FindOptionsWhere<Conversation> = { chatId }
        if (workspaceId) {
            whereClause.workspaceId = workspaceId
        }

        const conversation = await conversationRepository.findOne({
            where: whereClause,
            relations: ['chatflow']
        })

        return conversation
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.getConversationByChatId - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get conversation by share token
 */
const getConversationByShareToken = async (shareToken: string): Promise<Conversation | null> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const conversation = await conversationRepository.findOne({
            where: {
                shareToken,
                isPublic: true
            },
            relations: ['chatflow']
        })

        // Check if share link is expired
        if (conversation?.shareExpiresAt && conversation.shareExpiresAt < new Date()) {
            return null
        }

        return conversation
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.getConversationByShareToken - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get all conversations for a workspace with pagination and filtering
 */
const getAllConversations = async (
    workspaceId: string,
    userId?: string,
    chatflowId?: string,
    page: number = 1,
    pageSize: number = 50,
    sortOrder: 'ASC' | 'DESC' = 'DESC'
): Promise<{ conversations: Conversation[]; total: number }> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const whereClause: FindOptionsWhere<Conversation> = { workspaceId }
        if (userId) {
            whereClause.userId = userId
        }
        if (chatflowId) {
            whereClause.chatflowId = chatflowId
        }

        const [conversations, total] = await conversationRepository.findAndCount({
            where: whereClause,
            relations: ['chatflow'],
            order: {
                lastMessageAt: sortOrder
            },
            skip: (page - 1) * pageSize,
            take: pageSize
        })

        return { conversations, total }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.getAllConversations - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Get conversations grouped by time periods
 */
const getConversationsGroupedByTime = async (
    workspaceId: string,
    userId?: string
): Promise<{
    today: Conversation[]
    last7Days: Conversation[]
    previous30Days: Conversation[]
}> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const last7Days = new Date(today)
        last7Days.setDate(last7Days.getDate() - 7)
        const last30Days = new Date(today)
        last30Days.setDate(last30Days.getDate() - 30)

        const whereClause: FindOptionsWhere<Conversation> = { workspaceId }
        if (userId) {
            whereClause.userId = userId
        }

        // Today
        const todayConversations = await conversationRepository.find({
            where: {
                ...whereClause,
                lastMessageAt: MoreThan(today)
            },
            relations: ['chatflow'],
            order: { lastMessageAt: 'DESC' }
        })

        // Last 7 days (excluding today)
        const last7DaysConversations = await conversationRepository.find({
            where: {
                ...whereClause,
                // lastMessageAt: MoreThan(last7Days),
                lastMessageAt: LessThan(today) as any
            },
            relations: ['chatflow'],
            order: { lastMessageAt: 'DESC' }
        })

        // Previous 30 days (excluding last 7 days)
        const previous30DaysConversations = await conversationRepository.find({
            where: {
                ...whereClause,
                // lastMessageAt: MoreThan(last30Days),
                lastMessageAt: LessThan(last7Days) as any
            },
            relations: ['chatflow'],
            order: { lastMessageAt: 'DESC' }
        })

        return {
            today: todayConversations,
            last7Days: last7DaysConversations,
            previous30Days: previous30DaysConversations
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.getConversationsGroupedByTime - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Update conversation title
 */
const updateConversationTitle = async (conversationId: string, title: string, workspaceId?: string): Promise<Conversation> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const whereClause: FindOptionsWhere<Conversation> = { id: conversationId }
        if (workspaceId) {
            whereClause.workspaceId = workspaceId
        }

        const conversation = await conversationRepository.findOne({ where: whereClause })

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        conversation.title = title
        const updatedConversation = await conversationRepository.save(conversation)

        return updatedConversation
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.updateConversationTitle - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Update conversation metadata (message count, last message time)
 */
const updateConversationMetadata = async (chatId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)
        const chatMessageRepository = appServer.AppDataSource.getRepository(ChatMessage)

        const conversation = await conversationRepository.findOne({ where: { chatId } })

        if (conversation) {
            const messageCount = await chatMessageRepository.count({ where: { chatId } })
            conversation.messageCount = messageCount
            conversation.lastMessageAt = new Date()
            await conversationRepository.save(conversation)
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.updateConversationMetadata - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Enable public sharing for a conversation
 */
const enablePublicSharing = async (
    conversationId: string,
    workspaceId: string,
    password?: string,
    expiresAt?: Date
): Promise<{ shareToken: string; shareUrl: string }> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const conversation = await conversationRepository.findOne({
            where: { id: conversationId, workspaceId }
        })

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        const shareToken = generateShareToken()
        conversation.isPublic = true
        conversation.shareToken = shareToken
        conversation.sharePassword = password ? hashPassword(password) : undefined
        conversation.shareExpiresAt = expiresAt

        await conversationRepository.save(conversation)

        // TODO: Replace with actual base URL from config
        const port = process.env.PORT || '3000'
        const baseUrl = process.env.FLOWISE_URL || `http://localhost:${port}`
        const shareUrl = `${baseUrl}/shared/${shareToken}`

        return { shareToken, shareUrl }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.enablePublicSharing - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Disable public sharing for a conversation
 */
const disablePublicSharing = async (conversationId: string, workspaceId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)

        const conversation = await conversationRepository.findOne({
            where: { id: conversationId, workspaceId }
        })

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        conversation.isPublic = false
        conversation.shareToken = undefined
        conversation.sharePassword = undefined
        conversation.shareExpiresAt = undefined

        await conversationRepository.save(conversation)
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.disablePublicSharing - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Verify share password
 */
const verifySharePassword = async (shareToken: string, password: string): Promise<boolean> => {
    try {
        const conversation = await getConversationByShareToken(shareToken)

        if (!conversation) {
            return false
        }

        if (!conversation.sharePassword) {
            return true // No password protection
        }

        return verifyPassword(password, conversation.sharePassword)
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.verifySharePassword - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Delete a conversation and all its messages
 */
const deleteConversation = async (conversationId: string, workspaceId: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)
        const chatMessageRepository = appServer.AppDataSource.getRepository(ChatMessage)

        const conversation = await conversationRepository.findOne({
            where: { id: conversationId, workspaceId }
        })

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        // Delete all messages in the conversation
        await chatMessageRepository.delete({ chatId: conversation.chatId })

        // Delete the conversation
        await conversationRepository.delete({ id: conversationId })
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.deleteConversation - ${getErrorMessage(error)}`
        )
    }
}

/**
 * Delete all conversations for a workspace/user
 */
const deleteAllConversations = async (workspaceId: string, userId?: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const conversationRepository = appServer.AppDataSource.getRepository(Conversation)
        const chatMessageRepository = appServer.AppDataSource.getRepository(ChatMessage)

        const whereClause: FindOptionsWhere<Conversation> = { workspaceId }
        if (userId) {
            whereClause.userId = userId
        }

        const conversations = await conversationRepository.find({ where: whereClause })

        for (const conversation of conversations) {
            await chatMessageRepository.delete({ chatId: conversation.chatId })
        }

        await conversationRepository.delete(whereClause)
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: conversationsService.deleteAllConversations - ${getErrorMessage(error)}`
        )
    }
}

export default {
    createConversation,
    getConversationById,
    getConversationByChatId,
    getConversationByShareToken,
    getAllConversations,
    getConversationsGroupedByTime,
    updateConversationTitle,
    updateConversationMetadata,
    enablePublicSharing,
    disablePublicSharing,
    verifySharePassword,
    deleteConversation,
    deleteAllConversations
}
