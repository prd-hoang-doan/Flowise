import express from 'express'
import skillFoldersController from '../../controllers/skill-folders'
import skillFilesController from '../../controllers/skill-files'
import skillAssetsController from '../../controllers/skill-assets'
import { checkAnyPermission, checkPermission } from '../../enterprise/rbac/PermissionCheck'
import { getMulterStorage } from '../../utils'

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

// COMPILE PREVIEW
router.get('/:folderId/files/:id/compile-preview', checkPermission('tools:view'), skillFilesController.compilePreview)

// UPDATE
router.put('/:folderId/files/:id', checkAnyPermission('tools:update,tools:create'), skillFilesController.updateSkillFile)

// DELETE
router.delete('/:folderId/files/:id', checkPermission('tools:delete'), skillFilesController.deleteSkillFile)

// === Skill Assets (nested under folders/files) ===

// UPLOAD
router.post(
    '/:folderId/files/:fileId/assets',
    checkPermission('tools:create'),
    getMulterStorage().array('files'),
    skillAssetsController.uploadSkillAsset
)

// READ
router.get('/:folderId/files/:fileId/assets', checkPermission('tools:view'), skillAssetsController.getAllSkillAssets)
router.get('/:folderId/assets/:assetId', checkPermission('tools:view'), skillAssetsController.getSkillAsset)

// UPDATE (caption only)
router.put('/:folderId/assets/:assetId', checkAnyPermission('tools:update,tools:create'), skillAssetsController.updateSkillAssetCaption)

// REGENERATE CAPTION (vision LLM)
router.post(
    '/:folderId/assets/:assetId/regenerate-caption',
    checkAnyPermission('tools:update,tools:create'),
    skillAssetsController.regenerateCaption
)

// DELETE
router.delete('/:folderId/assets/:assetId', checkPermission('tools:delete'), skillAssetsController.deleteSkillAsset)

export default router
