import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import conversationsService from '../../services/conversations'
import chatMessagesService from '../../services/chat-messages'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { ChatType } from '../../Interface'

/**
 * Create a new conversation
 * POST /api/v1/conversations
 */
const createConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { chatflowId, question, chatId } = req.body
        const workspaceId = req.user?.activeWorkspaceId
        const userId = req.user?.id

        if (!chatflowId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'chatflowId is required')
        }

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        // Generate unique chatId from client
        if (!chatId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'chatId is required')
        }

        if (!question) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'question is required')
        }

        // Create the conversation record
        const conversation = await conversationsService.createConversation(chatflowId, chatId, workspaceId, userId, question)

        // Set up params for prediction controller
        req.params.id = chatflowId

        // Store conversation in res.locals for potential use in response
        res.locals.conversation = conversation

        // Pass control to prediction controller to create the chat message
        next()
    } catch (error) {
        next(error)
    }
}

/**
 * Get all conversations with optional filters
 * GET /api/v1/conversations
 */
const getAllConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const userId = req.query.userId as string | undefined
        const chatflowId = req.query.chatflowId as string | undefined
        const page = parseInt(req.query.page as string) || 1
        const pageSize = parseInt(req.query.pageSize as string) || 50
        const sortOrder = (req.query.sortOrder as 'ASC' | 'DESC') || 'DESC'

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        const result = await conversationsService.getAllConversations(workspaceId, userId, chatflowId, page, pageSize, sortOrder)

        return res.json({
            conversations: result.conversations,
            total: result.total,
            page,
            pageSize,
            totalPages: Math.ceil(result.total / pageSize)
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get conversations grouped by time periods
 * GET /api/v1/conversations/grouped
 */
const getConversationsGrouped = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const userId = req.user?.id

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        const grouped = await conversationsService.getConversationsGroupedByTime(workspaceId, userId)

        return res.json(grouped)
    } catch (error) {
        next(error)
    }
}

/**
 * Get conversation by ID
 * GET /api/v1/conversations/:id
 */
const getConversationById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const workspaceId = req.user?.activeWorkspaceId

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        const conversation = await conversationsService.getConversationById(id, workspaceId)

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        // Get all chat messages for this conversation
        const messages = await chatMessagesService.getAllChatMessages(
            conversation.chatflowId,
            undefined,
            'ASC',
            conversation.chatId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            workspaceId,
            undefined,
            undefined
        )

        return res.json({ conversation, messages })
    } catch (error) {
        next(error)
    }
}

/**
 * Update conversation (e.g., rename)
 * PATCH /api/v1/conversations/:id
 */
const updateConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const { title } = req.body
        const workspaceId = req.user?.activeWorkspaceId

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        if (!title) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Title is required')
        }

        const conversation = await conversationsService.updateConversationTitle(id, title, workspaceId)

        return res.json(conversation)
    } catch (error) {
        next(error)
    }
}

/**
 * Delete a conversation
 * DELETE /api/v1/conversations/:id
 */
const deleteConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const workspaceId = req.user?.activeWorkspaceId

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        await conversationsService.deleteConversation(id, workspaceId)

        return res.status(StatusCodes.NO_CONTENT).send()
    } catch (error) {
        next(error)
    }
}

/**
 * Delete all conversations
 * DELETE /api/v1/conversations
 */
const deleteAllConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const userId = req.user?.id

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        await conversationsService.deleteAllConversations(workspaceId, userId)

        return res.status(StatusCodes.NO_CONTENT).send()
    } catch (error) {
        next(error)
    }
}

/**
 * Get messages for a conversation
 * GET /api/v1/conversations/:id/messages
 */
const getConversationMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const workspaceId = req.user?.activeWorkspaceId
        const page = parseInt(req.query.page as string) || undefined
        const pageSize = parseInt(req.query.pageSize as string) || undefined
        const sortOrder = (req.query.sortOrder as string) || 'ASC'

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        // Get conversation to verify ownership and get chatId
        const conversation = await conversationsService.getConversationById(id, workspaceId)

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Conversation not found')
        }

        // Get messages using the chatId
        const messages = await chatMessagesService.getAllChatMessages(
            conversation.chatflowId,
            [ChatType.INTERNAL, ChatType.EXTERNAL],
            sortOrder,
            conversation.chatId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            workspaceId,
            page,
            pageSize
        )

        return res.json(messages)
    } catch (error) {
        next(error)
    }
}

/**
 * Enable public sharing
 * POST /api/v1/conversations/:id/share
 */
const enableSharing = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const { password, expiresAt } = req.body
        const workspaceId = req.user?.activeWorkspaceId

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        const expirationDate = expiresAt ? new Date(expiresAt) : undefined

        const result = await conversationsService.enablePublicSharing(id, workspaceId, password, expirationDate)

        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Disable public sharing
 * DELETE /api/v1/conversations/:id/share
 */
const disableSharing = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        const workspaceId = req.user?.activeWorkspaceId

        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Workspace ID not found')
        }

        await conversationsService.disablePublicSharing(id, workspaceId)

        return res.status(StatusCodes.NO_CONTENT).send()
    } catch (error) {
        next(error)
    }
}

/**
 * Get public conversation (no auth required)
 * GET /api/v1/public/conversations/:shareToken
 */
const getPublicConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shareToken } = req.params

        const conversation = await conversationsService.getConversationByShareToken(shareToken)

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Shared conversation not found or expired')
        }

        // Return conversation without sensitive data
        const publicConversation = {
            id: conversation.id,
            title: conversation.title,
            chatflowId: conversation.chatflowId,
            chatId: conversation.chatId,
            messageCount: conversation.messageCount,
            lastMessageAt: conversation.lastMessageAt,
            createdDate: conversation.createdDate,
            hasPassword: !!conversation.sharePassword,
            chatflow: conversation.chatflow
                ? {
                      name: conversation.chatflow.name,
                      type: conversation.chatflow.type
                  }
                : undefined
        }

        return res.json(publicConversation)
    } catch (error) {
        next(error)
    }
}

/**
 * Get messages for public conversation (no auth required)
 * GET /api/v1/public/conversations/:shareToken/messages
 */
const getPublicConversationMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shareToken } = req.params
        const page = parseInt(req.query.page as string) || undefined
        const pageSize = parseInt(req.query.pageSize as string) || undefined
        const sortOrder = (req.query.sortOrder as string) || 'ASC'

        const conversation = await conversationsService.getConversationByShareToken(shareToken)

        if (!conversation) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, 'Shared conversation not found or expired')
        }

        // Get messages using the chatId (no workspace filter for public access)
        const messages = await chatMessagesService.getAllChatMessages(
            conversation.chatflowId,
            [ChatType.INTERNAL, ChatType.EXTERNAL],
            sortOrder,
            conversation.chatId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            page,
            pageSize
        )

        return res.json(messages)
    } catch (error) {
        next(error)
    }
}

/**
 * Verify password for public conversation
 * POST /api/v1/public/conversations/:shareToken/verify
 */
const verifyPublicConversationPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shareToken } = req.params
        const { password } = req.body

        if (!password) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Password is required')
        }

        const isValid = await conversationsService.verifySharePassword(shareToken, password)

        if (!isValid) {
            throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Invalid password')
        }

        return res.json({ valid: true })
    } catch (error) {
        next(error)
    }
}

export default {
    createConversation,
    getAllConversations,
    getConversationsGrouped,
    getConversationById,
    updateConversation,
    deleteConversation,
    deleteAllConversations,
    getConversationMessages,
    enableSharing,
    disableSharing,
    getPublicConversation,
    getPublicConversationMessages,
    verifyPublicConversationPassword
}
