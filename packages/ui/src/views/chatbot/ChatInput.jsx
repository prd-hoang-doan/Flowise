import { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, TextField, IconButton, Stack, Paper, Tooltip } from '@mui/material'
import { IconSend, IconPaperclip } from '@tabler/icons-react'

// ==============================|| CHAT INPUT ||============================== //

const ChatInput = ({ onSendMessage, disabled }) => {
    const [message, setMessage] = useState('')
    const [files, setFiles] = useState([])

    // Handle send
    const handleSend = () => {
        if (message.trim() || files.length > 0) {
            onSendMessage(message, files)
            setMessage('')
            setFiles([])
        }
    }

    // Handle key press
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Handle file upload (placeholder)
    const handleFileUpload = () => {
        // TODO: Implement file upload
        console.log('File upload clicked')
    }

    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper'
            }}
        >
            <Stack direction='row' spacing={1} alignItems='flex-end'>
                <Tooltip title='Attach files'>
                    <span>
                        <IconButton onClick={handleFileUpload} disabled={disabled} size='small'>
                            <IconPaperclip />
                        </IconButton>
                    </span>
                </Tooltip>

                <TextField
                    fullWidth
                    multiline
                    maxRows={4}
                    placeholder={disabled ? 'Select a chatflow to start' : 'Type a message...'}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={disabled}
                    variant='outlined'
                    size='small'
                />

                <IconButton
                    color='primary'
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && files.length === 0)}
                    sx={{
                        bgcolor: 'primary.main',
                        color: 'white',
                        '&:hover': {
                            bgcolor: 'primary.dark'
                        },
                        '&.Mui-disabled': {
                            bgcolor: 'action.disabledBackground'
                        }
                    }}
                >
                    <IconSend size={20} />
                </IconButton>
            </Stack>

            {files.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    {files.map((file, index) => (
                        <Box key={index}>{file.name}</Box>
                    ))}
                </Box>
            )}
        </Paper>
    )
}

ChatInput.propTypes = {
    onSendMessage: PropTypes.func.isRequired,
    disabled: PropTypes.bool
}

export default ChatInput
