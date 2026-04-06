import client from './client'

const uploadSkillAsset = (folderId, fileId, formData) =>
    client.post(`/skill-folders/${folderId}/files/${fileId}/assets`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

const getAllSkillAssets = (folderId, fileId) => client.get(`/skill-folders/${folderId}/files/${fileId}/assets`)

const getSkillAssetUrl = (folderId, assetId) => `/api/v1/skill-folders/${folderId}/assets/${assetId}`

const updateSkillAssetCaption = (folderId, assetId, caption) => client.put(`/skill-folders/${folderId}/assets/${assetId}`, { caption })

const deleteSkillAsset = (folderId, assetId) => client.delete(`/skill-folders/${folderId}/assets/${assetId}`)

const regenerateCaption = (folderId, assetId) => client.post(`/skill-folders/${folderId}/assets/${assetId}/regenerate-caption`)

const getChatModels = () => client.get('/assistants/components/chatmodels')

export default {
    uploadSkillAsset,
    getAllSkillAssets,
    getSkillAssetUrl,
    updateSkillAssetCaption,
    deleteSkillAsset,
    regenerateCaption,
    getChatModels
}
