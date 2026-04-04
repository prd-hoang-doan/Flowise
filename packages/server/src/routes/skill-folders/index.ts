import express from 'express'
import skillFoldersController from '../../controllers/skill-folders'
import skillFilesController from '../../controllers/skill-files'
import { checkAnyPermission, checkPermission } from '../../enterprise/rbac/PermissionCheck'

const router = express.Router()

// === Skill Folders ===

// CREATE
router.post('/', checkPermission('tools:create'), skillFoldersController.createSkillFolder)

// READ
router.get('/', checkPermission('tools:view'), skillFoldersController.getAllSkillFolders)
router.get('/:id', checkPermission('tools:view'), skillFoldersController.getSkillFolderById)

// UPDATE
router.put('/:id', checkAnyPermission('tools:update,tools:create'), skillFoldersController.updateSkillFolder)

// DELETE
router.delete('/:id', checkPermission('tools:delete'), skillFoldersController.deleteSkillFolder)

// === Skill Files (nested under folders) ===

// CREATE
router.post('/:folderId/files', checkPermission('tools:create'), skillFilesController.createSkillFile)

// READ
router.get('/:folderId/files', checkPermission('tools:view'), skillFilesController.getAllSkillFiles)
router.get('/:folderId/files/:id', checkPermission('tools:view'), skillFilesController.getSkillFileById)

// UPDATE
router.put('/:folderId/files/:id', checkAnyPermission('tools:update,tools:create'), skillFilesController.updateSkillFile)

// DELETE
router.delete('/:folderId/files/:id', checkPermission('tools:delete'), skillFilesController.deleteSkillFile)

export default router
