import express, { NextFunction, Request, Response } from 'express'
import chatflowsDebugControllers from '../../controllers/chatflows-debug'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
import { RateLimiterManager } from '../../utils/rateLimit'

const router = express.Router()

/**
 * Step Debugger router. Mounted under `/chatflows` from routes/index.ts so the
 * URL contract is `/api/v1/chatflows/:id/debug/...`. Permission gate runs
 * before any handler — the debugger is an edit affordance, so view-only roles
 * cannot reach it.
 */
router.use('/:id/debug', checkAnyPermission('agentflows:update,chatflows:update'))

// Rate-limit only the expensive endpoint. List/get reads are not rate-limited
// so the Inspector can poll freely.
const rateLimitStepRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return RateLimiterManager.getInstance().getRateLimiter()(req, res, next)
    } catch (err) {
        next(err)
    }
}

// Step Run (SSE-or-JSON)
router.post('/:id/debug/nodes/:nodeId/run', rateLimitStepRun, chatflowsDebugControllers.stepRun)

// Debug Variables
router.get('/:id/debug/variables', chatflowsDebugControllers.list)
router.get('/:id/debug/variables/:varId', chatflowsDebugControllers.get)
router.patch('/:id/debug/variables/:varId', chatflowsDebugControllers.update)
router.put('/:id/debug/variables/:varId/reset', chatflowsDebugControllers.reset)
router.delete('/:id/debug/variables/:varId', chatflowsDebugControllers.remove)
router.delete('/:id/debug/variables', chatflowsDebugControllers.wipe)

// Debug Node Executions
router.get('/:id/debug/nodes/:nodeId/last-run', chatflowsDebugControllers.getLastRun)
router.get('/:id/debug/nodes/:nodeId/variables', chatflowsDebugControllers.listForNode)

// Debug Variable Pool snapshots (timeline of post-Step-Run pool states).
// Read-only; snapshots are created server-side by the StepRunner.
router.get('/:id/debug/snapshots', chatflowsDebugControllers.listSnapshots)
router.get('/:id/debug/snapshots/:snapshotId', chatflowsDebugControllers.getSnapshot)

export default router
