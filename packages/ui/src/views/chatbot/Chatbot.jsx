import { useState, useEffect } from 'react'
import { Box, Drawer, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// Project imports
import ConversationHistory from './ConversationHistory'
import ChatArea from './ChatArea'
import ShareDialog from './ShareDialog'

// API
import conversationsApi from '@/api/conversations'
import chatflowsApi from '@/api/chatflows'
import assistantsApi from '@/api/assistants'

// Hooks
import useApi from '@/hooks/useApi'

// Constants
const DRAWER_WIDTH = 280

// ==============================|| CHATBOT ||============================== //

const Chatbot = () => {
    const theme = useTheme()
    const matchDownMd = useMediaQuery(theme.breakpoints.down('md'))

    // State
    const [mobileOpen, setMobileOpen] = useState(false)
    const [activeConversation, setActiveConversation] = useState(null)
    const [conversations, setConversations] = useState({
        today: [],
        last7Days: [],
        previous30Days: []
    })
    const [chatflows, setChatflows] = useState([])
    const [selectedChatflow, setSelectedChatflow] = useState(null)
    const [shareDialogOpen, setShareDialogOpen] = useState(false)

    // API hooks
    const getConversationsGroupedApi = useApi(conversationsApi.getConversationsGrouped)
    const getAllChatflowsApi = useApi(chatflowsApi.getAllChatflows)
    const getAllAgentflowsApi = useApi(chatflowsApi.getAllAgentflows)
    const getAssistantsApi = useApi(assistantsApi.getAllAssistants)

    useEffect(() => {
        if (chatflows.length === 0) {
            getAllChatflowsApi.request()
            getAssistantsApi.request('CUSTOM')
            getAllAgentflowsApi.request('AGENTFLOW')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (getAllAgentflowsApi.data && getAllChatflowsApi.data && getAssistantsApi.data) {
            try {
                const agentFlows = populateFlowNames(getAllAgentflowsApi.data, 'Agentflow v2')
                const chatFlows = populateFlowNames(getAllChatflowsApi.data, 'Chatflow')
                const assistants = populateAssistants(getAssistantsApi.data)
                setChatflows([...agentFlows, ...chatFlows, ...assistants])
            } catch (e) {
                console.error(e)
            }
        }
    }, [getAllAgentflowsApi.data, getAllChatflowsApi.data, getAssistantsApi.data])

    const populateFlowNames = (data, type) => {
        let flowNames = []
        for (let i = 0; i < data.length; i += 1) {
            const flow = data[i]
            flowNames.push({
                id: flow.id,
                label: flow.name,
                name: flow.id,
                type: type,
                description: type
            })
        }
        return flowNames
    }

    const populateAssistants = (assistants) => {
        let assistantNames = []
        for (let i = 0; i < assistants.length; i += 1) {
            const assistant = assistants[i]
            assistantNames.push({
                label: JSON.parse(assistant.details).name || '',
                name: assistant.id,
                type: 'Custom Assistant',
                description: 'Custom Assistant'
            })
        }
        return assistantNames
    }

    // Load conversations on mount
    useEffect(() => {
        loadConversations()
        // loadChatflows()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Load conversations
    const loadConversations = async () => {
        try {
            await getConversationsGroupedApi.request()
        } catch (error) {
            console.error('Failed to load conversations:', error)
        }
    }

    // Load chatflows and agentflows
    const loadChatflows = async () => {
        try {
            const [chatflowsRes, agentflowsRes] = await Promise.all([
                getAllChatflowsApi.request(),
                getAllAgentflowsApi.request('AGENTFLOW')
            ])

            const allFlows = [...(chatflowsRes?.data || []), ...(agentflowsRes?.data || [])]
            setChatflows(allFlows)

            // Select first chatflow by default
            if (allFlows.length > 0 && !selectedChatflow) {
                setSelectedChatflow(allFlows[0])
            }
        } catch (error) {
            console.error('Failed to load chatflows:', error)
        }
    }

    // Update conversations when API data changes
    useEffect(() => {
        if (getConversationsGroupedApi.data) {
            setConversations(getConversationsGroupedApi.data)
        }
    }, [getConversationsGroupedApi.data])

    // Handle conversation selection
    const handleConversationSelect = (conversation) => {
        console.log('Selected conversation:', conversation)
        setActiveConversation(conversation)
        setSelectedChatflow({
            id: conversation.chatflow.id,
            label: conversation.chatflow.name,
            name: conversation.chatflow.id,
            type: conversation.chatflow.type,
            description: conversation.chatflow.type
        })
        if (matchDownMd) {
            setMobileOpen(false)
        }
    }

    // Handle new conversation
    const handleNewConversation = () => {
        setActiveConversation(null)
    }

    // Handle conversation delete
    const handleConversationDelete = (conversationId) => {
        if (activeConversation?.id === conversationId) {
            setActiveConversation(null)
        }
        loadConversations()
    }

    // Handle clear all conversations
    const handleClearAll = () => {
        setActiveConversation(null)
        loadConversations()
    }

    // Handle chatflow change
    const handleChatflowChange = (chatflow) => {
        console.log('Selected chatflow:', chatflow)
        setSelectedChatflow(chatflow)
        // Create new conversation when chatflow changes
        setActiveConversation(null)
    }

    // Handle share click
    const handleShareClick = () => {
        setShareDialogOpen(true)
    }

    // Handle drawer toggle
    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen)
    }

    // Handle message sent - refresh conversation
    const handleMessageSent = () => {
        loadConversations()
    }

    return (
        <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {/* Conversation History Sidebar */}
            <Box
                component='nav'
                sx={{
                    width: { md: DRAWER_WIDTH },
                    flexShrink: { md: 0 }
                }}
            >
                {/* Mobile Drawer */}
                {matchDownMd && (
                    <Drawer
                        variant='temporary'
                        open={mobileOpen}
                        onClose={handleDrawerToggle}
                        ModalProps={{ keepMounted: true }}
                        sx={{
                            '& .MuiDrawer-paper': {
                                width: DRAWER_WIDTH,
                                bgcolor: 'background.default'
                            }
                        }}
                    >
                        <ConversationHistory
                            conversations={conversations}
                            activeConversation={activeConversation}
                            onConversationSelect={handleConversationSelect}
                            onNewConversation={handleNewConversation}
                            onConversationDelete={handleConversationDelete}
                            onClearAll={handleClearAll}
                            isLoading={getConversationsGroupedApi.loading}
                        />
                    </Drawer>
                )}

                {/* Desktop Drawer */}
                {!matchDownMd && (
                    <Drawer
                        variant='permanent'
                        sx={{
                            '& .MuiDrawer-paper': {
                                width: DRAWER_WIDTH,
                                position: 'relative',
                                height: '100%',
                                borderRight: `1px solid ${theme.palette.divider}`,
                                bgcolor: 'background.default'
                            }
                        }}
                        open
                    >
                        <ConversationHistory
                            conversations={conversations}
                            activeConversation={activeConversation}
                            onConversationSelect={handleConversationSelect}
                            onNewConversation={handleNewConversation}
                            onConversationDelete={handleConversationDelete}
                            onClearAll={handleClearAll}
                            isLoading={getConversationsGroupedApi.loading}
                        />
                    </Drawer>
                )}
            </Box>

            {/* Main Chat Area */}
            <Box
                component='main'
                sx={{
                    flexGrow: 1,
                    width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
                    height: '100%',
                    overflow: 'hidden'
                }}
            >
                <ChatArea
                    conversation={activeConversation}
                    chatflows={chatflows}
                    selectedChatflow={selectedChatflow}
                    onChatflowChange={handleChatflowChange}
                    onShareClick={handleShareClick}
                    onMenuClick={handleDrawerToggle}
                    onMessageSent={handleMessageSent}
                    showMenuButton={matchDownMd}
                />
            </Box>

            {/* Share Dialog */}
            {activeConversation && (
                <ShareDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} conversation={activeConversation} />
            )}
        </Box>
    )
}

export default Chatbot
