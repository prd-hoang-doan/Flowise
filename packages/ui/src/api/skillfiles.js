import client from './client'

const getAllSkillFiles = (folderId) => client.get(`/skill-folders/${folderId}/files`)

const getSkillFile = (folderId, id) => client.get(`/skill-folders/${folderId}/files/${id}`)

const createSkillFile = (folderId, body) => client.post(`/skill-folders/${folderId}/files`, body)

const updateSkillFile = (folderId, id, body) => client.put(`/skill-folders/${folderId}/files/${id}`, body)

const deleteSkillFile = (folderId, id) => client.delete(`/skill-folders/${folderId}/files/${id}`)

const getCompilePreview = (folderId, fileId, params = {}) => {
    const query = new URLSearchParams()
    if (params.executionMode) query.set('executionMode', params.executionMode)
    if (params.maxAssetContext) query.set('maxAssetContext', String(params.maxAssetContext))
    if (params.maxMultimodalAssets) query.set('maxMultimodalAssets', String(params.maxMultimodalAssets))
    if (params.maxDocumentChars) query.set('maxDocumentChars', String(params.maxDocumentChars))
    const qs = query.toString()
    return client.get(`/skill-folders/${folderId}/files/${fileId}/compile-preview${qs ? `?${qs}` : ''}`)
}

export default {
    getAllSkillFiles,
    getSkillFile,
    createSkillFile,
    updateSkillFile,
    deleteSkillFile,
    getCompilePreview
}
