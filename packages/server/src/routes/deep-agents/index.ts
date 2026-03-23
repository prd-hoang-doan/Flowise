import express from 'express'
import deepAgentsController from '../../controllers/deep-agents'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
const router = express.Router()

// ==============================|| SESSIONS ||============================== //

// CREATE
router.post('/sessions', checkAnyPermission('deepAgents:view'), deepAgentsController.createSession)

// READ
router.get('/sessions', checkAnyPermission('deepAgents:view'), deepAgentsController.getAllSessions)
router.get('/sessions/:id', checkAnyPermission('deepAgents:view'), deepAgentsController.getSessionById)

// DELETE
router.delete('/sessions/:id', checkAnyPermission('deepAgents:view'), deepAgentsController.deleteSession)

// CANCEL
router.post('/sessions/:id/cancel', checkAnyPermission('deepAgents:view'), deepAgentsController.cancelSession)

// ==============================|| MESSAGES ||============================== //

// SEND MESSAGE (triggers agent execution)
router.post('/sessions/:id/messages', checkAnyPermission('deepAgents:view'), deepAgentsController.sendMessage)

// GET MESSAGES
router.get('/sessions/:id/messages', checkAnyPermission('deepAgents:view'), deepAgentsController.getMessages)

// ==============================|| STEPS ||============================== //

// GET STEPS
router.get('/sessions/:id/steps', checkAnyPermission('deepAgents:view'), deepAgentsController.getSteps)

// ==============================|| ARTIFACTS ||============================== //

// GET ARTIFACTS
router.get('/sessions/:id/artifacts', checkAnyPermission('deepAgents:view'), deepAgentsController.getArtifacts)

// EXPORT ARTIFACT
router.get('/sessions/:id/artifacts/export', checkAnyPermission('deepAgents:view'), deepAgentsController.exportArtifact)

// ==============================|| STREAMING ||============================== //

// SSE STREAM
router.get('/sessions/:id/stream', checkAnyPermission('deepAgents:view'), deepAgentsController.streamSession)

export default router
