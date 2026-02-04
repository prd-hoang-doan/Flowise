import { useState } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Button,
    Divider,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Stack,
    TextField,
    Typography,
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Skeleton
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconPlus, IconSearch, IconTrash, IconDotsVertical, IconEdit, IconClearAll } from '@tabler/icons-react'

// Project imports
import conversationsApi from '@/api/conversations'
import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'

// ==============================|| CONVERSATION HISTORY ||============================== //

const ConversationHistory = ({
    conversations,
    activeConversation,
    onConversationSelect,
    onNewConversation,
    onConversationDelete,
    onClearAll,
    isLoading
}) => {
    const theme = useTheme()
    const { setError } = useError()

    const [searchQuery, setSearchQuery] = useState('')
    const [menuAnchor, setMenuAnchor] = useState(null)
    const [selectedConversation, setSelectedConversation] = useState(null)
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false)

    // API hooks
    const deleteConversationApi = useApi(conversationsApi.deleteConversation)
    const deleteAllConversationsApi = useApi(conversationsApi.deleteAllConversations)
    const updateConversationApi = useApi(conversationsApi.updateConversation)

    // Filter conversations based on search
    const filterConversations = (conversationList) => {
        if (!searchQuery) return conversationList
        return conversationList.filter((conv) => conv.title.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    // Handle conversation menu
    const handleMenuOpen = (event, conversation) => {
        event.stopPropagation()
        setMenuAnchor(event.currentTarget)
        setSelectedConversation(conversation)
    }

    const handleMenuClose = () => {
        setMenuAnchor(null)
    }

    // Handle rename
    const handleRenameClick = () => {
        setNewTitle(selectedConversation.title)
        setRenameDialogOpen(true)
        handleMenuClose()
    }

    const handleRenameSubmit = async () => {
        try {
            await updateConversationApi.request(selectedConversation.id, { title: newTitle })
            setRenameDialogOpen(false)
            // Reload conversations after rename
            window.location.reload()
        } catch (error) {
            setError(error)
        }
    }

    // Handle delete
    const handleDeleteClick = async () => {
        try {
            await deleteConversationApi.request(selectedConversation.id)
            onConversationDelete(selectedConversation.id)
            handleMenuClose()
        } catch (error) {
            setError(error)
        }
    }

    // Handle clear all
    const handleClearAllClick = () => {
        setClearAllDialogOpen(true)
    }

    const handleClearAllConfirm = async () => {
        try {
            await deleteAllConversationsApi.request()
            setClearAllDialogOpen(false)
            onClearAll()
        } catch (error) {
            setError(error)
        }
    }

    // Render conversation item
    const renderConversationItem = (conversation) => {
        const isActive = activeConversation?.id === conversation.id

        return (
            <ListItemButton
                key={conversation.id}
                selected={isActive}
                onClick={() => onConversationSelect(conversation)}
                sx={{
                    mb: 0.5,
                    borderRadius: 1,
                    '&.Mui-selected': {
                        bgcolor: theme.palette.primary.lighter,
                        '&:hover': {
                            bgcolor: theme.palette.primary.light
                        }
                    }
                }}
            >
                <ListItemText
                    primary={
                        <Typography variant='body2' noWrap>
                            {conversation.title}
                        </Typography>
                    }
                    secondary={
                        <Typography variant='caption' color='text.secondary'>
                            {new Date(conversation.lastMessageAt).toLocaleString()}
                        </Typography>
                    }
                />
                <IconButton size='small' onClick={(e) => handleMenuOpen(e, conversation)} sx={{ ml: 1 }}>
                    <IconDotsVertical size={16} />
                </IconButton>
            </ListItemButton>
        )
    }

    // Render conversation group
    const renderConversationGroup = (title, conversationList) => {
        const filtered = filterConversations(conversationList)
        if (filtered.length === 0) return null

        return (
            <Box sx={{ mb: 2 }}>
                <Typography variant='caption' color='text.secondary' sx={{ px: 2, py: 1, display: 'block' }}>
                    {title}
                </Typography>
                <List dense sx={{ px: 1 }}>
                    {filtered.map(renderConversationItem)}
                </List>
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ p: 2 }}>
                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 2 }}>
                    <Typography variant='h4'>Chat History</Typography>
                    <IconButton
                        size='small'
                        onClick={handleClearAllClick}
                        disabled={
                            conversations.today.length === 0 &&
                            conversations.last7Days.length === 0 &&
                            conversations.previous30Days.length === 0
                        }
                    >
                        <IconClearAll size={20} />
                    </IconButton>
                </Stack>

                {/* New Conversation Button */}
                <Button fullWidth variant='contained' startIcon={<IconPlus />} onClick={onNewConversation} sx={{ mb: 2 }}>
                    New Conversation
                </Button>

                {/* Search */}
                <TextField
                    fullWidth
                    size='small'
                    placeholder='Search conversations...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    InputProps={{
                        startAdornment: <IconSearch size={18} style={{ marginRight: 8 }} />
                    }}
                />
            </Box>

            <Divider />

            {/* Conversation List */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
                {isLoading ? (
                    <Box sx={{ px: 2 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} variant='rectangular' height={60} sx={{ mb: 1, borderRadius: 1 }} />
                        ))}
                    </Box>
                ) : (
                    <>
                        {renderConversationGroup('Today', conversations.today)}
                        {renderConversationGroup('Last 7 Days', conversations.last7Days)}
                        {renderConversationGroup('Previous 30 Days', conversations.previous30Days)}

                        {conversations.today.length === 0 &&
                            conversations.last7Days.length === 0 &&
                            conversations.previous30Days.length === 0 && (
                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                    <Typography variant='body2' color='text.secondary'>
                                        No conversations yet.
                                        <br />
                                        Start a new conversation!
                                    </Typography>
                                </Box>
                            )}
                    </>
                )}
            </Box>

            {/* Context Menu */}
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
                <MenuItem onClick={handleRenameClick}>
                    <IconEdit size={18} style={{ marginRight: 8 }} />
                    Rename
                </MenuItem>
                <MenuItem onClick={handleDeleteClick}>
                    <IconTrash size={18} style={{ marginRight: 8 }} />
                    Delete
                </MenuItem>
            </Menu>

            {/* Rename Dialog */}
            <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth='sm' fullWidth>
                <DialogTitle>Rename Conversation</DialogTitle>
                <DialogContent>
                    <TextField
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autofocus
                        fullWidth
                        label='Title'
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRenameSubmit} variant='contained' disabled={!newTitle.trim()}>
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Clear All Dialog */}
            <Dialog open={clearAllDialogOpen} onClose={() => setClearAllDialogOpen(false)}>
                <DialogTitle>Clear All Conversations?</DialogTitle>
                <DialogContent>
                    <Typography>This will permanently delete all your conversations. This action cannot be undone.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClearAllDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleClearAllConfirm} variant='contained' color='error'>
                        Clear All
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

ConversationHistory.propTypes = {
    conversations: PropTypes.shape({
        today: PropTypes.array,
        last7Days: PropTypes.array,
        previous30Days: PropTypes.array
    }).isRequired,
    activeConversation: PropTypes.object,
    onConversationSelect: PropTypes.func.isRequired,
    onNewConversation: PropTypes.func.isRequired,
    onConversationDelete: PropTypes.func.isRequired,
    onClearAll: PropTypes.func.isRequired,
    isLoading: PropTypes.bool
}

export default ConversationHistory
