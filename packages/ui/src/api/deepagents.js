import client from './client'

// Sessions
const createSession = (body) => client.post('/deep-agents/sessions', body)

const getAllSessions = (params) => client.get('/deep-agents/sessions', { params })

const getSessionById = (id) => client.get(`/deep-agents/sessions/${id}`)

const deleteSession = (id) => client.delete(`/deep-agents/sessions/${id}`)

const cancelSession = (id) => client.post(`/deep-agents/sessions/${id}/cancel`)

// Messages
const sendMessage = (sessionId, body) => client.post(`/deep-agents/sessions/${sessionId}/messages`, body)

const getMessages = (sessionId) => client.get(`/deep-agents/sessions/${sessionId}/messages`)

// Steps
const getSteps = (sessionId) => client.get(`/deep-agents/sessions/${sessionId}/steps`)

// Artifacts
const getArtifacts = (sessionId) => client.get(`/deep-agents/sessions/${sessionId}/artifacts`)

const exportArtifact = (sessionId, format = 'md') =>
    client.get(`/deep-agents/sessions/${sessionId}/artifacts/export`, {
        params: { format },
        responseType: 'blob'
    })

export default {
    createSession,
    getAllSessions,
    getSessionById,
    deleteSession,
    cancelSession,
    sendMessage,
    getMessages,
    getSteps,
    getArtifacts,
    exportArtifact
}
