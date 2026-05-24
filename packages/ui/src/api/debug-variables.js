import client from './client'

const listVariables = (chatflowId, params) => client.get(`/chatflows/${chatflowId}/debug/variables`, { params })

const getVariable = (chatflowId, varId) => client.get(`/chatflows/${chatflowId}/debug/variables/${varId}`)

const updateVariable = (chatflowId, varId, body) => client.patch(`/chatflows/${chatflowId}/debug/variables/${varId}`, body)

const resetVariable = (chatflowId, varId) => client.put(`/chatflows/${chatflowId}/debug/variables/${varId}/reset`)

const deleteVariable = (chatflowId, varId) => client.delete(`/chatflows/${chatflowId}/debug/variables/${varId}`)

const wipeVariables = (chatflowId) => client.delete(`/chatflows/${chatflowId}/debug/variables`)

const getLastRun = (chatflowId, nodeId) => client.get(`/chatflows/${chatflowId}/debug/nodes/${nodeId}/last-run`)

const listNodeVariables = (chatflowId, nodeId) => client.get(`/chatflows/${chatflowId}/debug/nodes/${nodeId}/variables`)

export default {
    listVariables,
    getVariable,
    updateVariable,
    resetVariable,
    deleteVariable,
    wipeVariables,
    getLastRun,
    listNodeVariables
}
