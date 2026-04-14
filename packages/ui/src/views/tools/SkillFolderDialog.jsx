import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import {
    Box,
    Button,
    Typography,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    OutlinedInput,
    Stepper,
    Step,
    StepLabel,
    Radio,
    RadioGroup,
    FormControlLabel,
    Chip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { StyledButton } from '@/ui-component/button/StyledButton'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'

// Icons
import { IconX, IconPencil, IconPhoto, IconBolt, IconFolder, IconCheck } from '@tabler/icons-react'

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

const WIZARD_STEPS = ['Choose Goal', 'Folder Setup', 'Review & Create']

const GOAL_OPTIONS = [
    {
        value: 'simple',
        label: 'Write content only',
        description: 'Create skills using markdown and preview results',
        icon: IconPencil,
        features: ['Focus on writing', 'No setup required', 'Fastest way to start'],
        bestFor: 'Prompt writing, documentation'
    },
    {
        value: 'advanced',
        label: 'Add media with AI',
        description: 'Upload files and generate captions automatically',
        icon: IconPhoto,
        features: ['Upload images/files', 'Auto-generate captions', 'Better context for AI'],
        bestFor: 'Rich content with images and documents'
    },
    {
        value: 'dedicated',
        label: 'Build full AI workflow',
        description: 'Use embeddings, nodes, and advanced automation',
        icon: IconBolt,
        features: ['Smart retrieval', 'Embedding support', 'Node-based execution'],
        bestFor: 'Complex AI systems, automation pipelines'
    }
]

const GOAL_TO_FEATURES = {
    simple: ['Markdown editor', 'Preview'],
    advanced: ['Markdown editor', 'Preview', 'Asset upload', 'AI captioning'],
    dedicated: ['Markdown editor', 'Preview', 'Asset upload', 'AI captioning', 'Smart retrieval', 'Embedding support']
}

// ─── Step 1: Choose Goal ───
const StepChooseGoal = ({ goal, onGoalChange }) => {
    const theme = useTheme()

    return (
        <Box sx={{ display: 'flex', gap: 3, minHeight: 320 }}>
            {/* Left: Goal cards */}
            <Box sx={{ flex: 1 }}>
                <Typography variant='h6' sx={{ mb: 0.5 }}>
                    What do you want to build?
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 2.5 }}>
                    You can upgrade later anytime
                </Typography>
                <RadioGroup value={goal} onChange={(e) => onGoalChange(e.target.value)}>
                    <Stack spacing={1.5}>
                        {GOAL_OPTIONS.map((opt) => {
                            const Icon = opt.icon
                            const isSelected = goal === opt.value
                            return (
                                <Box
                                    key={opt.value}
                                    onClick={() => onGoalChange(opt.value)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 1.5,
                                        p: 2,
                                        borderRadius: 2,
                                        border: '2px solid',
                                        borderColor: isSelected ? 'primary.main' : theme.palette.grey[300],
                                        background: isSelected ? theme.palette.primary.main + '08' : 'transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        '&:hover': {
                                            borderColor: isSelected ? 'primary.main' : theme.palette.grey[400],
                                            background: isSelected ? theme.palette.primary.main + '08' : theme.palette.grey[50]
                                        }
                                    }}
                                >
                                    <Radio checked={isSelected} value={opt.value} size='small' sx={{ p: 0, mt: 0.25 }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Icon size={18} stroke={1.5} />
                                            <Typography variant='subtitle1' fontWeight={600}>
                                                {opt.label}
                                            </Typography>
                                        </Box>
                                        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
                                            {opt.description}
                                        </Typography>
                                    </Box>
                                </Box>
                            )
                        })}
                    </Stack>
                </RadioGroup>
            </Box>
            {/* Right: Contextual help */}
            <Box
                sx={{
                    width: 220,
                    flexShrink: 0,
                    p: 2.5,
                    borderRadius: 2,
                    background: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50],
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    alignSelf: 'flex-start'
                }}
            >
                {GOAL_OPTIONS.filter((o) => o.value === goal).map((opt) => (
                    <Box key={opt.value}>
                        <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1.5 }}>
                            {opt.value === 'simple' ? 'Simple Mode' : opt.value === 'advanced' ? 'Advanced Mode' : 'Dedicated Mode'}
                        </Typography>
                        <Stack spacing={0.75}>
                            {opt.features.map((f) => (
                                <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <IconCheck size={14} color={theme.palette.success.main} stroke={2.5} />
                                    <Typography variant='body2'>{f}</Typography>
                                </Box>
                            ))}
                        </Stack>
                        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 2 }}>
                            Best for: {opt.bestFor}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    )
}

// ─── Step 2: Folder Setup ───
const StepFolderSetup = ({
    folderName,
    folderDescription,
    folderColor,
    folderIcon,
    onNameChange,
    onDescriptionChange,
    onColorChange,
    onIconChange
}) => {
    const theme = useTheme()

    return (
        <Box sx={{ display: 'flex', gap: 3, minHeight: 320 }}>
            {/* Left: Form */}
            <Box sx={{ flex: 1 }}>
                <Typography variant='h6' sx={{ mb: 2.5 }}>
                    Set up your folder
                </Typography>
                <Stack spacing={2}>
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
                            onChange={(e) => onNameChange(e.target.value)}
                            autoFocus
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
                            onChange={(e) => onDescriptionChange(e.target.value)}
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Color</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                            {PRESET_COLORS.map((color) => (
                                <Box
                                    key={color}
                                    onClick={() => onColorChange(color)}
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
                            onChange={(e) => onColorChange(e.target.value)}
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
                            onChange={(e) => onIconChange(e.target.value)}
                        />
                    </Box>
                </Stack>
            </Box>
            {/* Right: Live Preview */}
            <Box
                sx={{
                    width: 220,
                    flexShrink: 0,
                    p: 2.5,
                    borderRadius: 2,
                    background: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50],
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    alignSelf: 'flex-start'
                }}
            >
                <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 2 }}>
                    Preview
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {folderIcon ? (
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                                borderRadius: '50%',
                                backgroundImage: `url(${folderIcon})`,
                                backgroundSize: 'contain',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'center'
                            }}
                        />
                    ) : (
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                                borderRadius: '50%',
                                background: folderColor || theme.palette.primary.main,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <IconFolder size={22} color='white' />
                        </Box>
                    )}
                    <Typography variant='subtitle1' fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                        {folderName || 'Folder Name'}
                    </Typography>
                </Box>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1.5 }}>
                    This is how your folder will appear
                </Typography>
            </Box>
        </Box>
    )
}

// ─── Step 3: Review & Create ───
const StepReview = ({ goal, folderName, folderDescription, folderColor, folderIcon }) => {
    const theme = useTheme()
    const selectedGoal = GOAL_OPTIONS.find((o) => o.value === goal)
    const features = GOAL_TO_FEATURES[goal] || []

    return (
        <Box sx={{ display: 'flex', gap: 3, minHeight: 280 }}>
            {/* Left: Review details */}
            <Box sx={{ flex: 1 }}>
                <Typography variant='h6' sx={{ mb: 2.5 }}>
                    Review your setup
                </Typography>
                <Stack spacing={2.5}>
                    <Box>
                        <Typography variant='overline' color='text.secondary'>
                            Folder Name
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                            <Box
                                sx={{
                                    width: 32,
                                    height: 32,
                                    flexShrink: 0,
                                    borderRadius: '50%',
                                    background: folderColor || theme.palette.primary.main,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <IconFolder size={18} color='white' />
                            </Box>
                            <Typography variant='subtitle1' fontWeight={600}>
                                {folderName}
                            </Typography>
                        </Box>
                    </Box>
                    {folderDescription && (
                        <Box>
                            <Typography variant='overline' color='text.secondary'>
                                Description
                            </Typography>
                            <Typography variant='body2' sx={{ mt: 0.5 }}>
                                {folderDescription}
                            </Typography>
                        </Box>
                    )}
                    <Box>
                        <Typography variant='overline' color='text.secondary'>
                            Mode
                        </Typography>
                        <Typography variant='body2' sx={{ mt: 0.5 }}>
                            {selectedGoal?.label}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant='overline' color='text.secondary'>
                            Features
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                            {features.map((f) => (
                                <Chip key={f} label={f} size='small' icon={<IconCheck size={14} />} variant='outlined' color='success' />
                            ))}
                        </Box>
                    </Box>
                </Stack>
            </Box>
            {/* Right: Next steps */}
            <Box
                sx={{
                    width: 220,
                    flexShrink: 0,
                    p: 2.5,
                    borderRadius: 2,
                    background: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50],
                    border: '1px solid',
                    borderColor: theme.palette.divider,
                    alignSelf: 'flex-start'
                }}
            >
                <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1.5 }}>
                    Next Steps
                </Typography>
                <Stack spacing={1}>
                    {['Create your first skill', 'Add content in markdown', goal !== 'simple' ? 'Upload assets (optional)' : null]
                        .filter(Boolean)
                        .map((step, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <Typography variant='body2' fontWeight={700} color='primary.main'>
                                    {i + 1}.
                                </Typography>
                                <Typography variant='body2'>{step}</Typography>
                            </Box>
                        ))}
                </Stack>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 2 }}>
                    You can change settings later
                </Typography>
            </Box>
        </Box>
    )
}

const SkillFolderDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    const theme = useTheme()

    useNotifier()
    const { confirm } = useConfirm()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    // Wizard state (ADD mode)
    const [activeStep, setActiveStep] = useState(0)
    const [goal, setGoal] = useState('simple')

    // Shared form state
    const [folderId, setFolderId] = useState('')
    const [folderName, setFolderName] = useState('')
    const [folderDescription, setFolderDescription] = useState('')
    const [folderColor, setFolderColor] = useState('')
    const [folderIcon, setFolderIcon] = useState('')

    const isAddMode = dialogProps.type === 'ADD'

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
            setActiveStep(0)
            setGoal('simple')
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
                iconSrc: folderIcon,
                mode: goal
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
                onConfirm(createResp.data)
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

    // ─── Wizard navigation ───
    const handleNext = () => {
        if (activeStep === WIZARD_STEPS.length - 1) {
            addNewFolder()
        } else {
            setActiveStep((prev) => prev + 1)
        }
    }

    const handleBack = () => {
        setActiveStep((prev) => prev - 1)
    }

    const canProceed = () => {
        if (activeStep === 0) return true // goal always has a default
        if (activeStep === 1) return folderName.trim().length > 0
        return true
    }

    // ─── EDIT mode: flat dialog (unchanged) ───
    const editComponent = (
        <Dialog fullWidth maxWidth='sm' open={show} onClose={onCancel} aria-labelledby='skill-folder-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='skill-folder-dialog-title'>
                Edit Skill Folder
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
                <StyledButton color='error' variant='contained' onClick={deleteFolder} sx={{ mr: 'auto' }}>
                    Delete
                </StyledButton>
                <StyledButton variant='text' onClick={onCancel}>
                    Cancel
                </StyledButton>
                <StyledPermissionButton permissionId='tools:update' variant='contained' disabled={!folderName} onClick={saveFolder}>
                    Save
                </StyledPermissionButton>
            </DialogActions>
            <ConfirmDialog />
        </Dialog>
    )

    // ─── ADD mode: 3-step wizard ───
    const wizardComponent = (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='skill-folder-wizard-title'>
            <DialogTitle sx={{ fontSize: '1rem', pb: 0 }} id='skill-folder-wizard-title'>
                Create New Folder
            </DialogTitle>
            <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                <Stepper activeStep={activeStep} alternativeLabel>
                    {WIZARD_STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
            </Box>
            <DialogContent sx={{ px: 3, pt: 2 }}>
                {activeStep === 0 && <StepChooseGoal goal={goal} onGoalChange={(newGoal) => setGoal(newGoal)} />}
                {activeStep === 1 && (
                    <StepFolderSetup
                        folderName={folderName}
                        folderDescription={folderDescription}
                        folderColor={folderColor}
                        folderIcon={folderIcon}
                        onNameChange={setFolderName}
                        onDescriptionChange={setFolderDescription}
                        onColorChange={setFolderColor}
                        onIconChange={setFolderIcon}
                    />
                )}
                {activeStep === 2 && (
                    <StepReview
                        goal={goal}
                        folderName={folderName}
                        folderDescription={folderDescription}
                        folderColor={folderColor}
                        folderIcon={folderIcon}
                    />
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                <StyledButton variant='text' onClick={onCancel}>
                    Cancel
                </StyledButton>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {activeStep > 0 && (
                        <StyledButton variant='outlined' onClick={handleBack}>
                            Back
                        </StyledButton>
                    )}
                    <StyledPermissionButton permissionId='tools:create' variant='contained' disabled={!canProceed()} onClick={handleNext}>
                        {activeStep === WIZARD_STEPS.length - 1 ? 'Create Folder' : 'Continue'}
                    </StyledPermissionButton>
                </Box>
            </DialogActions>
            <ConfirmDialog />
        </Dialog>
    )

    const component = show ? (isAddMode ? wizardComponent : editComponent) : null

    return createPortal(component, portalElement)
}

SkillFolderDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default SkillFolderDialog
