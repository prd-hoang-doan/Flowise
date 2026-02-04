import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    Switch,
    FormControlLabel,
    TextField,
    Typography,
    Box,
    IconButton,
    Alert,
    Divider
} from '@mui/material'
import { IconCopy, IconCheck } from '@tabler/icons-react'
// import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
// import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
// import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

// Project imports
import conversationsApi from '@/api/conversations'
import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'

// ==============================|| SHARE DIALOG ||============================== //

const ShareDialog = ({ open, onClose, conversation }) => {
    const { setError } = useError()

    const [isPublic, setIsPublic] = useState(false)
    const [password, setPassword] = useState('')
    const [expiresAt, setExpiresAt] = useState(null)
    const [shareUrl, setShareUrl] = useState('')
    const [copied, setCopied] = useState(false)

    // API hooks
    const enableSharingApi = useApi(conversationsApi.enableSharing)
    const disableSharingApi = useApi(conversationsApi.disableSharing)

    // Load initial state
    useEffect(() => {
        if (conversation) {
            setIsPublic(conversation.isPublic || false)
            if (conversation.shareToken) {
                const url = `${window.location.origin}/shared/${conversation.shareToken}`
                setShareUrl(url)
            }
        }
    }, [conversation])

    // Handle enable sharing
    const handleEnableSharing = async () => {
        try {
            const body = {}
            if (password) body.password = password
            if (expiresAt) body.expiresAt = expiresAt.toISOString()

            const response = await enableSharingApi.request(conversation.id, body)
            setShareUrl(response.shareUrl)
            setIsPublic(true)
        } catch (error) {
            setError(error)
        }
    }

    // Handle disable sharing
    const handleDisableSharing = async () => {
        try {
            await disableSharingApi.request(conversation.id)
            setIsPublic(false)
            setShareUrl('')
            setPassword('')
            setExpiresAt(null)
        } catch (error) {
            setError(error)
        }
    }

    // Handle toggle
    const handleToggle = async (checked) => {
        if (checked) {
            await handleEnableSharing()
        } else {
            await handleDisableSharing()
        }
    }

    // Handle copy
    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
            <DialogTitle>Share Conversation</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    {/* Enable/Disable Sharing */}
                    <FormControlLabel
                        control={<Switch checked={isPublic} onChange={(e) => handleToggle(e.target.checked)} />}
                        label='Make conversation public'
                    />

                    {isPublic && (
                        <>
                            {/* Warning */}
                            <Alert severity='warning'>
                                Anyone with this link will be able to view this conversation. Make sure no sensitive information is shared.
                            </Alert>

                            {/* Share URL */}
                            {shareUrl && (
                                <Box>
                                    <Typography variant='body2' color='text.secondary' gutterBottom>
                                        Share Link
                                    </Typography>
                                    <Stack direction='row' spacing={1}>
                                        <TextField
                                            fullWidth
                                            value={shareUrl}
                                            InputProps={{
                                                readOnly: true
                                            }}
                                            size='small'
                                        />
                                        <IconButton onClick={handleCopy} color='primary'>
                                            {copied ? <IconCheck /> : <IconCopy />}
                                        </IconButton>
                                    </Stack>
                                </Box>
                            )}

                            <Divider />

                            {/* Optional Settings */}
                            <Typography variant='subtitle2'>Optional Settings</Typography>

                            {/* Password Protection */}
                            <TextField
                                fullWidth
                                label='Password Protection (Optional)'
                                type='password'
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                helperText='Add a password to protect this conversation'
                                disabled={isPublic && shareUrl}
                            />

                            {/* Expiration Date */}
                            {/* <LocalizationProvider dateAdapter={AdapterDateFns}>
                                <DateTimePicker
                                    label='Expiration Date (Optional)'
                                    value={expiresAt}
                                    onChange={(newValue) => setExpiresAt(newValue)}
                                    renderInput={(params) => (
                                        <TextField {...params} fullWidth helperText='Link will expire after this date' />
                                    )}
                                    disabled={isPublic && shareUrl}
                                    minDateTime={new Date()}
                                />
                            </LocalizationProvider> */}

                            {!shareUrl && (password || expiresAt) && (
                                <Button variant='contained' onClick={handleEnableSharing} disabled={enableSharingApi.loading}>
                                    Generate Share Link
                                </Button>
                            )}
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}

ShareDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object
}

export default ShareDialog
