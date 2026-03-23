import { useEffect, useState } from 'react'

// material-ui
import { Box, Stack, Button, Chip, IconButton, Tooltip, useTheme, Typography } from '@mui/material'

// project imports
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'

// API
import useApi from '@/hooks/useApi'
import deepagentsApi from '@/api/deepagents'

// icons
import { IconPlus, IconTrash, IconBrain } from '@tabler/icons-react'

import { useNavigate } from 'react-router-dom'

// ==============================|| DEEP AGENTS - SESSION LIST ||============================== //

const statusColors = {
    ACTIVE: 'default',
    RUNNING: 'primary',
    COMPLETED: 'success',
    FAILED: 'error',
    CANCELLED: 'warning'
}

const DeepAgents = () => {
    const theme = useTheme()
    const navigate = useNavigate()

    const getAllSessions = useApi(deepagentsApi.getAllSessions)
    const deleteSessionApi = useApi(deepagentsApi.deleteSession)
    const createSessionApi = useApi(deepagentsApi.createSession)

    const [sessions, setSessions] = useState([])
    const [isLoading, setLoading] = useState(true)

    const loadSessions = () => {
        setLoading(true)
        getAllSessions.request()
    }

    useEffect(() => {
        loadSessions()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (getAllSessions.data) {
            setSessions(getAllSessions.data?.data || [])
            setLoading(false)
        }
    }, [getAllSessions.data])

    useEffect(() => {
        if (deleteSessionApi.data) {
            loadSessions()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deleteSessionApi.data])

    useEffect(() => {
        if (createSessionApi.data) {
            navigate(`/deep-agents/${createSessionApi.data.id}`)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createSessionApi.data])

    const handleCreateSession = () => {
        createSessionApi.request({ title: 'New Research Session' })
    }

    const handleDeleteSession = (e, sessionId) => {
        e.stopPropagation()
        deleteSessionApi.request(sessionId)
    }

    const handleOpenSession = (sessionId) => {
        navigate(`/deep-agents/${sessionId}`)
    }

    return (
        <>
            <ViewHeader title='Deep Agents'>
                <Button variant='contained' color='primary' startIcon={<IconPlus size={18} />} onClick={handleCreateSession}>
                    New Session
                </Button>
            </ViewHeader>
            <MainCard sx={{ mt: 2 }}>
                {isLoading ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography variant='body1' color='textSecondary'>
                            Loading sessions...
                        </Typography>
                    </Box>
                ) : sessions.length === 0 ? (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <IconBrain size={64} color={theme.palette.grey[400]} />
                        <Typography variant='h5' sx={{ mt: 2, mb: 1 }}>
                            No research sessions yet
                        </Typography>
                        <Typography variant='body1' color='textSecondary' sx={{ mb: 3 }}>
                            Start a new deep research session to generate structured reports and artifacts.
                        </Typography>
                        <Button variant='contained' color='primary' startIcon={<IconPlus size={18} />} onClick={handleCreateSession}>
                            Create Your First Session
                        </Button>
                    </Box>
                ) : (
                    <Stack spacing={1}>
                        {sessions.map((session) => (
                            <Box
                                key={session.id}
                                onClick={() => handleOpenSession(session.id)}
                                sx={{
                                    p: 2,
                                    borderRadius: 1,
                                    border: `1px solid ${theme.palette.grey[900] + 25}`,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    '&:hover': {
                                        backgroundColor: theme.palette.grey[50],
                                        borderColor: theme.palette.primary.main
                                    }
                                }}
                            >
                                <Box sx={{ flex: 1 }}>
                                    <Stack direction='row' alignItems='center' spacing={1}>
                                        <Typography variant='subtitle1' fontWeight={600}>
                                            {session.title}
                                        </Typography>
                                        <Chip
                                            label={session.status}
                                            size='small'
                                            color={statusColors[session.status] || 'default'}
                                            variant='outlined'
                                        />
                                    </Stack>
                                    <Typography variant='body2' color='textSecondary' sx={{ mt: 0.5 }}>
                                        Created: {new Date(session.createdDate).toLocaleString()} · Updated:{' '}
                                        {new Date(session.updatedDate).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Tooltip title='Delete session'>
                                    <IconButton onClick={(e) => handleDeleteSession(e, session.id)} size='small' color='error'>
                                        <IconTrash size={18} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        ))}
                    </Stack>
                )}
            </MainCard>
        </>
    )
}

export default DeepAgents
