import express from 'express'
import conversationController from '../../controllers/conversations'
import predictionsController from '../../controllers/predictions'

const router = express.Router()

// Conversation CRUD operations
router.post('/', conversationController.createConversation, predictionsController.createPrediction)
router.get('/', conversationController.getAllConversations)
router.get('/grouped', conversationController.getConversationsGrouped)
router.get('/:id', conversationController.getConversationById)
router.patch('/:id', conversationController.updateConversation)
router.delete('/:id', conversationController.deleteConversation)
router.delete('/', conversationController.deleteAllConversations)

// Conversation messages
router.get('/:id/messages', conversationController.getConversationMessages)

// Sharing
router.post('/:id/share', conversationController.enableSharing)
router.delete('/:id/share', conversationController.disableSharing)

export default router
