import express from 'express'
import skillsV2Controller from '../../controllers/skills-v2'
import { checkAnyPermission, checkPermission } from '../../enterprise/rbac/PermissionCheck'
import { getMulterStorage } from '../../utils'

const router = express.Router()

// Piggy-back on the existing `tools:*` permissions — v2 is a new incarnation of Skills
// and Flowise's RBAC bucket for skills today lives under `tools:*`. When v1 is retired
// this can move to a dedicated `skills:*` bucket.

// ================= skill-level =================

router.post('/workspaces/:wsId/skills', checkPermission('tools:create'), skillsV2Controller.createSkill)
router.get('/workspaces/:wsId/skills', checkPermission('tools:view'), skillsV2Controller.listSkills)

router.get('/workspaces/:wsId/skills/:skillId', checkPermission('tools:view'), skillsV2Controller.getSkill)
router.put('/workspaces/:wsId/skills/:skillId', checkAnyPermission('tools:update,tools:create'), skillsV2Controller.updateSkill)
router.delete('/workspaces/:wsId/skills/:skillId', checkPermission('tools:delete'), skillsV2Controller.deleteSkill)

router.post('/workspaces/:wsId/skills/:skillId/publish', checkAnyPermission('tools:update,tools:create'), skillsV2Controller.publish)
router.get('/workspaces/:wsId/skills/:skillId/bundle', checkPermission('tools:view'), skillsV2Controller.getBundle)
router.post('/workspaces/:wsId/skills/:skillId/validate', checkPermission('tools:view'), skillsV2Controller.validate)
router.get('/workspaces/:wsId/skills/:skillId/dependencies', checkPermission('tools:view'), skillsV2Controller.dependencies)
router.get('/workspaces/:wsId/skills/:skillId/graph', checkPermission('tools:view'), skillsV2Controller.graph)

// ================= node-level =================

router.post('/workspaces/:wsId/skills/:skillId/nodes', checkAnyPermission('tools:update,tools:create'), skillsV2Controller.createNode)
router.get('/workspaces/:wsId/skills/:skillId/nodes/:nodeId', checkPermission('tools:view'), skillsV2Controller.getNode)
router.put(
    '/workspaces/:wsId/skills/:skillId/nodes/:nodeId',
    checkAnyPermission('tools:update,tools:create'),
    skillsV2Controller.updateNode
)
router.delete('/workspaces/:wsId/skills/:skillId/nodes/:nodeId', checkPermission('tools:delete'), skillsV2Controller.deleteNode)
router.post(
    '/workspaces/:wsId/skills/:skillId/nodes/:nodeId/upload',
    checkAnyPermission('tools:update,tools:create'),
    getMulterStorage().array('files'),
    skillsV2Controller.uploadBinary
)
router.get('/workspaces/:wsId/skills/:skillId/nodes/:nodeId/download', checkPermission('tools:view'), skillsV2Controller.downloadBinary)
router.get(
    '/workspaces/:wsId/skills/:skillId/nodes/:nodeId/dependencies',
    checkPermission('tools:view'),
    skillsV2Controller.nodeDependencies
)

export default router
