import { useState, useEffect, useRef } from 'react'
import { FullPageChat } from 'flowise-embed-react'
import PropTypes from 'prop-types'
import { Box, Stack, IconButton, Toolbar, Typography, Button } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconMenu2, IconShare, IconPlus } from '@tabler/icons-react'
import { Dropdown } from '@/ui-component/dropdown/Dropdown'

// Project imports
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import conversationsApi from '@/api/conversations'
import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'

// Utils
import { v4 as uuidv4 } from 'uuid'
import { baseURL } from '@/store/constant'

// ==============================|| CHAT AREA ||============================== //

const ChatArea = ({
    conversation,
    chatflows,
    selectedChatflow,
    onChatflowChange,
    onShareClick,
    onMenuClick,
    onMessageSent,
    showMenuButton
}) => {
    // const URLpath = document.location.pathname.toString().split('/')

    const theme = useTheme()
    const { setError } = useError()
    const messagesEndRef = useRef(null)

    const [messages, setMessages] = useState([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [chatbotTheme, setChatbotTheme] = useState({})
    const [chatbotOverrideConfig, setChatbotOverrideConfig] = useState({})

    // API hooks
    const getConversationMessagesApi = useApi(conversationsApi.getConversationMessages)
    const createConversationApi = useApi(conversationsApi.createConversation)

    // Load messages when conversation changes
    useEffect(() => {
        if (conversation) {
            loadMessages()
        } else {
            setMessages([])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation])

    // Load messages
    const loadMessages = async () => {
        if (!conversation) return

        setIsLoadingMessages(true)
        try {
            await getConversationMessagesApi.request(conversation.id, {
                sortOrder: 'ASC'
            })
        } catch (error) {
            setError(error)
        } finally {
            setIsLoadingMessages(false)
        }
    }

    // Update messages when API data changes
    useEffect(() => {
        if (getConversationMessagesApi.data) {
            setMessages(getConversationMessagesApi.data)
        }
    }, [getConversationMessagesApi.data])

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Handle send message
    const handleSendMessage = async (messageContent, files) => {
        if (!selectedChatflow) {
            setError('Please select a chatflow first')
            return
        }

        const chatId = conversation?.chatId || uuidv4()

        // Optimistically add user message
        const userMessage = {
            id: uuidv4(),
            role: 'userMessage',
            content: messageContent,
            createdDate: new Date().toISOString(),
            chatId,
            chatflowid: selectedChatflow.id
        }

        setMessages((prev) => [...prev, userMessage])

        try {
            // Create conversation and send message
            await createConversationApi.request({
                chatflowId: selectedChatflow.id,
                chatId,
                question: messageContent
            })

            // Reload messages and notify parent
            if (conversation) {
                await loadMessages()
            }
            onMessageSent()
        } catch (error) {
            // Remove optimistic message on error
            setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id))
            setError(error)
        }
    }

    // Empty state
    if (!conversation && messages.length === 0) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%'
                }}
            >
                {/* Toolbar */}
                <Toolbar
                    sx={{
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        bgcolor: 'background.paper'
                    }}
                >
                    <Stack direction='row' alignItems='center' spacing={2} sx={{ width: '100%' }}>
                        {showMenuButton && (
                            <IconButton onClick={onMenuClick}>
                                <IconMenu2 />
                            </IconButton>
                        )}

                        <Dropdown
                            name={'chatflow1'}
                            options={chatflows}
                            onSelect={(newValue) => {
                                const chatflow = chatflows.find((flow) => flow.name === newValue)
                                onChatflowChange(chatflow)
                            }}
                            value={selectedChatflow?.name}
                        />
                    </Stack>
                </Toolbar>

                {/* Empty state */}
                <Box
                    sx={{
                        flexGrow: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 4
                    }}
                >
                    <Stack spacing={2} alignItems='center' sx={{ maxWidth: 400, textAlign: 'center' }}>
                        <IconPlus size={64} stroke={1} color={theme.palette.primary.main} />
                        <Typography variant='h3'>How can I help you today?</Typography>
                        <Typography variant='body1' color='text.secondary'>
                            {selectedChatflow ? 'Start a conversation by typing a message below.' : 'Select a chatflow to get started.'}
                        </Typography>
                    </Stack>
                </Box>

                {/* Input */}
                <ChatInput onSendMessage={handleSendMessage} disabled={!selectedChatflow} />
            </Box>
        )
    }

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
            }}
        >
            {/* <FullPageChat
                chatflowid={selectedChatflow?.id}
                apiHost={baseURL}
                chatflowConfig={chatbotOverrideConfig}
                theme={{ chatWindow: chatbotTheme }}
            /> */}
            {/* Toolbar */}
            <Toolbar
                sx={{
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper'
                }}
            >
                <Stack direction='row' alignItems='center' spacing={2} sx={{ width: '100%' }}>
                    {showMenuButton && (
                        <IconButton onClick={onMenuClick}>
                            <IconMenu2 />
                        </IconButton>
                    )}

                    <Dropdown
                        name={'chatflow1'}
                        options={chatflows}
                        onSelect={(newValue) => {
                            const chatflow = chatflows.find((flow) => flow.name === newValue)
                            onChatflowChange(chatflow)
                        }}
                        value={selectedChatflow?.name}
                    />

                    <Box sx={{ flexGrow: 1 }} />

                    {conversation && (
                        <Button startIcon={<IconShare size={18} />} onClick={onShareClick} variant='outlined' size='small'>
                            Share
                        </Button>
                    )}
                </Stack>
            </Toolbar>

            {/* Messages */}
            <MessageList
                messages={messages}
                isLoading={isLoadingMessages}
                messagesEndRef={messagesEndRef}
                chatflowid={selectedChatflow?.id}
                chatId={conversation?.chatId}
                isDialog={false}
            />

            {/* Input */}
            <ChatInput onSendMessage={handleSendMessage} disabled={!selectedChatflow} />
        </Box>
    )
}

ChatArea.propTypes = {
    conversation: PropTypes.object,
    chatflows: PropTypes.array.isRequired,
    selectedChatflow: PropTypes.object,
    onChatflowChange: PropTypes.func.isRequired,
    onShareClick: PropTypes.func.isRequired,
    onMenuClick: PropTypes.func.isRequired,
    onMessageSent: PropTypes.func.isRequired,
    showMenuButton: PropTypes.bool
}

export default ChatArea
