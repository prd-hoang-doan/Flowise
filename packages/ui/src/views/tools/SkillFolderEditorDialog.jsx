import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as TiptapMarkdown } from '@tiptap/markdown'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
    Box,
    Button,
    Typography,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Divider,
    ToggleButtonGroup,
    ToggleButton,
    TextField,
    Menu,
    MenuItem,
    Tooltip,
    Toolbar
} from '@mui/material'
import { useTheme, styled } from '@mui/material/styles'

// Icons
import {
    IconX,
    IconPlus,
    IconFile,
    IconEdit,
    IconEye,
    IconTrash,
    IconPencil,
    IconDotsVertical,
    IconDeviceFloppy,
    IconChevronRight,
    IconPhoto,
    IconUpload
} from '@tabler/icons-react'

// API
import skillFilesApi from '@/api/skillfiles'
import skillAssetsApi from '@/api/skillassets'

// Store
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

const DRAWER_WIDTH = '50vw'

const lowlight = createLowlight(common)

const StyledEditorWrapper = styled(Box)(({ theme }) => ({
    flex: 1,
    overflow: 'auto',
    '& .ProseMirror': {
        padding: '16px 24px',
        minHeight: '100%',
        outline: 'none',
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        fontSize: '0.95rem',
        lineHeight: 1.7,
        color: theme.palette.text.primary,
        '& p.is-editor-empty:first-of-type::before': {
            content: 'attr(data-placeholder)',
            float: 'left',
            color: theme.palette.text.secondary,
            opacity: 0.5,
            pointerEvents: 'none',
            height: 0
        },
        '& h1': { fontSize: '2rem', fontWeight: 600, margin: '1rem 0 0.5rem' },
        '& h2': { fontSize: '1.5rem', fontWeight: 600, margin: '1rem 0 0.5rem' },
        '& h3': { fontSize: '1.25rem', fontWeight: 600, margin: '0.75rem 0 0.5rem' },
        '& pre': {
            background: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            margin: '0.5rem 0',
            overflow: 'auto',
            '& code': {
                background: 'none',
                color: 'inherit',
                fontSize: '0.85rem',
                padding: 0
            }
        },
        '& code': {
            background: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f0f0f0',
            borderRadius: '3px',
            padding: '0.15rem 0.3rem',
            fontSize: '0.85rem'
        },
        '& blockquote': {
            borderLeft: `3px solid ${theme.palette.divider}`,
            margin: '0.5rem 0',
            paddingLeft: '1rem',
            color: theme.palette.text.secondary
        },
        '& ul, & ol': { paddingLeft: '1.5rem' },
        '& li': { marginBottom: '0.25rem' }
    }
}))

const MarkdownPreview = styled(Box)(({ theme }) => ({
    flex: 1,
    overflow: 'auto',
    padding: '16px 24px',
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: '0.95rem',
    lineHeight: 1.7,
    color: theme.palette.text.primary,
    '& h1': { fontSize: '2rem', fontWeight: 600, margin: '1rem 0 0.5rem' },
    '& h2': { fontSize: '1.5rem', fontWeight: 600, margin: '1rem 0 0.5rem' },
    '& h3': { fontSize: '1.25rem', fontWeight: 600, margin: '0.75rem 0 0.5rem' },
    '& pre': {
        background: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        margin: '0.5rem 0',
        overflow: 'auto',
        '& code': { background: 'none', fontSize: '0.85rem' }
    },
    '& code': {
        background: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f0f0f0',
        borderRadius: '3px',
        padding: '0.15rem 0.3rem',
        fontSize: '0.85rem'
    },
    '& blockquote': {
        borderLeft: `3px solid ${theme.palette.divider}`,
        margin: '0.5rem 0',
        paddingLeft: '1rem',
        color: theme.palette.text.secondary
    },
    '& ul, & ol': { paddingLeft: '1.5rem' },
    '& li': { marginBottom: '0.25rem' },
    '& table': {
        borderCollapse: 'collapse',
        width: '100%',
        margin: '0.5rem 0',
        '& th, & td': { border: `1px solid ${theme.palette.divider}`, padding: '0.5rem' },
        '& th': { background: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5', fontWeight: 600 }
    }
}))

const SkillFolderEditorDialog = ({ show, folder, onCancel, onFolderUpdated }) => {
    const portalElement = document.getElementById('portal')
    const theme = useTheme()
    const dispatch = useDispatch()
    const customization = useSelector((state) => state.customization)

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [files, setFiles] = useState([])
    const [activeFileId, setActiveFileId] = useState(null)
    const [activeFileContent, setActiveFileContent] = useState('')
    const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
    const [dirty, setDirty] = useState(false)
    const [menuAnchor, setMenuAnchor] = useState(null)
    const [menuFileId, setMenuFileId] = useState(null)
    const [renamingFileId, setRenamingFileId] = useState(null)
    const [renameValue, setRenameValue] = useState('')
    const saveTimerRef = useRef(null)
    const [saving, setSaving] = useState(false)
    const [assets, setAssets] = useState([])
    const [uploadingAsset, setUploadingAsset] = useState(false)
    const fileInputRef = useRef(null)

    const editor = useEditor(
        {
            extensions: [
                StarterKit.configure({ codeBlock: false }),
                TiptapMarkdown,
                Placeholder.configure({ placeholder: 'Start writing your skill in Markdown…' }),
                CodeBlockLowlight.configure({ lowlight })
            ],
            content: activeFileContent || '',
            contentType: 'markdown',
            editable: true,
            onUpdate: ({ editor }) => {
                setDirty(true)
                // Debounced auto-save
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
                saveTimerRef.current = setTimeout(() => {
                    autoSave(editor)
                }, 1500)
            }
        },
        [activeFileId]
    )

    const autoSave = useCallback(
        async (editorInstance) => {
            if (!activeFileId || !folder?.id) return
            const ed = editorInstance || editor
            if (!ed) return
            const markdown = ed.getMarkdown()
            try {
                setSaving(true)
                await skillFilesApi.updateSkillFile(folder.id, activeFileId, { content: markdown })
                setDirty(false)
            } catch (err) {
                console.error('Auto-save failed:', err)
            } finally {
                setSaving(false)
            }
        },
        [activeFileId, folder?.id, editor]
    )

    const manualSave = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        await autoSave()
    }, [autoSave])

    // Load files when dialog opens
    const loadFiles = useCallback(async () => {
        if (!folder?.id) return
        try {
            const resp = await skillFilesApi.getAllSkillFiles(folder.id)
            setFiles(resp.data || [])
        } catch (err) {
            console.error('Failed to load files:', err)
        }
    }, [folder?.id])

    useEffect(() => {
        if (show && folder?.id) {
            loadFiles()
            setActiveFileId(null)
            setActiveFileContent('')
            setDirty(false)
        }
    }, [show, folder?.id, loadFiles])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    // Select a file
    const selectFile = useCallback(
        async (fileId) => {
            // Save current before switching
            if (dirty && editor && activeFileId) {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
                const markdown = editor.getMarkdown()
                try {
                    await skillFilesApi.updateSkillFile(folder.id, activeFileId, { content: markdown })
                } catch (err) {
                    console.error('Save before switch failed:', err)
                }
            }
            setDirty(false)

            // Load file content
            try {
                const resp = await skillFilesApi.getSkillFile(folder.id, fileId)
                const fileData = resp.data
                setActiveFileId(fileData.id)
                setActiveFileContent(fileData.content || '')
            } catch (err) {
                console.error('Failed to load file:', err)
            }
        },
        [dirty, editor, activeFileId, folder?.id]
    )

    // Create new file
    const createNewFile = async () => {
        try {
            const resp = await skillFilesApi.createSkillFile(folder.id, {
                name: `untitled-${files.length + 1}`,
                content: ''
            })
            if (resp.data) {
                await loadFiles()
                setActiveFileId(resp.data.id)
                setActiveFileContent('')
            }
        } catch (err) {
            enqueueSnackbar({
                message: 'Failed to create file',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    // Delete file
    const deleteFile = async (fileId) => {
        try {
            await skillFilesApi.deleteSkillFile(folder.id, fileId)
            if (activeFileId === fileId) {
                setActiveFileId(null)
                setActiveFileContent('')
                setDirty(false)
            }
            await loadFiles()
            setMenuAnchor(null)
            setMenuFileId(null)
        } catch (err) {
            enqueueSnackbar({
                message: 'Failed to delete file',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    // Rename file
    const startRename = (fileId, currentName) => {
        setMenuAnchor(null)
        setMenuFileId(null)
        // Delay until after Menu close animation restores focus, otherwise the
        // focus-restoration blur immediately dismisses the TextField
        setTimeout(() => {
            setRenamingFileId(fileId)
            setRenameValue(currentName)
        }, 50)
    }

    const commitRename = async () => {
        if (!renamingFileId || !renameValue.trim()) {
            setRenamingFileId(null)
            return
        }
        try {
            await skillFilesApi.updateSkillFile(folder.id, renamingFileId, { name: renameValue.trim() })
            await loadFiles()
        } catch (err) {
            console.error('Rename failed:', err)
        }
        setRenamingFileId(null)
    }

    const getMarkdownForPreview = () => {
        if (!editor) return ''
        try {
            return editor.getMarkdown() || ''
        } catch {
            return ''
        }
    }

    // === Asset Management ===
    const loadAssets = useCallback(async () => {
        if (!folder?.id || !activeFileId) {
            setAssets([])
            return
        }
        try {
            const resp = await skillAssetsApi.getAllSkillAssets(folder.id, activeFileId)
            setAssets(resp.data || [])
        } catch (err) {
            console.error('Failed to load assets:', err)
            setAssets([])
        }
    }, [folder?.id, activeFileId])

    useEffect(() => {
        if (activeFileId && viewMode === 'assets') {
            loadAssets()
        }
    }, [activeFileId, viewMode, loadAssets])

    const handleAssetUpload = async (event) => {
        const uploadedFiles = event.target.files
        if (!uploadedFiles || uploadedFiles.length === 0 || !folder?.id || !activeFileId) return

        setUploadingAsset(true)
        try {
            for (const file of uploadedFiles) {
                const formData = new FormData()
                formData.append('files', file)
                await skillAssetsApi.uploadSkillAsset(folder.id, activeFileId, formData)
            }
            await loadAssets()
            enqueueSnackbar({
                message: 'Asset uploaded successfully',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'success',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        } catch (err) {
            enqueueSnackbar({
                message: 'Failed to upload asset',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        } finally {
            setUploadingAsset(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleDeleteAsset = async (assetId) => {
        try {
            await skillAssetsApi.deleteSkillAsset(folder.id, assetId)
            await loadAssets()
        } catch (err) {
            enqueueSnackbar({
                message: 'Failed to delete asset',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const handleCaptionUpdate = async (assetId, caption) => {
        try {
            await skillAssetsApi.updateSkillAssetCaption(folder.id, assetId, caption)
            await loadAssets()
        } catch (err) {
            console.error('Failed to update caption:', err)
        }
    }

    const handleClose = async () => {
        // Save before closing
        if (dirty && editor && activeFileId) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            const markdown = editor.getMarkdown()
            try {
                await skillFilesApi.updateSkillFile(folder.id, activeFileId, { content: markdown })
            } catch (err) {
                console.error('Save before close failed:', err)
            }
        }
        if (onFolderUpdated) onFolderUpdated()
        onCancel()
    }

    const activeFile = files.find((f) => f.id === activeFileId)

    const component = show ? (
        <Drawer
            anchor='right'
            variant='persistent'
            open={show}
            sx={{
                '& .MuiDrawer-paper': {
                    width: DRAWER_WIDTH,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            {/* Top Toolbar */}
            <Toolbar
                variant='dense'
                sx={{
                    bgcolor: theme.palette.background.default,
                    borderBottom: 1,
                    borderColor: 'divider',
                    minHeight: 48,
                    px: 1.5,
                    gap: 1
                }}
            >
                <Tooltip title='Close'>
                    <IconButton size='small' onClick={handleClose}>
                        <IconChevronRight size={20} />
                    </IconButton>
                </Tooltip>
                <Divider orientation='vertical' flexItem sx={{ mx: 0.5 }} />
                {activeFile ? (
                    <>
                        <IconFile size={16} />
                        <Typography variant='body2' noWrap sx={{ flex: 1, fontWeight: 500 }}>
                            {activeFile.name}
                        </Typography>
                    </>
                ) : (
                    <Typography variant='body2' noWrap sx={{ flex: 1, color: 'text.secondary' }}>
                        {folder?.name || 'Skill Folder'}
                    </Typography>
                )}
                {activeFileId && (
                    <>
                        {saving && (
                            <Typography variant='caption' color='textSecondary'>
                                Saving…
                            </Typography>
                        )}
                        {dirty && !saving && (
                            <Typography variant='caption' color='warning.main'>
                                Unsaved
                            </Typography>
                        )}
                        {!dirty && !saving && (
                            <Typography variant='caption' color='success.main'>
                                Saved
                            </Typography>
                        )}
                        <Tooltip title='Delete file'>
                            <IconButton size='small' onClick={() => deleteFile(activeFileId)} sx={{ color: 'error.main' }}>
                                <IconTrash size={18} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title='Save Changes'>
                            <span>
                                <Button
                                    variant='outlined'
                                    size='small'
                                    onClick={manualSave}
                                    disabled={!dirty}
                                    startIcon={<IconDeviceFloppy size={16} />}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Save
                                </Button>
                            </span>
                        </Tooltip>
                    </>
                )}
                <Button variant='text' size='small' onClick={handleClose} sx={{ textTransform: 'none', ml: 0.5 }}>
                    Done
                </Button>
            </Toolbar>

            {/* Body: File Sidebar + Editor Area */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Sidebar: File List */}
                <Box
                    sx={{
                        width: 200,
                        minWidth: 200,
                        borderRight: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: theme.palette.background.default
                    }}
                >
                    <Box sx={{ p: 1, px: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography
                            variant='caption'
                            fontWeight={600}
                            color='textSecondary'
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                        >
                            Files
                        </Typography>
                        <Tooltip title='New File'>
                            <IconButton size='small' onClick={createNewFile}>
                                <IconPlus size={16} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Divider />
                    <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                        {files.map((file) => (
                            <ListItemButton
                                key={file.id}
                                selected={file.id === activeFileId}
                                onClick={() => selectFile(file.id)}
                                sx={{ py: 0.5 }}
                            >
                                <ListItemIcon sx={{ minWidth: 24 }}>
                                    <IconFile size={14} />
                                </ListItemIcon>
                                {renamingFileId === file.id ? (
                                    <TextField
                                        size='small'
                                        variant='standard'
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => setRenamingFileId(null)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                commitRename()
                                            }
                                            if (e.key === 'Escape') setRenamingFileId(null)
                                        }}
                                        // eslint-disable-next-line jsx-a11y/no-autofocus
                                        autoFocus
                                        fullWidth
                                        sx={{ '& input': { fontSize: '0.8rem', py: 0 } }}
                                    />
                                ) : (
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant='body2' noWrap sx={{ flex: 1, fontSize: '0.8rem' }}>
                                                    {file.name}
                                                </Typography>
                                                {file.id === activeFileId && dirty && (
                                                    <Box
                                                        sx={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: '50%',
                                                            bgcolor: 'warning.main',
                                                            ml: 0.5,
                                                            flexShrink: 0
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                    />
                                )}
                                {file.id !== renamingFileId && (
                                    <IconButton
                                        size='small'
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setMenuAnchor(e.currentTarget)
                                            setMenuFileId(file.id)
                                        }}
                                        sx={{ ml: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}
                                    >
                                        <IconDotsVertical size={14} />
                                    </IconButton>
                                )}
                            </ListItemButton>
                        ))}
                        {files.length === 0 && (
                            <Box sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant='body2' color='textSecondary' sx={{ fontSize: '0.8rem' }}>
                                    No files yet
                                </Typography>
                            </Box>
                        )}
                    </List>
                </Box>

                {/* Right Area: Editor or Preview */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {!activeFileId ? (
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                gap: 2
                            }}
                        >
                            <IconFile size={40} color={theme.palette.text.disabled} />
                            <Typography variant='body2' color='textSecondary'>
                                {files.length === 0 ? 'Create a file to get started' : 'Select a file'}
                            </Typography>
                            {files.length === 0 && (
                                <Button variant='outlined' size='small' startIcon={<IconPlus size={16} />} onClick={createNewFile}>
                                    New File
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <>
                            {/* View mode toggle */}
                            <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
                                <ToggleButtonGroup size='small' value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)}>
                                    <ToggleButton value='edit' sx={{ px: 1.5, py: 0.25, textTransform: 'none', fontSize: '0.8rem' }}>
                                        <IconEdit size={14} style={{ marginRight: 4 }} />
                                        Source
                                    </ToggleButton>
                                    <ToggleButton value='preview' sx={{ px: 1.5, py: 0.25, textTransform: 'none', fontSize: '0.8rem' }}>
                                        <IconEye size={14} style={{ marginRight: 4 }} />
                                        Preview
                                    </ToggleButton>
                                    <ToggleButton value='assets' sx={{ px: 1.5, py: 0.25, textTransform: 'none', fontSize: '0.8rem' }}>
                                        <IconPhoto size={14} style={{ marginRight: 4 }} />
                                        Assets
                                        {assets.length > 0 && (
                                            <Box
                                                component='span'
                                                sx={{
                                                    ml: 0.5,
                                                    px: 0.5,
                                                    py: 0,
                                                    fontSize: '0.7rem',
                                                    borderRadius: '8px',
                                                    bgcolor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    lineHeight: 1.5
                                                }}
                                            >
                                                {assets.length}
                                            </Box>
                                        )}
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Box>

                            {/* Single pane: editor, preview, or assets */}
                            {viewMode === 'edit' ? (
                                <StyledEditorWrapper>
                                    <EditorContent editor={editor} style={{ height: '100%' }} />
                                </StyledEditorWrapper>
                            ) : viewMode === 'preview' ? (
                                <MarkdownPreview>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{getMarkdownForPreview()}</ReactMarkdown>
                                </MarkdownPreview>
                            ) : (
                                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                                    {/* Upload area */}
                                    <Box
                                        sx={{
                                            border: '2px dashed',
                                            borderColor: 'divider',
                                            borderRadius: 2,
                                            p: 3,
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            mb: 2,
                                            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }
                                        }}
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            const dt = e.dataTransfer
                                            if (dt.files?.length) {
                                                handleAssetUpload({ target: { files: dt.files } })
                                            }
                                        }}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type='file'
                                            accept='image/png,image/jpeg,image/gif,image/webp'
                                            multiple
                                            style={{ display: 'none' }}
                                            onChange={handleAssetUpload}
                                        />
                                        <IconUpload size={32} color={theme.palette.text.secondary} />
                                        <Typography variant='body2' color='textSecondary' sx={{ mt: 1 }}>
                                            {uploadingAsset ? 'Uploading…' : 'Drop images here or click to upload'}
                                        </Typography>
                                        <Typography variant='caption' color='textSecondary'>
                                            PNG, JPEG, GIF, WebP
                                        </Typography>
                                    </Box>

                                    {/* Asset grid */}
                                    {assets.length === 0 ? (
                                        <Box sx={{ textAlign: 'center', py: 4 }}>
                                            <Typography variant='body2' color='textSecondary'>
                                                No assets yet. Upload images to enrich this skill.
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 }}>
                                            {assets.map((asset) => (
                                                <Box
                                                    key={asset.id}
                                                    sx={{
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1,
                                                        overflow: 'hidden',
                                                        bgcolor: theme.palette.background.default
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            height: 120,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            bgcolor: theme.palette.mode === 'dark' ? '#1a1a1a' : '#fafafa',
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        <Box
                                                            component='img'
                                                            src={skillAssetsApi.getSkillAssetUrl(folder.id, asset.id)}
                                                            alt={asset.filename}
                                                            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                                        />
                                                    </Box>
                                                    <Box sx={{ p: 1 }}>
                                                        <Typography variant='caption' noWrap sx={{ fontWeight: 500 }}>
                                                            {asset.filename}
                                                        </Typography>
                                                        <TextField
                                                            size='small'
                                                            variant='standard'
                                                            fullWidth
                                                            placeholder='Caption…'
                                                            defaultValue={asset.caption || ''}
                                                            onBlur={(e) => {
                                                                if (e.target.value !== (asset.caption || '')) {
                                                                    handleCaptionUpdate(asset.id, e.target.value)
                                                                }
                                                            }}
                                                            sx={{ mt: 0.5, '& input': { fontSize: '0.75rem' } }}
                                                        />
                                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                                                            <Tooltip title='Delete asset'>
                                                                <IconButton
                                                                    size='small'
                                                                    onClick={() => handleDeleteAsset(asset.id)}
                                                                    sx={{ color: 'error.main' }}
                                                                >
                                                                    <IconTrash size={14} />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </>
                    )}
                </Box>
            </Box>

            {/* Context menu for file actions */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => {
                    setMenuAnchor(null)
                    setMenuFileId(null)
                }}
            >
                <MenuItem
                    onClick={() => {
                        const file = files.find((f) => f.id === menuFileId)
                        if (file) startRename(file.id, file.name)
                    }}
                >
                    <IconPencil size={16} style={{ marginRight: 8 }} />
                    Rename
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        if (menuFileId) deleteFile(menuFileId)
                    }}
                    sx={{ color: 'error.main' }}
                >
                    <IconTrash size={16} style={{ marginRight: 8 }} />
                    Delete
                </MenuItem>
            </Menu>
        </Drawer>
    ) : null

    return createPortal(component, portalElement)
}

SkillFolderEditorDialog.propTypes = {
    show: PropTypes.bool,
    folder: PropTypes.object,
    onCancel: PropTypes.func,
    onFolderUpdated: PropTypes.func
}

export default SkillFolderEditorDialog
