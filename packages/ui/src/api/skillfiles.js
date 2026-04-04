import client from './client'

const getAllSkillFiles = (folderId) => client.get(`/skill-folders/${folderId}/files`)

const getSkillFile = (folderId, id) => client.get(`/skill-folders/${folderId}/files/${id}`)

const createSkillFile = (folderId, body) => client.post(`/skill-folders/${folderId}/files`, body)

const updateSkillFile = (folderId, id, body) => client.put(`/skill-folders/${folderId}/files/${id}`, body)

const deleteSkillFile = (folderId, id) => client.delete(`/skill-folders/${folderId}/files/${id}`)

export default {
    getAllSkillFiles,
    getSkillFile,
    createSkillFile,
    updateSkillFile,
    deleteSkillFile
}
