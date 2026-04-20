import client from './client'
import { baseURL } from '@/store/constant'

// API client for Skills V2. Mirrors 1:1 the routes under
// packages/server/src/routes/skills-v2/index.ts. Every call is scoped to a
// workspace id the caller resolves from the Redux auth slice.

const base = (wsId) => `/skills-v2/workspaces/${wsId}/skills`

// -------- skill-level --------

const listSkills = (wsId, params) => client.get(base(wsId), { params })

const getSkill = (wsId, skillId) => client.get(`${base(wsId)}/${skillId}`)

const createSkill = (wsId, body) => client.post(base(wsId), body)

const updateSkill = (wsId, skillId, body) => client.put(`${base(wsId)}/${skillId}`, body)

const deleteSkill = (wsId, skillId) => client.delete(`${base(wsId)}/${skillId}`)

const publishSkill = (wsId, skillId) => client.post(`${base(wsId)}/${skillId}/publish`)

const getBundle = (wsId, skillId, mode) => client.get(`${base(wsId)}/${skillId}/bundle`, { params: mode ? { mode } : undefined })

const validateSkill = (wsId, skillId) => client.post(`${base(wsId)}/${skillId}/validate`)

const getSkillDependencies = (wsId, skillId, nodeId) =>
    client.get(`${base(wsId)}/${skillId}/dependencies`, { params: nodeId ? { nodeId } : undefined })

const getSkillGraph = (wsId, skillId, mode) => client.get(`${base(wsId)}/${skillId}/graph`, { params: mode ? { mode } : undefined })

// -------- node-level --------

const createNode = (wsId, skillId, body) => client.post(`${base(wsId)}/${skillId}/nodes`, body)

const getNode = (wsId, skillId, nodeId) => client.get(`${base(wsId)}/${skillId}/nodes/${nodeId}`)

const updateNode = (wsId, skillId, nodeId, body) => client.put(`${base(wsId)}/${skillId}/nodes/${nodeId}`, body)

const deleteNode = (wsId, skillId, nodeId, recursive) =>
    client.delete(`${base(wsId)}/${skillId}/nodes/${nodeId}`, {
        params: recursive ? { recursive: 'true' } : undefined
    })

const uploadNodeBinary = (wsId, skillId, nodeId, formData) =>
    client.post(`${base(wsId)}/${skillId}/nodes/${nodeId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

// Returns a fully-qualified URL suitable for <img> / <video> / <a href>.
// Uses the axios instance's baseURL + /api/v1 prefix.
//
// NOTE: The download route is protected by the same middleware that gates every
// other `/api/v1/*` endpoint. A plain browser request (e.g. `<img src=...>` or
// `<a href=...>`) won't carry the `x-request-from: internal` header that the
// server uses to pick the cookie/session auth branch, so it ends up on the
// API-key path and returns 401. Prefer `downloadNodeBinary` for inline preview
// + download; this URL helper is kept for callers that already know they're
// hitting a whitelisted or externally-authenticated flow.
const downloadNodeBinaryUrl = (wsId, skillId, nodeId) => `${baseURL}/api/v1${base(wsId)}/${skillId}/nodes/${nodeId}/download`

// Authenticated fetch of the raw bytes for a node. Returns an axios response
// whose `data` is a Blob. Callers can pipe this into `URL.createObjectURL` for
// inline previews or trigger a download link.
const downloadNodeBinary = (wsId, skillId, nodeId) =>
    client.get(`${base(wsId)}/${skillId}/nodes/${nodeId}/download`, { responseType: 'blob' })

const getNodeDependencies = (wsId, skillId, nodeId) => client.get(`${base(wsId)}/${skillId}/nodes/${nodeId}/dependencies`)

export default {
    listSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    publishSkill,
    getBundle,
    validateSkill,
    getSkillDependencies,
    getSkillGraph,
    createNode,
    getNode,
    updateNode,
    deleteNode,
    uploadNodeBinary,
    downloadNodeBinaryUrl,
    downloadNodeBinary,
    getNodeDependencies
}
