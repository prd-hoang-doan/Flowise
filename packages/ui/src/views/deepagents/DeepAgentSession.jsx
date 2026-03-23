import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// material-ui
import {
    Box,
    Stack,
    TextField,
    IconButton,
    Typography,
    Chip,
    Divider,
    Paper,
    useTheme,
    CircularProgress,
    Tooltip,
    Select,
    MenuItem,
    Menu,
    ListItemIcon,
    ListItemText
} from '@mui/material'

// project imports
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import { MemoizedReactMarkdown } from '@/ui-component/markdown/MemoizedReactMarkdown'

// API
import useApi from '@/hooks/useApi'
import deepagentsApi from '@/api/deepagents'
import { baseURL } from '@/store/constant'

// icons
import {
    IconSend,
    IconDownload,
    IconCopy,
    IconPlayerStop,
    IconCheck,
    IconX,
    IconClock,
    IconLoader,
    IconGripVertical,
    IconFileText,
    IconMarkdown,
    IconCode
} from '@tabler/icons-react'

// ==============================|| DEEP AGENT SESSION - SPLIT PANEL ||============================== //

const stepStatusIcons = {
    PENDING: <IconClock size={16} />,
    RUNNING: <IconLoader size={16} />,
    COMPLETED: <IconCheck size={16} />,
    FAILED: <IconX size={16} />,
    SKIPPED: <IconX size={16} />
}

const stepStatusColors = {
    PENDING: 'default',
    RUNNING: 'primary',
    COMPLETED: 'success',
    FAILED: 'error',
    SKIPPED: 'warning'
}

const DeepAgentSession = () => {
    const theme = useTheme()
    const navigate = useNavigate()
    const { id: sessionId } = useParams()

    const getSessionApi = useApi(deepagentsApi.getSessionById)
    const sendMessageApi = useApi(deepagentsApi.sendMessage)
    const getArtifactsApi = useApi(deepagentsApi.getArtifacts)

    const [session, setSession] = useState(null)
    const [messages, setMessages] = useState([])
    const [steps, setSteps] = useState([])
    const [artifacts, setArtifacts] = useState([])
    const [inputValue, setInputValue] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [artifactContent, setArtifactContent] = useState('')
    const [artifactStatus, setArtifactStatus] = useState('')
    const [selectedVersion, setSelectedVersion] = useState(null)
    const [splitRatio, setSplitRatio] = useState(50)
    const [copied, setCopied] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [exportAnchor, setExportAnchor] = useState(null)

    const messagesEndRef = useRef(null)
    const abortControllerRef = useRef(null)
    const containerRef = useRef(null)

    // ==============================|| DATA LOADING ||============================== //

    useEffect(() => {
        if (sessionId) {
            getSessionApi.request(sessionId)
        }
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    useEffect(() => {
        if (getSessionApi.data) {
            setSession(getSessionApi.data)
            setMessages(getSessionApi.data.messages || [])
            setSteps(getSessionApi.data.steps || [])
            setArtifacts(getSessionApi.data.artifacts || [])
            setIsRunning(getSessionApi.data.status === 'RUNNING')

            // Set artifact content from latest artifact
            if (getSessionApi.data.artifacts?.length > 0) {
                const latest = getSessionApi.data.artifacts[0] // sorted by version DESC
                setArtifactContent(latest.content)
                setArtifactStatus(latest.status)
                setSelectedVersion(latest.version)
            }

            // Connect SSE if session is running
            if (getSessionApi.data.status === 'RUNNING') {
                connectSSE()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getSessionApi.data])

    useEffect(() => {
        if (sendMessageApi.data) {
            setIsRunning(true)
            connectSSE()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendMessageApi.data])

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // ==============================|| SSE CONNECTION ||============================== //

    const connectSSE = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        const controller = new AbortController()
        abortControllerRef.current = controller

        const url = `${baseURL}/api/v1/deep-agents/sessions/${sessionId}/stream`

        fetch(url, {
            headers: {
                'x-request-from': 'internal',
                Accept: 'text/event-stream'
            },
            credentials: 'include',
            signal: controller.signal
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`SSE connection failed: ${response.status}`)
                }
                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''

                const pump = () =>
                    reader.read().then(({ done, value }) => {
                        if (done || controller.signal.aborted) return

                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n')
                        buffer = lines.pop() // keep incomplete last line

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const parsed = JSON.parse(line.slice(6))
                                    handleSSEEvent(parsed)
                                } catch {
                                    // Ignore parse errors
                                }
                            }
                        }
                        return pump()
                    })

                return pump()
            })
            .catch((err) => {
                if (err.name === 'AbortError') return // intentional close
                // Auto-reconnect on unexpected errors
                setTimeout(() => {
                    if (abortControllerRef.current === controller) {
                        abortControllerRef.current = null
                        if (isRunning) {
                            connectSSE()
                        }
                    }
                }, 2000)
            })
    }

    const handleSSEEvent = (event) => {
        switch (event.event) {
            case 'message':
                setMessages((prev) => [
                    ...prev,
                    { id: Date.now().toString(), role: event.data.role, content: event.data.content, createdDate: new Date().toISOString() }
                ])
                break
            case 'step_update':
                if (event.data.stepId) {
                    setSteps((prev) => {
                        const existing = prev.find((s) => s.id === event.data.stepId)
                        if (existing) {
                            return prev.map((s) => (s.id === event.data.stepId ? { ...s, ...event.data } : s))
                        }
                        return [
                            ...prev,
                            {
                                id: event.data.stepId,
                                stepIndex: event.data.stepIndex,
                                description: event.data.description,
                                status: event.data.status,
                                toolName: event.data.toolName
                            }
                        ]
                    })
                }
                break
            case 'artifact_patch':
                if (event.data.content) {
                    setArtifactContent(event.data.content)
                }
                if (event.data.status) {
                    setArtifactStatus(event.data.status)
                }
                break
            case 'status':
                if (event.data.status === 'COMPLETED' || event.data.status === 'FAILED' || event.data.status === 'CANCELLED') {
                    setIsRunning(false)
                    // Refresh full session data to get persisted artifacts
                    getSessionApi.request(sessionId)
                }
                break
            case 'end':
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort()
                    abortControllerRef.current = null
                }
                break
            default:
                break
        }
    }

    // ==============================|| RESIZABLE SPLIT PANE (FR-5) ||============================== //

    const handleMouseDown = useCallback((e) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    useEffect(() => {
        if (!isDragging) return

        const handleMouseMove = (e) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const newRatio = ((e.clientX - rect.left) / rect.width) * 100
            setSplitRatio(Math.max(25, Math.min(75, newRatio)))
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    // ==============================|| ACTIONS ||============================== //

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const handleSendMessage = () => {
        if (!inputValue.trim() || isRunning) return

        setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: 'user', content: inputValue, createdDate: new Date().toISOString() }
        ])
        sendMessageApi.request(sessionId, { content: inputValue })
        setInputValue('')
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const handleCancel = async () => {
        try {
            await deepagentsApi.cancelSession(sessionId)
            setIsRunning(false)
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
                eventSourceRef.current = null
            }
        } catch {
            // Ignore
        }
    }

    const handleExport = async (format = 'md') => {
        setExportAnchor(null)
        try {
            const response = await deepagentsApi.exportArtifact(sessionId, format)
            const blob = new Blob([response.data])
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${(session?.title || 'artifact').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${format}`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            // Ignore
        }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(artifactContent)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleVersionChange = (e) => {
        const version = e.target.value
        setSelectedVersion(version)
        const artifact = artifacts.find((a) => a.version === version)
        if (artifact) {
            setArtifactContent(artifact.content)
            setArtifactStatus(artifact.status)
        }
    }

    // ==============================|| RENDER ||============================== //

    if (!session && getSessionApi.loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
            </Box>
        )
    }

    return (
        <>
            <ViewHeader title={session?.title || 'Deep Agent Session'} isBackButton onBack={() => navigate('/deep-agents')} />

            <Box
                ref={containerRef}
                sx={{
                    display: 'flex',
                    height: 'calc(100vh - 140px)',
                    mt: 2,
                    gap: 0,
                    userSelect: isDragging ? 'none' : 'auto'
                }}
            >
                {/* ======== LEFT PANEL - CHAT ======== */}
                <Paper
                    elevation={0}
                    sx={{
                        width: `${splitRatio}%`,
                        display: 'flex',
                        flexDirection: 'column',
                        border: `1px solid ${theme.palette.grey[900] + 25}`,
                        borderRadius: 2,
                        overflow: 'hidden'
                    }}
                >
                    {/* Steps Progress */}
                    {steps.length > 0 && (
                        <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.grey[900] + 25}`, maxHeight: 200, overflowY: 'auto' }}>
                            <Typography variant='caption' color='textSecondary' fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                                EXECUTION STEPS
                            </Typography>
                            <Stack spacing={0.5}>
                                {steps.map((step) => (
                                    <Stack key={step.id} direction='row' alignItems='center' spacing={1}>
                                        <Chip
                                            icon={stepStatusIcons[step.status]}
                                            label={
                                                <Box component='span'>
                                                    {step.toolName && (
                                                        <Box
                                                            component='span'
                                                            sx={{ fontWeight: 600, mr: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}
                                                        >
                                                            [{step.toolName}]
                                                        </Box>
                                                    )}
                                                    {step.description}
                                                </Box>
                                            }
                                            size='small'
                                            color={stepStatusColors[step.status] || 'default'}
                                            variant='outlined'
                                            sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                                        />
                                    </Stack>
                                ))}
                            </Stack>
                        </Box>
                    )}

                    {/* Messages */}
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                        {messages.length === 0 ? (
                            <Box sx={{ textAlign: 'center', mt: 8 }}>
                                <Typography variant='body1' color='textSecondary'>
                                    Send a message to start your deep research session.
                                </Typography>
                                <Typography variant='body2' color='textSecondary' sx={{ mt: 1 }}>
                                    Try: &quot;Research AI regulation in Japan&quot;
                                </Typography>
                            </Box>
                        ) : (
                            messages
                                .filter((msg) => msg.role !== 'tool')
                                .map((msg) => (
                                    <Box
                                        key={msg.id}
                                        sx={{
                                            mb: 2,
                                            display: 'flex',
                                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                maxWidth: '80%',
                                                p: 1.5,
                                                borderRadius: 2,
                                                backgroundColor: msg.role === 'user' ? theme.palette.primary.main : theme.palette.grey[100],
                                                color: msg.role === 'user' ? '#fff' : theme.palette.text.primary
                                            }}
                                        >
                                            {msg.role === 'user' ? (
                                                <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
                                                    {msg.content}
                                                </Typography>
                                            ) : (
                                                <Box sx={{ '& p': { m: 0 }, '& p:first-of-type': { mt: 0 } }}>
                                                    <MemoizedReactMarkdown>{msg.content}</MemoizedReactMarkdown>
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                ))
                        )}
                        {isRunning && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
                                <CircularProgress size={16} />
                                <Typography variant='body2' color='textSecondary'>
                                    Researching...
                                </Typography>
                            </Box>
                        )}
                        <div ref={messagesEndRef} />
                    </Box>

                    {/* Input */}
                    <Divider />
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            fullWidth
                            size='small'
                            placeholder='Ask a research question...'
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isRunning}
                            multiline
                            maxRows={3}
                        />
                        {isRunning ? (
                            <Tooltip title='Cancel execution'>
                                <IconButton color='error' onClick={handleCancel}>
                                    <IconPlayerStop size={20} />
                                </IconButton>
                            </Tooltip>
                        ) : (
                            <Tooltip title='Send message'>
                                <IconButton color='primary' onClick={handleSendMessage} disabled={!inputValue.trim()}>
                                    <IconSend size={20} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Paper>

                {/* ======== DRAG HANDLE ======== */}
                <Box
                    onMouseDown={handleMouseDown}
                    sx={{
                        width: 8,
                        cursor: 'col-resize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        '&:hover': { backgroundColor: theme.palette.primary.light + '30' },
                        backgroundColor: isDragging ? theme.palette.primary.light + '50' : 'transparent',
                        transition: 'background-color 0.2s',
                        borderRadius: 1
                    }}
                >
                    <IconGripVertical size={14} color={theme.palette.grey[400]} />
                </Box>

                {/* ======== RIGHT PANEL - ARTIFACT ======== */}
                <Paper
                    elevation={0}
                    sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        border: `1px solid ${theme.palette.grey[900] + 25}`,
                        borderRadius: 2,
                        overflow: 'hidden'
                    }}
                >
                    {/* Artifact Toolbar */}
                    <Box
                        sx={{
                            p: 1,
                            borderBottom: `1px solid ${theme.palette.grey[900] + 25}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}
                    >
                        <Stack direction='row' alignItems='center' spacing={1}>
                            <Typography variant='subtitle2'>Artifact</Typography>
                            {artifactStatus && (
                                <Chip
                                    label={artifactStatus}
                                    size='small'
                                    color={
                                        artifactStatus === 'COMPLETED' ? 'success' : artifactStatus === 'DRAFTING' ? 'warning' : 'primary'
                                    }
                                    variant='outlined'
                                />
                            )}
                            {/* Version Selector (FR-7) */}
                            {artifacts.length > 1 && (
                                <Select
                                    size='small'
                                    value={selectedVersion || ''}
                                    onChange={handleVersionChange}
                                    sx={{ minWidth: 80, height: 28, fontSize: '0.75rem' }}
                                >
                                    {artifacts.map((a) => (
                                        <MenuItem key={a.version} value={a.version} sx={{ fontSize: '0.75rem' }}>
                                            v{a.version}
                                        </MenuItem>
                                    ))}
                                </Select>
                            )}
                        </Stack>
                        <Stack direction='row' spacing={0.5}>
                            <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                                <IconButton size='small' onClick={handleCopy} disabled={!artifactContent}>
                                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                </IconButton>
                            </Tooltip>
                            {/* FR-8: Multi-format export */}
                            <Tooltip title='Download'>
                                <IconButton size='small' onClick={(e) => setExportAnchor(e.currentTarget)} disabled={!artifactContent}>
                                    <IconDownload size={16} />
                                </IconButton>
                            </Tooltip>
                            <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
                                <MenuItem onClick={() => handleExport('md')}>
                                    <ListItemIcon>
                                        <IconMarkdown size={16} />
                                    </ListItemIcon>
                                    <ListItemText>Markdown (.md)</ListItemText>
                                </MenuItem>
                                <MenuItem onClick={() => handleExport('txt')}>
                                    <ListItemIcon>
                                        <IconFileText size={16} />
                                    </ListItemIcon>
                                    <ListItemText>Plain Text (.txt)</ListItemText>
                                </MenuItem>
                                <MenuItem onClick={() => handleExport('html')}>
                                    <ListItemIcon>
                                        <IconCode size={16} />
                                    </ListItemIcon>
                                    <ListItemText>HTML (.html)</ListItemText>
                                </MenuItem>
                            </Menu>
                        </Stack>
                    </Box>

                    {/* Artifact Content */}
                    <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                        {!artifactContent ? (
                            <Box sx={{ textAlign: 'center', mt: 8 }}>
                                <Typography variant='body1' color='textSecondary'>
                                    Artifact will appear here after the agent completes research.
                                </Typography>
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    '& h1': { fontSize: '1.5rem', fontWeight: 700, mb: 1, mt: 2 },
                                    '& h2': { fontSize: '1.25rem', fontWeight: 600, mb: 1, mt: 2 },
                                    '& h3': { fontSize: '1.1rem', fontWeight: 600, mb: 0.5, mt: 1.5 },
                                    '& p': { mb: 1, lineHeight: 1.7 },
                                    '& ul, & ol': { pl: 3, mb: 1 },
                                    '& li': { mb: 0.5 },
                                    '& hr': { my: 2, border: 'none', borderTop: `1px solid ${theme.palette.divider}` },
                                    '& blockquote': {
                                        borderLeft: `3px solid ${theme.palette.primary.main}`,
                                        pl: 2,
                                        ml: 0,
                                        color: theme.palette.text.secondary,
                                        fontStyle: 'italic'
                                    },
                                    '& table': {
                                        borderCollapse: 'collapse',
                                        width: '100%',
                                        mb: 2,
                                        '& th, & td': {
                                            border: `1px solid ${theme.palette.divider}`,
                                            p: 1,
                                            textAlign: 'left',
                                            fontSize: '0.875rem'
                                        },
                                        '& th': { fontWeight: 600, backgroundColor: theme.palette.grey[50] }
                                    },
                                    '& code': {
                                        backgroundColor: theme.palette.grey[100],
                                        px: 0.5,
                                        borderRadius: 0.5,
                                        fontFamily: 'monospace',
                                        fontSize: '0.85em'
                                    },
                                    '& pre': {
                                        backgroundColor: theme.palette.grey[900],
                                        color: '#fff',
                                        p: 2,
                                        borderRadius: 1,
                                        overflow: 'auto',
                                        mb: 2,
                                        '& code': {
                                            backgroundColor: 'transparent',
                                            color: 'inherit',
                                            p: 0
                                        }
                                    }
                                }}
                            >
                                <MemoizedReactMarkdown>{artifactContent}</MemoizedReactMarkdown>
                            </Box>
                        )}
                    </Box>
                </Paper>
            </Box>
        </>
    )
}

export default DeepAgentSession
