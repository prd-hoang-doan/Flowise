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
    Dialog,
    DialogContent,
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
    AppBar,
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
    IconColumns,
    IconTrash,
    IconPencil,
    IconDotsVertical,
    IconDeviceFloppy
} from '@tabler/icons-react'

// API
import skillFilesApi from '@/api/skillfiles'

// Store
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

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
    const [viewMode, setViewMode] = useState('split') // 'edit' | 'preview' | 'split'
    const [dirty, setDirty] = useState(false)
    const [menuAnchor, setMenuAnchor] = useState(null)
    const [menuFileId, setMenuFileId] = useState(null)
    const [renamingFileId, setRenamingFileId] = useState(null)
    const [renameValue, setRenameValue] = useState('')
    const saveTimerRef = useRef(null)
    const [saving, setSaving] = useState(false)

    const editor = useEditor(
        {
            extensions: [
                StarterKit.configure({ codeBlock: false }),
                TiptapMarkdown,
                Placeholder.configure({ placeholder: 'Start writing your skill in Markdown…' }),
                CodeBlockLowlight.configure({ lowlight })
            ],
            content: activeFileContent || '',
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
        <Dialog fullScreen open={show} onClose={handleClose}>
            <AppBar sx={{ position: 'relative', bgcolor: theme.palette.background.default, boxShadow: 1 }}>
                <Toolbar>
                    <Typography sx={{ flex: 1, color: theme.palette.text.primary }} variant='h4' component='div'>
                        {folder?.name || 'Skill Folder'}
                    </Typography>
                    {activeFileId && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
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
                            {!dirty && !saving && activeFileId && (
                                <Typography variant='caption' color='success.main'>
                                    Saved
                                </Typography>
                            )}
                            <Tooltip title='Save (Ctrl+S)'>
                                <span>
                                    <IconButton onClick={manualSave} disabled={!dirty} color='primary'>
                                        <IconDeviceFloppy size={20} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
                    )}
                    <ToggleButtonGroup size='small' value={viewMode} exclusive onChange={(e, v) => v && setViewMode(v)} sx={{ mr: 2 }}>
                        <ToggleButton value='edit' title='Edit'>
                            <IconEdit size={18} />
                        </ToggleButton>
                        <ToggleButton value='split' title='Split'>
                            <IconColumns size={18} />
                        </ToggleButton>
                        <ToggleButton value='preview' title='Preview'>
                            <IconEye size={18} />
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <IconButton edge='end' onClick={handleClose} sx={{ color: theme.palette.text.primary }}>
                        <IconX />
                    </IconButton>
                </Toolbar>
            </AppBar>
            <DialogContent sx={{ p: 0, display: 'flex', height: '100%', overflow: 'hidden' }}>
                {/* Left Panel: File List */}
                <Box
                    sx={{
                        width: 240,
                        minWidth: 240,
                        borderRight: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: theme.palette.background.default
                    }}
                >
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant='subtitle2' color='textSecondary'>
                            Files
                        </Typography>
                        <Tooltip title='New File'>
                            <IconButton size='small' onClick={createNewFile}>
                                <IconPlus size={18} />
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
                                sx={{ py: 0.75 }}
                            >
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                    <IconFile size={16} />
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
                                        autoFocus={true}
                                        fullWidth
                                        sx={{ '& input': { fontSize: '0.85rem', py: 0 } }}
                                    />
                                ) : (
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Typography variant='body2' noWrap sx={{ flex: 1, fontSize: '0.85rem' }}>
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
                                <Typography variant='body2' color='textSecondary'>
                                    No files yet
                                </Typography>
                            </Box>
                        )}
                    </List>
                </Box>

                {/* Right Panel: Editor + Preview */}
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
                            <IconFile size={48} color={theme.palette.text.disabled} />
                            <Typography color='textSecondary'>
                                {files.length === 0 ? 'Create a new file to get started' : 'Select a file from the sidebar'}
                            </Typography>
                            {files.length === 0 && (
                                <Button variant='outlined' startIcon={<IconPlus />} onClick={createNewFile}>
                                    New File
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            {/* Editor Pane */}
                            {(viewMode === 'edit' || viewMode === 'split') && (
                                <StyledEditorWrapper
                                    sx={{
                                        borderRight: viewMode === 'split' ? 1 : 0,
                                        borderColor: 'divider'
                                    }}
                                >
                                    <EditorContent editor={editor} style={{ height: '100%' }} />
                                </StyledEditorWrapper>
                            )}

                            {/* Preview Pane */}
                            {(viewMode === 'preview' || viewMode === 'split') && (
                                <MarkdownPreview>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{getMarkdownForPreview()}</ReactMarkdown>
                                </MarkdownPreview>
                            )}
                        </Box>
                    )}
                </Box>
            </DialogContent>

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
        </Dialog>
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
