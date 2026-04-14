import { createPortal } from 'react-dom'
import { cloneDeep } from 'lodash'
import PropTypes from 'prop-types'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
    Toolbar,
    Chip,
    Collapse,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Breadcrumbs
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
    IconFolder,
    IconPhoto,
    IconUpload,
    IconRefresh,
    IconSettings,
    IconCode,
    IconHash,
    IconFileAnalytics,
    IconHierarchy2,
    IconList,
    IconTopologyStarRing3
} from '@tabler/icons-react'

// Project imports
import { Dropdown } from '@/ui-component/dropdown/Dropdown'
import CaptionModelInputHandler from '@/views/tools/CaptionModelInputHandler'
import EmbeddingModelInputHandler from '@/views/tools/EmbeddingModelInputHandler'
import SkillNodeGraph from '@/views/tools/SkillNodeGraph'
import { initNode, showHideInputParams } from '@/utils/genericHelper'
import { baseURL } from '@/store/constant'

// API
import skillFilesApi from '@/api/skillfiles'
import skillAssetsApi from '@/api/skillassets'
import skillFoldersApi from '@/api/skillfolders'

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

    // Local folder state — syncs from prop but can be updated locally from API responses
    const [localFolder, setLocalFolder] = useState(folder)
    useEffect(() => {
        setLocalFolder(folder)
    }, [folder])

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

    // Caption model state
    const [chatModelsComponents, setChatModelsComponents] = useState([])
    const [chatModelsOptions, setChatModelsOptions] = useState([])
    const [selectedCaptionModel, setSelectedCaptionModel] = useState({})
    const [showCaptionSettings, setShowCaptionSettings] = useState(false)
    const [regeneratingAssetId, setRegeneratingAssetId] = useState(null)

    // Embedding model state
    const [embeddingModelsComponents, setEmbeddingModelsComponents] = useState([])
    const [embeddingModelsOptions, setEmbeddingModelsOptions] = useState([])
    const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState({})
    const [showEmbeddingSettings, setShowEmbeddingSettings] = useState(false)

    // Compile preview state
    const [compilePreview, setCompilePreview] = useState(null)
    const [compilePreviewLoading, setCompilePreviewLoading] = useState(false)
    const [compiledPromptExpanded, setCompiledPromptExpanded] = useState(false)

    // Nodes visualization state
    const [skillNodes, setSkillNodes] = useState([])
    const [skillEdges, setSkillEdges] = useState([])
    const [nodesLoading, setNodesLoading] = useState(false)
    const [reExtracting, setReExtracting] = useState(false)
    const [expandedNodeIds, setExpandedNodeIds] = useState(new Set())
    const [nodesDisplayMode, setNodesDisplayMode] = useState('list') // 'list' | 'graph'
    const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)
    const [showSettings, setShowSettings] = useState(false)

    // Tab visibility based on folder mode
    // simple: Source + Preview only
    // advanced: Source + Preview + Assets + Summary
    // dedicated: All tabs
    const visibleTabs = useMemo(() => {
        const mode = localFolder?.mode || 'simple'
        const tabs = ['edit', 'preview']
        if (mode === 'advanced' || mode === 'dedicated') {
            tabs.push('assets', 'summary')
        }
        if (mode === 'dedicated') {
            tabs.push('nodes')
        }
        return tabs
    }, [localFolder?.mode])

    const DEFAULT_SKILL_PLACEHOLDER = `---
name: My Skill
description: A brief description of what this skill does.
---
Start writing your skill in Markdown
`

    const editor = useEditor(
        {
            extensions: [
                StarterKit.configure({ codeBlock: false }),
                TiptapMarkdown,
                Placeholder.configure({ placeholder: DEFAULT_SKILL_PLACEHOLDER }),
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
            if (!activeFileId || !localFolder?.id) return
            const ed = editorInstance || editor
            if (!ed) return
            const markdown = ed.getMarkdown()
            try {
                setSaving(true)
                await skillFilesApi.updateSkillFile(localFolder.id, activeFileId, { content: markdown })
                setDirty(false)
            } catch (err) {
                console.error('Auto-save failed:', err)
            } finally {
                setSaving(false)
            }
        },
        [activeFileId, localFolder?.id, editor]
    )

    const manualSave = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        await autoSave()
    }, [autoSave])

    // Load files when dialog opens
    const loadFiles = useCallback(async () => {
        if (!localFolder?.id) return
        try {
            const resp = await skillFilesApi.getAllSkillFiles(localFolder.id)
            setFiles(resp.data || [])
        } catch (err) {
            console.error('Failed to load files:', err)
        }
    }, [localFolder?.id])

    // Load available chat models for captioning
    const loadChatModels = useCallback(async () => {
        try {
            const resp = await skillAssetsApi.getChatModels()
            if (resp.data) {
                setChatModelsComponents(resp.data)
                const options = resp.data.map((chatModel) => ({
                    label: chatModel.label,
                    name: chatModel.name,
                    imageSrc: `${baseURL}/api/v1/node-icon/${chatModel.name}`
                }))
                setChatModelsOptions(options)
            }
        } catch (err) {
            console.error('Failed to load chat models:', err)
        }
    }, [])

    // Load caption model config from folder
    const loadCaptionModelConfig = useCallback(() => {
        if (!localFolder?.captionModelConfig) {
            setSelectedCaptionModel({})
            return
        }
        try {
            const config = JSON.parse(localFolder.captionModelConfig)
            setSelectedCaptionModel(config || {})
        } catch {
            setSelectedCaptionModel({})
        }
    }, [localFolder?.captionModelConfig])

    // Load available embedding models
    const loadEmbeddingModels = useCallback(async () => {
        try {
            const resp = await skillAssetsApi.getEmbeddingModels()
            if (resp.data) {
                setEmbeddingModelsComponents(resp.data)
                const options = resp.data.map((embModel) => ({
                    label: embModel.label,
                    name: embModel.name,
                    imageSrc: `${baseURL}/api/v1/node-icon/${embModel.name}`
                }))
                setEmbeddingModelsOptions(options)
            }
        } catch (err) {
            console.error('Failed to load embedding models:', err)
        }
    }, [])

    // Load embedding model config from folder
    const loadEmbeddingModelConfig = useCallback(() => {
        if (!localFolder?.embeddingModelConfig) {
            setSelectedEmbeddingModel({})
            return
        }
        try {
            const config = JSON.parse(localFolder.embeddingModelConfig)
            setSelectedEmbeddingModel(config || {})
        } catch {
            setSelectedEmbeddingModel({})
        }
    }, [localFolder?.embeddingModelConfig])

    const loadCompilePreview = useCallback(async () => {
        if (!localFolder?.id || !activeFileId) {
            setCompilePreview(null)
            return
        }
        setCompilePreviewLoading(true)
        try {
            const resp = await skillFilesApi.getCompilePreview(localFolder.id, activeFileId)
            setCompilePreview(resp.data || null)
        } catch (err) {
            console.error('Failed to load compile preview:', err)
            setCompilePreview(null)
        } finally {
            setCompilePreviewLoading(false)
        }
    }, [localFolder?.id, activeFileId])

    useEffect(() => {
        if (activeFileId && viewMode === 'summary') {
            loadCompilePreview()
        }
    }, [activeFileId, viewMode, loadCompilePreview])

    // Reset viewMode if current tab is not visible for the folder mode
    useEffect(() => {
        if (!visibleTabs.includes(viewMode)) {
            setViewMode('edit')
        }
    }, [visibleTabs, viewMode])

    const loadNodes = useCallback(async () => {
        if (!localFolder?.id || !activeFileId) {
            setSkillNodes([])
            setSkillEdges([])
            return
        }
        setNodesLoading(true)
        try {
            const resp = await skillFilesApi.getSkillFileNodes(localFolder.id, activeFileId)
            setSkillNodes(resp.data?.nodes || [])
            setSkillEdges(resp.data?.edges || [])
        } catch (err) {
            console.error('Failed to load nodes:', err)
            setSkillNodes([])
            setSkillEdges([])
        } finally {
            setNodesLoading(false)
        }
    }, [localFolder?.id, activeFileId])

    useEffect(() => {
        if (activeFileId && viewMode === 'nodes') {
            loadNodes()
        }
    }, [activeFileId, viewMode, loadNodes])

    const handleReExtract = async () => {
        if (!localFolder?.id || !activeFileId) return
        setReExtracting(true)
        try {
            const resp = await skillFilesApi.reExtractNodes(localFolder.id, activeFileId)
            setSkillNodes(resp.data?.nodes || [])
            setSkillEdges(resp.data?.edges || [])
            setExpandedNodeIds(new Set())
            enqueueSnackbar({
                message: `Extracted ${resp.data?.nodes?.length || 0} nodes`,
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
                message: 'Failed to re-extract nodes',
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
            setReExtracting(false)
        }
    }

    const toggleNodeExpanded = (nodeId) => {
        setExpandedNodeIds((prev) => {
            const next = new Set(prev)
            if (next.has(nodeId)) next.delete(nodeId)
            else next.add(nodeId)
            return next
        })
    }

    const NODE_TYPE_CONFIG = {
        role: { label: 'Role', color: '#9c27b0' },
        rule: { label: 'Rules', color: '#f44336' },
        behavior: { label: 'Instructions', color: '#2196f3' },
        knowledge: { label: 'Knowledge', color: '#4caf50' },
        asset: { label: 'Assets', color: '#ff9800' }
    }
    const NODE_TYPE_ORDER = ['role', 'rule', 'behavior', 'knowledge', 'asset']

    useEffect(() => {
        if (show && localFolder?.id) {
            loadFiles()
            loadChatModels()
            loadCaptionModelConfig()
            loadEmbeddingModels()
            loadEmbeddingModelConfig()
            setActiveFileId(null)
            setActiveFileContent('')
            setDirty(false)
        }
    }, [show, localFolder?.id, loadFiles, loadChatModels, loadCaptionModelConfig, loadEmbeddingModels, loadEmbeddingModelConfig])

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
                    await skillFilesApi.updateSkillFile(localFolder.id, activeFileId, { content: markdown })
                } catch (err) {
                    console.error('Save before switch failed:', err)
                }
            }
            setDirty(false)
            setShowSettings(false)

            // Load file content
            try {
                const resp = await skillFilesApi.getSkillFile(localFolder.id, fileId)
                const fileData = resp.data
                setActiveFileId(fileData.id)
                setActiveFileContent(fileData.content || '')
            } catch (err) {
                console.error('Failed to load file:', err)
            }
        },
        [dirty, editor, activeFileId, localFolder?.id]
    )

    // Create new file
    const createNewFile = async () => {
        try {
            const resp = await skillFilesApi.createSkillFile(localFolder.id, {
                name: `untitled-${files.length + 1}`,
                content: ''
            })
            if (resp.data) {
                await loadFiles()
                setActiveFileId(resp.data.id)
                setActiveFileContent('')
                setShowSettings(false)
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
            await skillFilesApi.deleteSkillFile(localFolder.id, fileId)
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
            await skillFilesApi.updateSkillFile(localFolder.id, renamingFileId, { name: renameValue.trim() })
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
        if (!localFolder?.id || !activeFileId) {
            setAssets([])
            return
        }
        try {
            const resp = await skillAssetsApi.getAllSkillAssets(localFolder.id, activeFileId)
            setAssets(resp.data || [])
        } catch (err) {
            console.error('Failed to load assets:', err)
            setAssets([])
        }
    }, [localFolder?.id, activeFileId])

    useEffect(() => {
        if (activeFileId && viewMode === 'assets') {
            loadAssets()
        }
    }, [activeFileId, viewMode, loadAssets])

    const handleAssetUpload = async (event) => {
        const uploadedFiles = event.target.files
        if (!uploadedFiles || uploadedFiles.length === 0 || !localFolder?.id || !activeFileId) return

        setUploadingAsset(true)
        try {
            for (const file of uploadedFiles) {
                const formData = new FormData()
                formData.append('files', file)
                await skillAssetsApi.uploadSkillAsset(localFolder.id, activeFileId, formData)
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
            await skillAssetsApi.deleteSkillAsset(localFolder.id, assetId)
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
            await skillAssetsApi.updateSkillAssetCaption(localFolder.id, assetId, caption)
            await loadAssets()
        } catch (err) {
            console.error('Failed to update caption:', err)
        }
    }

    const handleCaptionModelSelect = (newValue) => {
        if (!newValue) {
            setSelectedCaptionModel({})
        } else {
            const foundComponent = chatModelsComponents.find((m) => m.name === newValue)
            if (foundComponent) {
                const modelId = `${foundComponent.name}_caption`
                const clonedComponent = cloneDeep(foundComponent)
                const initModelData = initNode(clonedComponent, modelId)
                setSelectedCaptionModel(initModelData)
            }
        }
    }

    const handleCaptionModelDataChange = ({ inputParam, newValue }) => {
        setSelectedCaptionModel((prevData) => {
            const updatedData = { ...prevData }
            updatedData.inputs[inputParam.name] = newValue
            updatedData.inputParams = showHideInputParams(updatedData)
            return updatedData
        })
    }

    const saveCaptionModelConfig = async () => {
        if (!localFolder?.id) return
        try {
            const configToSave = Object.keys(selectedCaptionModel).length > 0 ? JSON.stringify(selectedCaptionModel) : null
            const resp = await skillFoldersApi.updateSkillFolder(localFolder.id, { captionModelConfig: configToSave })
            if (resp.data) setLocalFolder(resp.data)
            enqueueSnackbar({
                message: 'Caption model saved',
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
                message: 'Failed to save caption model',
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

    const handleEmbeddingModelSelect = (newValue) => {
        if (!newValue) {
            setSelectedEmbeddingModel({})
        } else {
            const foundComponent = embeddingModelsComponents.find((m) => m.name === newValue)
            if (foundComponent) {
                const modelId = `${foundComponent.name}_embedding`
                const clonedComponent = cloneDeep(foundComponent)
                const initModelData = initNode(clonedComponent, modelId)
                setSelectedEmbeddingModel(initModelData)
            }
        }
    }

    const handleEmbeddingModelDataChange = ({ inputParam, newValue }) => {
        setSelectedEmbeddingModel((prevData) => {
            const updatedData = { ...prevData }
            updatedData.inputs[inputParam.name] = newValue
            updatedData.inputParams = showHideInputParams(updatedData)
            return updatedData
        })
    }

    const saveEmbeddingModelConfig = async () => {
        if (!localFolder?.id) return
        try {
            const configToSave = Object.keys(selectedEmbeddingModel).length > 0 ? JSON.stringify(selectedEmbeddingModel) : null
            const resp = await skillFoldersApi.updateSkillFolder(localFolder.id, { embeddingModelConfig: configToSave })
            if (resp.data) setLocalFolder(resp.data)
            enqueueSnackbar({
                message: 'Embedding model saved',
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
                message: 'Failed to save embedding model',
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

    const handleRegenerateCaption = async (assetId) => {
        setRegeneratingAssetId(assetId)
        try {
            await skillAssetsApi.regenerateCaption(localFolder.id, assetId)
            await loadAssets()
            enqueueSnackbar({
                message: 'Caption regenerated successfully',
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
                message:
                    typeof err?.response?.data === 'object'
                        ? err.response.data.message
                        : err?.response?.data || 'Failed to regenerate caption',
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
            setRegeneratingAssetId(null)
        }
    }

    const handleDeleteFolder = async () => {
        if (!localFolder?.id) return
        try {
            await skillFoldersApi.deleteSkillFolder(localFolder.id)
            setDeleteFolderDialogOpen(false)
            enqueueSnackbar({
                message: 'Skill folder deleted',
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
            if (onFolderUpdated) onFolderUpdated()
            onCancel()
        } catch (err) {
            enqueueSnackbar({
                message: 'Failed to delete skill folder',
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

    const handleClose = async () => {
        // Save before closing
        if (dirty && editor && activeFileId) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            const markdown = editor.getMarkdown()
            try {
                await skillFilesApi.updateSkillFile(localFolder.id, activeFileId, { content: markdown })
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
                <Breadcrumbs
                    separator={<IconChevronRight size={14} />}
                    sx={{ flex: 1, minWidth: 0, '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}
                >
                    <Box
                        component='span'
                        onClick={() => {
                            setActiveFileId(null)
                            setActiveFileContent('')
                            setDirty(false)
                            setShowSettings(false)
                        }}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            cursor: 'pointer',
                            color: activeFile || showSettings ? 'text.secondary' : 'text.primary',
                            fontWeight: activeFile || showSettings ? 400 : 500,
                            fontSize: '0.875rem',
                            '&:hover': { color: 'primary.main', textDecoration: 'underline' }
                        }}
                    >
                        <IconFolder size={16} />
                        <Typography variant='body2' noWrap sx={{ fontWeight: 'inherit' }}>
                            {folder?.name || 'Skill Folder'}
                        </Typography>
                    </Box>
                    {showSettings && (
                        <Box
                            component='span'
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'text.primary',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                minWidth: 0
                            }}
                        >
                            <IconSettings size={16} />
                            <Typography variant='body2' noWrap sx={{ fontWeight: 500 }}>
                                Settings
                            </Typography>
                        </Box>
                    )}
                    {activeFile && !showSettings && (
                        <Box
                            component='span'
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'text.primary',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                minWidth: 0
                            }}
                        >
                            <IconFile size={16} />
                            <Typography variant='body2' noWrap sx={{ fontWeight: 500 }}>
                                {activeFile.name}
                            </Typography>
                        </Box>
                    )}
                </Breadcrumbs>
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
                        <Tooltip title='Delete file'>
                            <span>
                                <Button
                                    variant='outlined'
                                    size='small'
                                    color='error'
                                    onClick={() => deleteFile(activeFileId)}
                                    startIcon={<IconTrash size={16} />}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Delete
                                </Button>
                            </span>
                        </Tooltip>
                    </>
                )}
                <Button
                    variant='outlined'
                    size='small'
                    startIcon={<IconSettings size={16} />}
                    onClick={() => {
                        setShowSettings(true)
                        setActiveFileId(null)
                        setActiveFileContent('')
                        setDirty(false)
                    }}
                    sx={{ textTransform: 'none', ml: 0.5 }}
                >
                    Settings
                </Button>
                {!activeFileId && (
                    <Tooltip title='Delete localFolder'>
                        <span>
                            <Button
                                variant='outlined'
                                size='small'
                                color='error'
                                onClick={() => setDeleteFolderDialogOpen(true)}
                                startIcon={<IconTrash size={16} />}
                                sx={{ textTransform: 'none' }}
                            >
                                Delete
                            </Button>
                        </span>
                    </Tooltip>
                )}
                <Button variant='outlined' size='small' onClick={handleClose} sx={{ textTransform: 'none', ml: 0.5 }}>
                    Close
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

                {/* Right Area: Settings, Editor or Preview */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {showSettings ? (
                        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                            <Typography variant='h6' sx={{ fontWeight: 600, mb: 3 }}>
                                Folder Settings
                            </Typography>

                            {/* Mode Selection */}
                            <Box sx={{ mb: 3 }}>
                                <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1 }}>
                                    Folder Mode
                                </Typography>
                                <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                                    Choose how this skill folder operates. Changing the mode will affect which features are available.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                                    {[
                                        {
                                            value: 'simple',
                                            label: 'Simple',
                                            description: 'Write content only — markdown editor and preview'
                                        },
                                        {
                                            value: 'advanced',
                                            label: 'Advanced',
                                            description: 'Add media with AI captioning'
                                        },
                                        {
                                            value: 'dedicated',
                                            label: 'Dedicated',
                                            description: 'Full AI workflow with embeddings and nodes'
                                        }
                                    ].map((opt) => (
                                        <Box
                                            key={opt.value}
                                            onClick={async () => {
                                                if (localFolder?.mode === opt.value) return
                                                try {
                                                    const resp = await skillFoldersApi.updateSkillFolder(localFolder.id, {
                                                        mode: opt.value
                                                    })
                                                    if (resp.data) setLocalFolder(resp.data)
                                                    enqueueSnackbar({
                                                        message: `Mode changed to ${opt.label}`,
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
                                                        message: 'Failed to update mode',
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
                                            }}
                                            sx={{
                                                flex: '1 1 180px',
                                                maxWidth: 240,
                                                border: 2,
                                                borderColor: (localFolder?.mode || 'simple') === opt.value ? 'primary.main' : 'divider',
                                                borderRadius: 2,
                                                p: 2,
                                                cursor: 'pointer',
                                                bgcolor:
                                                    (localFolder?.mode || 'simple') === opt.value
                                                        ? theme.palette.mode === 'dark'
                                                            ? 'rgba(33, 150, 243, 0.08)'
                                                            : 'rgba(33, 150, 243, 0.04)'
                                                        : 'transparent',
                                                '&:hover': {
                                                    borderColor: 'primary.main',
                                                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                                                },
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Typography variant='body2' sx={{ fontWeight: 600 }}>
                                                {opt.label}
                                            </Typography>
                                            <Typography variant='caption' color='text.secondary'>
                                                {opt.description}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            {/* Caption Model Config */}
                            {(localFolder?.mode === 'advanced' || localFolder?.mode === 'dedicated') && (
                                <Box
                                    sx={{
                                        mb: 2,
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 2,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <Box
                                        sx={{
                                            px: 2,
                                            py: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                            '&:hover': {
                                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
                                            }
                                        }}
                                        onClick={() => setShowCaptionSettings(!showCaptionSettings)}
                                    >
                                        <IconSettings size={16} style={{ marginRight: 8 }} />
                                        <Typography variant='body2' sx={{ fontWeight: 500, flex: 1 }}>
                                            Vision Captioning Model
                                        </Typography>
                                        <Typography variant='caption' color='textSecondary'>
                                            {selectedCaptionModel?.name
                                                ? selectedCaptionModel.label || selectedCaptionModel.name
                                                : 'Not configured'}
                                        </Typography>
                                    </Box>
                                    {showCaptionSettings && (
                                        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                                            <div style={{ display: 'flex', flexDirection: 'row' }}>
                                                <Typography variant='body2'>Select Model</Typography>
                                            </div>
                                            <Dropdown
                                                key={JSON.stringify(selectedCaptionModel)}
                                                name='captionModel'
                                                options={chatModelsOptions ?? []}
                                                onSelect={handleCaptionModelSelect}
                                                value={selectedCaptionModel?.name || 'choose an option'}
                                            />

                                            {selectedCaptionModel && Object.keys(selectedCaptionModel).length > 0 && (
                                                <Box
                                                    sx={{
                                                        mt: 1,
                                                        border: 1,
                                                        borderColor: theme.palette.grey[900] + 25,
                                                        borderRadius: 2
                                                    }}
                                                >
                                                    {showHideInputParams(selectedCaptionModel)
                                                        .filter((inputParam) => !inputParam.hidden && inputParam.display !== false)
                                                        .map((inputParam, index) => (
                                                            <CaptionModelInputHandler
                                                                key={index}
                                                                inputParam={inputParam}
                                                                data={selectedCaptionModel}
                                                                onNodeDataChange={handleCaptionModelDataChange}
                                                            />
                                                        ))}
                                                </Box>
                                            )}

                                            <Button
                                                fullWidth
                                                variant='outlined'
                                                size='small'
                                                onClick={saveCaptionModelConfig}
                                                startIcon={<IconDeviceFloppy size={16} />}
                                                sx={{ mt: 1.5, textTransform: 'none', borderRadius: 20 }}
                                            >
                                                Save Caption Model
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {/* Embedding Model Config */}
                            {localFolder?.mode === 'dedicated' && (
                                <Box
                                    sx={{
                                        mb: 2,
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 2,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <Box
                                        sx={{
                                            px: 2,
                                            py: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                            '&:hover': {
                                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
                                            }
                                        }}
                                        onClick={() => setShowEmbeddingSettings(!showEmbeddingSettings)}
                                    >
                                        <IconSettings size={16} style={{ marginRight: 8 }} />
                                        <Typography variant='body2' sx={{ fontWeight: 500, flex: 1 }}>
                                            Embedding Model
                                        </Typography>
                                        <Typography variant='caption' color='textSecondary'>
                                            {selectedEmbeddingModel?.name
                                                ? selectedEmbeddingModel.label || selectedEmbeddingModel.name
                                                : 'Not configured'}
                                        </Typography>
                                    </Box>
                                    {showEmbeddingSettings && (
                                        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                                            <div style={{ display: 'flex', flexDirection: 'row' }}>
                                                <Typography variant='body2'>Select Model</Typography>
                                            </div>
                                            <Dropdown
                                                key={JSON.stringify(selectedEmbeddingModel)}
                                                name='embeddingModel'
                                                options={embeddingModelsOptions ?? []}
                                                onSelect={handleEmbeddingModelSelect}
                                                value={selectedEmbeddingModel?.name || 'choose an option'}
                                            />

                                            {selectedEmbeddingModel && Object.keys(selectedEmbeddingModel).length > 0 && (
                                                <Box
                                                    sx={{
                                                        mt: 1,
                                                        border: 1,
                                                        borderColor: theme.palette.grey[900] + 25,
                                                        borderRadius: 2
                                                    }}
                                                >
                                                    {showHideInputParams(selectedEmbeddingModel)
                                                        .filter((inputParam) => !inputParam.hidden && inputParam.display !== false)
                                                        .map((inputParam, index) => (
                                                            <EmbeddingModelInputHandler
                                                                key={index}
                                                                inputParam={inputParam}
                                                                data={selectedEmbeddingModel}
                                                                onNodeDataChange={handleEmbeddingModelDataChange}
                                                            />
                                                        ))}
                                                </Box>
                                            )}

                                            <Button
                                                fullWidth
                                                variant='outlined'
                                                size='small'
                                                onClick={saveEmbeddingModelConfig}
                                                startIcon={<IconDeviceFloppy size={16} />}
                                                sx={{ mt: 1.5, textTransform: 'none', borderRadius: 20 }}
                                            >
                                                Save Embedding Model
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Box>
                    ) : !activeFileId ? (
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
                            {/* Mode-aware setup guidance */}
                            {localFolder?.mode === 'advanced' && !localFolder?.captionModelConfig && (
                                <Box
                                    sx={{
                                        mt: 2,
                                        p: 2,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'warning.main',
                                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.08)' : 'rgba(255, 152, 0, 0.05)',
                                        maxWidth: 400,
                                        textAlign: 'center'
                                    }}
                                >
                                    <Typography variant='subtitle2' fontWeight={600} sx={{ mb: 0.5 }}>
                                        Set up AI Captioning
                                    </Typography>
                                    <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                                        You chose &quot;Add media with AI&quot;. Configure a caption model to auto-generate descriptions for
                                        uploaded assets.
                                    </Typography>
                                    <Button
                                        variant='outlined'
                                        size='small'
                                        color='warning'
                                        startIcon={<IconSettings size={16} />}
                                        onClick={() => {
                                            setShowSettings(true)
                                            setShowCaptionSettings(true)
                                        }}
                                    >
                                        Configure Caption Model
                                    </Button>
                                </Box>
                            )}
                            {localFolder?.mode === 'dedicated' &&
                                (!localFolder?.captionModelConfig || !localFolder?.embeddingModelConfig) && (
                                    <Box
                                        sx={{
                                            mt: 2,
                                            p: 2,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: 'info.main',
                                            bgcolor:
                                                theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.08)' : 'rgba(33, 150, 243, 0.05)',
                                            maxWidth: 400,
                                            textAlign: 'center'
                                        }}
                                    >
                                        <Typography variant='subtitle2' fontWeight={600} sx={{ mb: 0.5 }}>
                                            Set up AI Models
                                        </Typography>
                                        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                                            You chose &quot;Build full AI workflow&quot;. Configure your models to enable smart retrieval
                                            and AI captioning.
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                                            {!localFolder?.captionModelConfig && (
                                                <Button
                                                    variant='outlined'
                                                    size='small'
                                                    color='info'
                                                    startIcon={<IconSettings size={16} />}
                                                    onClick={() => {
                                                        setShowSettings(true)
                                                        setShowCaptionSettings(true)
                                                    }}
                                                >
                                                    Caption Model
                                                </Button>
                                            )}
                                            {!localFolder?.embeddingModelConfig && (
                                                <Button
                                                    variant='outlined'
                                                    size='small'
                                                    color='info'
                                                    startIcon={<IconSettings size={16} />}
                                                    onClick={() => {
                                                        setShowSettings(true)
                                                        setShowEmbeddingSettings(true)
                                                    }}
                                                >
                                                    Embedding Model
                                                </Button>
                                            )}
                                        </Box>
                                    </Box>
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
                                    {visibleTabs.includes('assets') && (
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
                                    )}
                                    {visibleTabs.includes('summary') && (
                                        <ToggleButton value='summary' sx={{ px: 1.5, py: 0.25, textTransform: 'none', fontSize: '0.8rem' }}>
                                            <IconFileAnalytics size={14} style={{ marginRight: 4 }} />
                                            Summary
                                        </ToggleButton>
                                    )}
                                    {visibleTabs.includes('nodes') && (
                                        <ToggleButton value='nodes' sx={{ px: 1.5, py: 0.25, textTransform: 'none', fontSize: '0.8rem' }}>
                                            <IconHierarchy2 size={14} style={{ marginRight: 4 }} />
                                            Nodes
                                            {skillNodes.length > 0 && (
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
                                                    {skillNodes.length}
                                                </Box>
                                            )}
                                        </ToggleButton>
                                    )}
                                </ToggleButtonGroup>
                            </Box>

                            {/* Single pane: editor, preview, summary, or assets */}
                            {viewMode === 'edit' ? (
                                <StyledEditorWrapper>
                                    <EditorContent editor={editor} style={{ height: '100%' }} />
                                </StyledEditorWrapper>
                            ) : viewMode === 'preview' ? (
                                <MarkdownPreview>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{getMarkdownForPreview()}</ReactMarkdown>
                                </MarkdownPreview>
                            ) : viewMode === 'summary' ? (
                                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                                    {compilePreviewLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                                            <CircularProgress size={28} />
                                            <Typography variant='body2' color='textSecondary' sx={{ ml: 1.5 }}>
                                                Compiling...
                                            </Typography>
                                        </Box>
                                    ) : !compilePreview ? (
                                        <Box sx={{ textAlign: 'center', py: 6 }}>
                                            <IconFileAnalytics size={40} color={theme.palette.text.disabled} />
                                            <Typography variant='body2' color='textSecondary' sx={{ mt: 1 }}>
                                                No compile preview available
                                            </Typography>
                                            <Button
                                                variant='outlined'
                                                size='small'
                                                startIcon={<IconRefresh size={16} />}
                                                onClick={loadCompilePreview}
                                                sx={{ mt: 1.5, textTransform: 'none' }}
                                            >
                                                Compile Now
                                            </Button>
                                        </Box>
                                    ) : (
                                        <>
                                            {/* Header + Refresh */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <Typography variant='subtitle2' sx={{ flex: 1, fontWeight: 600 }}>
                                                    Compiled Skill Summary
                                                </Typography>
                                                <Tooltip title='Re-compile'>
                                                    <IconButton size='small' onClick={loadCompilePreview}>
                                                        <IconRefresh size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>

                                            {/* Metadata cards */}
                                            <Box
                                                sx={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                                    gap: 1.5,
                                                    mb: 2
                                                }}
                                            >
                                                {/* Skill Name */}
                                                <Box
                                                    sx={{
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1.5,
                                                        p: 1.5,
                                                        bgcolor:
                                                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 500 }}>
                                                        Skill Name
                                                    </Typography>
                                                    <Typography variant='body2' sx={{ fontWeight: 600, mt: 0.25, wordBreak: 'break-all' }}>
                                                        {compilePreview.metadata?.skillName || '—'}
                                                    </Typography>
                                                </Box>
                                                {/* Execution Mode */}
                                                <Box
                                                    sx={{
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1.5,
                                                        p: 1.5,
                                                        bgcolor:
                                                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 500 }}>
                                                        Execution Mode
                                                    </Typography>
                                                    <Typography
                                                        variant='body2'
                                                        sx={{ fontWeight: 600, mt: 0.25, textTransform: 'capitalize' }}
                                                    >
                                                        {compilePreview.metadata?.executionMode || 'summary'}
                                                    </Typography>
                                                </Box>
                                                {/* Token Estimate */}
                                                <Box
                                                    sx={{
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1.5,
                                                        p: 1.5,
                                                        bgcolor:
                                                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 500 }}>
                                                        Token Estimate
                                                    </Typography>
                                                    <Typography variant='body2' sx={{ fontWeight: 600, mt: 0.25 }}>
                                                        ~{compilePreview.tokenEstimate?.toLocaleString() || 0}
                                                    </Typography>
                                                </Box>
                                                {/* File Count */}
                                                <Box
                                                    sx={{
                                                        border: 1,
                                                        borderColor: 'divider',
                                                        borderRadius: 1.5,
                                                        p: 1.5,
                                                        bgcolor:
                                                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    <Typography variant='caption' color='textSecondary' sx={{ fontWeight: 500 }}>
                                                        Total Files
                                                    </Typography>
                                                    <Typography variant='body2' sx={{ fontWeight: 600, mt: 0.25 }}>
                                                        {compilePreview.metadata?.fileCount || 0}
                                                    </Typography>
                                                </Box>
                                            </Box>

                                            {/* Sections present */}
                                            {compilePreview.metadata?.sections?.length > 0 && (
                                                <Box sx={{ mb: 2 }}>
                                                    <Typography
                                                        variant='caption'
                                                        color='textSecondary'
                                                        sx={{ fontWeight: 500, display: 'block', mb: 0.75 }}
                                                    >
                                                        Compiled Sections
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                                        {compilePreview.metadata.sections.map((section) => (
                                                            <Chip
                                                                key={section}
                                                                label={section}
                                                                size='small'
                                                                variant='outlined'
                                                                sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}

                                            {/* Asset breakdown */}
                                            {compilePreview.metadata?.assetSummary?.length > 0 && (
                                                <Box sx={{ mb: 2 }}>
                                                    <Typography
                                                        variant='caption'
                                                        color='textSecondary'
                                                        sx={{ fontWeight: 500, display: 'block', mb: 0.75 }}
                                                    >
                                                        Asset Breakdown
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                                        {compilePreview.metadata.assetSummary.map((item) => (
                                                            <Chip
                                                                key={item.category}
                                                                label={`${item.category}: ${item.count}`}
                                                                size='small'
                                                                color='primary'
                                                                variant='outlined'
                                                                sx={{ fontSize: '0.75rem' }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}

                                            {/* Compile hash */}
                                            {compilePreview.hash && (
                                                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                    <IconHash size={14} color={theme.palette.text.secondary} />
                                                    <Typography variant='caption' color='textSecondary' sx={{ fontFamily: 'monospace' }}>
                                                        {compilePreview.hash}
                                                    </Typography>
                                                </Box>
                                            )}

                                            {/* Compiled prompt preview */}
                                            <Box
                                                sx={{
                                                    border: 1,
                                                    borderColor: 'divider',
                                                    borderRadius: 1.5,
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        px: 2,
                                                        py: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        cursor: 'pointer',
                                                        bgcolor:
                                                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                                        '&:hover': {
                                                            bgcolor:
                                                                theme.palette.mode === 'dark'
                                                                    ? 'rgba(255,255,255,0.05)'
                                                                    : 'rgba(0,0,0,0.04)'
                                                        }
                                                    }}
                                                    onClick={() => setCompiledPromptExpanded(!compiledPromptExpanded)}
                                                >
                                                    <IconCode size={16} style={{ marginRight: 8 }} />
                                                    <Typography variant='body2' sx={{ fontWeight: 500, flex: 1 }}>
                                                        Compiled Prompt
                                                    </Typography>
                                                    <Typography variant='caption' color='textSecondary'>
                                                        {compiledPromptExpanded ? 'Collapse' : 'Expand'}
                                                    </Typography>
                                                </Box>
                                                <Collapse in={compiledPromptExpanded}>
                                                    <Box
                                                        sx={{
                                                            p: 2,
                                                            borderTop: 1,
                                                            borderColor: 'divider',
                                                            bgcolor: theme.palette.mode === 'dark' ? '#1a1a1a' : '#fafafa',
                                                            maxHeight: 400,
                                                            overflow: 'auto'
                                                        }}
                                                    >
                                                        <Typography
                                                            variant='body2'
                                                            component='pre'
                                                            sx={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.8rem',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-word',
                                                                m: 0
                                                            }}
                                                        >
                                                            {compilePreview.compiledPrompt || '(empty)'}
                                                        </Typography>
                                                    </Box>
                                                </Collapse>
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            ) : viewMode === 'nodes' ? (
                                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                                    {nodesLoading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
                                            <CircularProgress size={28} />
                                            <Typography variant='body2' color='textSecondary' sx={{ ml: 1.5 }}>
                                                Loading nodes...
                                            </Typography>
                                        </Box>
                                    ) : skillNodes.length === 0 ? (
                                        <Box sx={{ textAlign: 'center', py: 6 }}>
                                            <IconHierarchy2 size={40} color={theme.palette.text.disabled} />
                                            <Typography variant='body2' color='textSecondary' sx={{ mt: 1 }}>
                                                No nodes extracted yet
                                            </Typography>
                                            <Typography variant='caption' color='textSecondary' sx={{ display: 'block', mt: 0.5 }}>
                                                Save the skill file with content to trigger node extraction
                                            </Typography>
                                            <Button
                                                variant='outlined'
                                                size='small'
                                                startIcon={<IconRefresh size={16} />}
                                                onClick={handleReExtract}
                                                disabled={reExtracting}
                                                sx={{ mt: 1.5, textTransform: 'none' }}
                                            >
                                                {reExtracting ? 'Extracting...' : 'Extract Now'}
                                            </Button>
                                        </Box>
                                    ) : (
                                        <>
                                            {/* Summary stats bar */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
                                                <Typography variant='subtitle2' sx={{ fontWeight: 600, mr: 1 }}>
                                                    Extracted Nodes
                                                </Typography>
                                                {NODE_TYPE_ORDER.map((type) => {
                                                    const count = skillNodes.filter((n) => n.type === type).length
                                                    if (count === 0) return null
                                                    const cfg = NODE_TYPE_CONFIG[type]
                                                    return (
                                                        <Chip
                                                            key={type}
                                                            label={`${cfg.label}: ${count}`}
                                                            size='small'
                                                            sx={{
                                                                fontSize: '0.7rem',
                                                                bgcolor: cfg.color + '18',
                                                                color: cfg.color,
                                                                border: `1px solid ${cfg.color}40`,
                                                                fontWeight: 600
                                                            }}
                                                        />
                                                    )
                                                })}
                                                {skillEdges.length > 0 && (
                                                    <Chip
                                                        label={`${skillEdges.length} edge${skillEdges.length !== 1 ? 's' : ''}`}
                                                        size='small'
                                                        variant='outlined'
                                                        sx={{ fontSize: '0.7rem' }}
                                                    />
                                                )}
                                                <Box sx={{ flex: 1 }} />
                                                <ToggleButtonGroup
                                                    size='small'
                                                    value={nodesDisplayMode}
                                                    exclusive
                                                    onChange={(e, v) => v && setNodesDisplayMode(v)}
                                                    sx={{ mr: 1 }}
                                                >
                                                    <ToggleButton value='list' sx={{ px: 0.75, py: 0.25 }}>
                                                        <Tooltip title='List view'>
                                                            <IconList size={14} />
                                                        </Tooltip>
                                                    </ToggleButton>
                                                    <ToggleButton value='graph' sx={{ px: 0.75, py: 0.25 }}>
                                                        <Tooltip title='Graph view'>
                                                            <IconTopologyStarRing3 size={14} />
                                                        </Tooltip>
                                                    </ToggleButton>
                                                </ToggleButtonGroup>
                                                <Tooltip title='Re-extract nodes from content'>
                                                    <span>
                                                        <Button
                                                            variant='outlined'
                                                            size='small'
                                                            startIcon={
                                                                <IconRefresh
                                                                    size={14}
                                                                    style={{ animation: reExtracting ? 'spin 1s linear infinite' : 'none' }}
                                                                />
                                                            }
                                                            onClick={handleReExtract}
                                                            disabled={reExtracting}
                                                            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                                                        >
                                                            Re-extract
                                                        </Button>
                                                    </span>
                                                </Tooltip>
                                            </Box>

                                            {nodesDisplayMode === 'graph' ? (
                                                <Box sx={{ flex: 1, minHeight: 400, height: 'calc(100vh - 280px)' }}>
                                                    <SkillNodeGraph nodes={skillNodes} edges={skillEdges} />
                                                </Box>
                                            ) : (
                                                <>
                                                    {/* Grouped node sections */}
                                                    {NODE_TYPE_ORDER.map((type) => {
                                                        const typeNodes = skillNodes.filter((n) => n.type === type)
                                                        if (typeNodes.length === 0) return null
                                                        const cfg = NODE_TYPE_CONFIG[type]
                                                        return (
                                                            <Box key={type} sx={{ mb: 2.5 }}>
                                                                <Box
                                                                    sx={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        mb: 1,
                                                                        gap: 1
                                                                    }}
                                                                >
                                                                    <Box
                                                                        sx={{
                                                                            width: 10,
                                                                            height: 10,
                                                                            borderRadius: '50%',
                                                                            bgcolor: cfg.color,
                                                                            flexShrink: 0
                                                                        }}
                                                                    />
                                                                    <Typography
                                                                        variant='caption'
                                                                        sx={{
                                                                            fontWeight: 700,
                                                                            textTransform: 'uppercase',
                                                                            letterSpacing: 0.5,
                                                                            color: cfg.color
                                                                        }}
                                                                    >
                                                                        {cfg.label} ({typeNodes.length})
                                                                    </Typography>
                                                                    <Divider sx={{ flex: 1 }} />
                                                                </Box>

                                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                                    {typeNodes.map((node) => {
                                                                        const nodeEdges = skillEdges.filter(
                                                                            (e) => e.fromNodeId === node.id || e.toNodeId === node.id
                                                                        )
                                                                        const isExpanded = expandedNodeIds.has(node.id)
                                                                        const isLong = node.content && node.content.length > 120
                                                                        let triggers = []
                                                                        try {
                                                                            triggers = node.triggers ? JSON.parse(node.triggers) : []
                                                                        } catch {
                                                                            triggers = []
                                                                        }

                                                                        return (
                                                                            <Box
                                                                                key={node.id}
                                                                                sx={{
                                                                                    border: 1,
                                                                                    borderColor: 'divider',
                                                                                    borderRadius: 1.5,
                                                                                    p: 1.5,
                                                                                    bgcolor:
                                                                                        theme.palette.mode === 'dark'
                                                                                            ? 'rgba(255,255,255,0.02)'
                                                                                            : 'rgba(0,0,0,0.01)',
                                                                                    borderLeft: `3px solid ${cfg.color}`,
                                                                                    '&:hover': {
                                                                                        bgcolor:
                                                                                            theme.palette.mode === 'dark'
                                                                                                ? 'rgba(255,255,255,0.04)'
                                                                                                : 'rgba(0,0,0,0.03)'
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {/* Header row */}
                                                                                <Box
                                                                                    sx={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: 0.75,
                                                                                        mb: 0.5
                                                                                    }}
                                                                                >
                                                                                    <Chip
                                                                                        label={node.type}
                                                                                        size='small'
                                                                                        sx={{
                                                                                            height: 18,
                                                                                            fontSize: '0.65rem',
                                                                                            fontWeight: 600,
                                                                                            bgcolor: cfg.color,
                                                                                            color: '#fff',
                                                                                            textTransform: 'uppercase'
                                                                                        }}
                                                                                    />
                                                                                    <Typography
                                                                                        variant='caption'
                                                                                        sx={{
                                                                                            fontFamily: 'monospace',
                                                                                            opacity: 0.6
                                                                                        }}
                                                                                    >
                                                                                        P:{node.priority}
                                                                                    </Typography>
                                                                                    {node.cluster && (
                                                                                        <Chip
                                                                                            label={node.cluster}
                                                                                            size='small'
                                                                                            variant='outlined'
                                                                                            sx={{
                                                                                                height: 18,
                                                                                                fontSize: '0.6rem',
                                                                                                opacity: 0.7
                                                                                            }}
                                                                                        />
                                                                                    )}
                                                                                    <Typography
                                                                                        variant='caption'
                                                                                        noWrap
                                                                                        sx={{
                                                                                            fontWeight: 500,
                                                                                            flex: 1,
                                                                                            fontSize: '0.75rem'
                                                                                        }}
                                                                                    >
                                                                                        {node.title}
                                                                                    </Typography>
                                                                                    <Typography
                                                                                        variant='caption'
                                                                                        sx={{
                                                                                            fontFamily: 'monospace',
                                                                                            fontSize: '0.6rem',
                                                                                            opacity: 0.4
                                                                                        }}
                                                                                    >
                                                                                        #{node.orderIndex}
                                                                                    </Typography>
                                                                                </Box>

                                                                                {/* Content */}
                                                                                <Typography
                                                                                    variant='body2'
                                                                                    sx={{
                                                                                        fontSize: '0.8rem',
                                                                                        lineHeight: 1.5,
                                                                                        whiteSpace: 'pre-wrap',
                                                                                        wordBreak: 'break-word',
                                                                                        ...(isLong && !isExpanded
                                                                                            ? {
                                                                                                  display: '-webkit-box',
                                                                                                  WebkitLineClamp: 2,
                                                                                                  WebkitBoxOrient: 'vertical',
                                                                                                  overflow: 'hidden'
                                                                                              }
                                                                                            : {})
                                                                                    }}
                                                                                >
                                                                                    {node.content}
                                                                                </Typography>
                                                                                {isLong && (
                                                                                    <Typography
                                                                                        variant='caption'
                                                                                        sx={{
                                                                                            color: 'primary.main',
                                                                                            cursor: 'pointer',
                                                                                            '&:hover': { textDecoration: 'underline' }
                                                                                        }}
                                                                                        onClick={() => toggleNodeExpanded(node.id)}
                                                                                    >
                                                                                        {isExpanded ? 'Show less' : 'Show more'}
                                                                                    </Typography>
                                                                                )}

                                                                                {/* Triggers */}
                                                                                {triggers.length > 0 && (
                                                                                    <Box
                                                                                        sx={{
                                                                                            display: 'flex',
                                                                                            flexWrap: 'wrap',
                                                                                            gap: 0.5,
                                                                                            mt: 0.75
                                                                                        }}
                                                                                    >
                                                                                        {triggers.slice(0, 8).map((t, i) => (
                                                                                            <Chip
                                                                                                key={i}
                                                                                                label={t}
                                                                                                size='small'
                                                                                                variant='outlined'
                                                                                                sx={{
                                                                                                    height: 18,
                                                                                                    fontSize: '0.6rem',
                                                                                                    opacity: 0.7
                                                                                                }}
                                                                                            />
                                                                                        ))}
                                                                                        {triggers.length > 8 && (
                                                                                            <Typography
                                                                                                variant='caption'
                                                                                                color='textSecondary'
                                                                                                sx={{ fontSize: '0.6rem' }}
                                                                                            >
                                                                                                +{triggers.length - 8} more
                                                                                            </Typography>
                                                                                        )}
                                                                                    </Box>
                                                                                )}

                                                                                {/* Edges */}
                                                                                {nodeEdges.length > 0 && (
                                                                                    <Box sx={{ mt: 0.75 }}>
                                                                                        {nodeEdges.map((edge) => {
                                                                                            const isFrom = edge.fromNodeId === node.id
                                                                                            const targetId = isFrom
                                                                                                ? edge.toNodeId
                                                                                                : edge.fromNodeId
                                                                                            const targetNode = skillNodes.find(
                                                                                                (n) => n.id === targetId
                                                                                            )
                                                                                            return (
                                                                                                <Typography
                                                                                                    key={edge.id}
                                                                                                    variant='caption'
                                                                                                    sx={{
                                                                                                        display: 'block',
                                                                                                        fontSize: '0.65rem',
                                                                                                        opacity: 0.6,
                                                                                                        fontFamily: 'monospace'
                                                                                                    }}
                                                                                                >
                                                                                                    {isFrom ? '\u2192' : '\u2190'}{' '}
                                                                                                    {edge.relation}{' '}
                                                                                                    {targetNode
                                                                                                        ? targetNode.title
                                                                                                        : targetId.slice(0, 8)}
                                                                                                </Typography>
                                                                                            )
                                                                                        })}
                                                                                    </Box>
                                                                                )}
                                                                            </Box>
                                                                        )
                                                                    })}
                                                                </Box>
                                                            </Box>
                                                        )
                                                    })}
                                                </>
                                            )}
                                        </>
                                    )}
                                </Box>
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
                                                            src={skillAssetsApi.getSkillAssetUrl(localFolder.id, asset.id)}
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
                                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5, gap: 0.5 }}>
                                                            <Tooltip title='Regenerate caption with vision model'>
                                                                <span>
                                                                    <IconButton
                                                                        size='small'
                                                                        onClick={() => handleRegenerateCaption(asset.id)}
                                                                        disabled={regeneratingAssetId === asset.id}
                                                                        sx={{ color: 'primary.main' }}
                                                                    >
                                                                        <IconRefresh
                                                                            size={14}
                                                                            style={{
                                                                                animation:
                                                                                    regeneratingAssetId === asset.id
                                                                                        ? 'spin 1s linear infinite'
                                                                                        : 'none'
                                                                            }}
                                                                        />
                                                                    </IconButton>
                                                                </span>
                                                            </Tooltip>
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

            {/* Delete Folder Confirmation Dialog */}
            <Dialog open={deleteFolderDialogOpen} onClose={() => setDeleteFolderDialogOpen(false)}>
                <DialogTitle>Delete Skill Folder</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {`Are you sure you want to delete "${localFolder?.name}"? This will permanently delete the localFolder and all its files and assets. This cannot be undone.`}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteFolderDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDeleteFolder} color='error' variant='contained'>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
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
