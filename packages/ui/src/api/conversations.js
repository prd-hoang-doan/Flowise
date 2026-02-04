import client from './client'

// Conversation CRUD
const getAllConversations = (params) => client.get('/conversations', { params })

const getConversationsGrouped = () => client.get('/conversations/grouped')

const getConversationById = (id) => client.get(`/conversations/${id}`)

const createConversation = (body) => client.post('/conversations', body)

const updateConversation = (id, body) => client.patch(`/conversations/${id}`, body)

const deleteConversation = (id) => client.delete(`/conversations/${id}`)

const deleteAllConversations = () => client.delete('/conversations')

// Messages
const getConversationMessages = (id, params) => client.get(`/conversations/${id}/messages`, { params })

// Sharing
const enableSharing = (id, body) => client.post(`/conversations/${id}/share`, body)

const disableSharing = (id) => client.delete(`/conversations/${id}/share`)

// Public endpoints
const getPublicConversation = (shareToken) => client.get(`/public-conversations/${shareToken}`)

const getPublicConversationMessages = (shareToken, params) => client.get(`/public-conversations/${shareToken}/messages`, { params })

const verifySharePassword = (shareToken, body) => client.post(`/public-conversations/${shareToken}/verify`, body)

export default {
    getAllConversations,
    getConversationsGrouped,
    getConversationById,
    createConversation,
    updateConversation,
    deleteConversation,
    deleteAllConversations,
    getConversationMessages,
    enableSharing,
    disableSharing,
    getPublicConversation,
    getPublicConversationMessages,
    verifySharePassword
}
