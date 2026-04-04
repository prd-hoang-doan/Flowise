import client from './client'

const getAllSkillFolders = (params) => client.get('/skill-folders', { params })

const getSkillFolder = (id) => client.get(`/skill-folders/${id}`)

const createSkillFolder = (body) => client.post(`/skill-folders`, body)

const updateSkillFolder = (id, body) => client.put(`/skill-folders/${id}`, body)

const deleteSkillFolder = (id) => client.delete(`/skill-folders/${id}`)

export default {
    getAllSkillFolders,
    getSkillFolder,
    createSkillFolder,
    updateSkillFolder,
    deleteSkillFolder
}
