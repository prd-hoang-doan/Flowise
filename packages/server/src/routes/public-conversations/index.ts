import express from 'express'
import conversationController from '../../controllers/conversations'

const router = express.Router()

// Public conversation access (no auth required)
router.get('/:shareToken', conversationController.getPublicConversation)
router.get('/:shareToken/messages', conversationController.getPublicConversationMessages)
router.post('/:shareToken/verify', conversationController.verifyPublicConversationPassword)

export default router
