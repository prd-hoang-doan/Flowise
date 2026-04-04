import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import { Box, Button, Typography, Dialog, DialogActions, DialogContent, DialogTitle, Stack, OutlinedInput } from '@mui/material'
import { StyledButton } from '@/ui-component/button/StyledButton'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'

// Icons
import { IconX } from '@tabler/icons-react'

// API
import skillFoldersApi from '@/api/skillfolders'

// Hooks
import useConfirm from '@/hooks/useConfirm'
import useNotifier from '@/utils/useNotifier'
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'
import { generateRandomGradient } from '@/utils/genericHelper'

const PRESET_COLORS = [
    '#FF6B6B',
    '#FF8E53',
    '#FFC93C',
    '#6BCB77',
    '#4D96FF',
    '#9B59B6',
    '#E056A0',
    '#00B4D8',
    '#2D6A4F',
    '#5C4742',
    '#264653',
    '#7209B7'
]

const SkillFolderDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()

    useNotifier()
    const { confirm } = useConfirm()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [folderId, setFolderId] = useState('')
    const [folderName, setFolderName] = useState('')
    const [folderDescription, setFolderDescription] = useState('')
    const [folderColor, setFolderColor] = useState('')
    const [folderIcon, setFolderIcon] = useState('')

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    useEffect(() => {
        if (dialogProps.type === 'EDIT' && dialogProps.data) {
            setFolderId(dialogProps.data.id)
            setFolderName(dialogProps.data.name)
            setFolderDescription(dialogProps.data.description || '')
            setFolderColor(dialogProps.data.color || '')
            setFolderIcon(dialogProps.data.iconSrc || '')
        } else if (dialogProps.type === 'ADD') {
            setFolderId('')
            setFolderName('')
            setFolderDescription('')
            setFolderColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
            setFolderIcon('')
        }
    }, [dialogProps])

    const addNewFolder = async () => {
        try {
            const obj = {
                name: folderName,
                description: folderDescription,
                color: folderColor || generateRandomGradient(),
                iconSrc: folderIcon
            }
            const createResp = await skillFoldersApi.createSkillFolder(obj)
            if (createResp.data) {
                enqueueSnackbar({
                    message: 'New Skill Folder created',
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
                onConfirm()
            }
        } catch (error) {
            enqueueSnackbar({
                message: `Failed to create Skill Folder: ${
                    typeof error.response?.data === 'object' ? error.response.data.message : error.response?.data
                }`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    persist: true,
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const saveFolder = async () => {
        try {
            const obj = {
                name: folderName,
                description: folderDescription,
                color: folderColor,
                iconSrc: folderIcon
            }
            const saveResp = await skillFoldersApi.updateSkillFolder(folderId, obj)
            if (saveResp.data) {
                enqueueSnackbar({
                    message: 'Skill Folder saved',
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
                onConfirm()
            }
        } catch (error) {
            enqueueSnackbar({
                message: `Failed to save Skill Folder: ${
                    typeof error.response?.data === 'object' ? error.response.data.message : error.response?.data
                }`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    persist: true,
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const deleteFolder = async () => {
        const confirmPayload = {
            title: `Delete Skill Folder`,
            description: `Delete folder "${folderName}"? This will also delete all skill files inside it.`,
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel'
        }
        const isConfirmed = await confirm(confirmPayload)
        if (isConfirmed) {
            try {
                const delResp = await skillFoldersApi.deleteSkillFolder(folderId)
                if (delResp.data) {
                    enqueueSnackbar({
                        message: 'Skill Folder deleted',
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
                    onConfirm()
                }
            } catch (error) {
                enqueueSnackbar({
                    message: `Failed to delete Skill Folder: ${
                        typeof error.response?.data === 'object' ? error.response.data.message : error.response?.data
                    }`,
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'error',
                        persist: true,
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
            }
        }
    }

    const component = show ? (
        <Dialog
            fullWidth
            maxWidth='sm'
            open={show}
            onClose={onCancel}
            aria-labelledby='skill-folder-dialog-title'
            aria-describedby='skill-folder-dialog-description'
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='skill-folder-dialog-title'>
                {dialogProps.type === 'ADD' ? 'Add New Skill Folder' : 'Edit Skill Folder'}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                        <Typography variant='overline'>
                            Name<span style={{ color: 'red' }}>&nbsp;*</span>
                        </Typography>
                        <OutlinedInput
                            fullWidth
                            id='folderName'
                            type='text'
                            placeholder='My Skills'
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Description</Typography>
                        <OutlinedInput
                            fullWidth
                            id='folderDescription'
                            type='text'
                            placeholder='A collection of skills for...'
                            multiline
                            rows={3}
                            value={folderDescription}
                            onChange={(e) => setFolderDescription(e.target.value)}
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Color</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                            {PRESET_COLORS.map((color) => (
                                <Box
                                    key={color}
                                    onClick={() => setFolderColor(color)}
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: color,
                                        cursor: 'pointer',
                                        border: folderColor === color ? '3px solid' : '2px solid transparent',
                                        borderColor: folderColor === color ? 'primary.main' : 'transparent',
                                        transition: 'border-color 0.2s',
                                        '&:hover': { opacity: 0.8 }
                                    }}
                                />
                            ))}
                        </Box>
                        <OutlinedInput
                            sx={{ mt: 1 }}
                            fullWidth
                            id='folderColor'
                            type='text'
                            placeholder='#FF6B6B or linear-gradient(...)'
                            size='small'
                            value={folderColor}
                            onChange={(e) => setFolderColor(e.target.value)}
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Icon URL (optional)</Typography>
                        <OutlinedInput
                            fullWidth
                            id='folderIcon'
                            type='text'
                            placeholder='https://example.com/icon.png'
                            size='small'
                            value={folderIcon}
                            onChange={(e) => setFolderIcon(e.target.value)}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                {dialogProps.type === 'EDIT' && (
                    <StyledButton color='error' variant='contained' onClick={deleteFolder} sx={{ mr: 'auto' }}>
                        Delete
                    </StyledButton>
                )}
                <StyledButton variant='text' onClick={onCancel}>
                    Cancel
                </StyledButton>
                <StyledPermissionButton
                    permissionId={dialogProps.type === 'ADD' ? 'tools:create' : 'tools:update'}
                    variant='contained'
                    disabled={!folderName}
                    onClick={dialogProps.type === 'ADD' ? addNewFolder : saveFolder}
                >
                    {dialogProps.type === 'ADD' ? 'Add' : 'Save'}
                </StyledPermissionButton>
            </DialogActions>
            <ConfirmDialog />
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

SkillFolderDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default SkillFolderDialog
