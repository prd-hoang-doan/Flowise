import PropTypes from 'prop-types'

import { Box, Chip, CircularProgress, Stack, Tooltip, Typography } from '@mui/material'
import { IconCheck, IconCircleCheck, IconClock, IconUpload } from '@tabler/icons-react'

import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'

const fmtDate = (iso) => {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleString()
    } catch {
        return String(iso)
    }
}

// Skill-level status + Publish action, displayed at the top of the editor.
const SkillV2PublishBar = ({ skill, saving, onPublish, publishing, lastSavedAt, dirty }) => {
    const hasPublished = !!skill?.publishedBundleId
    return (
        <Stack
            direction='row'
            spacing={2}
            alignItems='center'
            sx={{
                px: 2,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                flexWrap: 'wrap',
                rowGap: 1
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography variant='subtitle1' noWrap sx={{ fontWeight: 600 }}>
                    {skill?.name || 'Untitled skill'}
                </Typography>
                <Typography variant='caption' color='text.secondary'>
                    {hasPublished ? `Bundle ${skill.publishedBundleId.slice(0, 8)}…` : 'Not yet published'}
                </Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Stack direction='row' spacing={1} alignItems='center'>
                {saving ? (
                    <Chip size='small' icon={<CircularProgress size={12} />} label='Saving…' variant='outlined' />
                ) : dirty ? (
                    <Chip size='small' icon={<IconClock size={14} />} label='Unsaved changes' color='warning' variant='outlined' />
                ) : lastSavedAt ? (
                    <Tooltip title={`Last saved ${fmtDate(lastSavedAt)}`}>
                        <Chip size='small' icon={<IconCheck size={14} />} label='Saved' variant='outlined' color='success' />
                    </Tooltip>
                ) : null}
                {hasPublished && (
                    <Chip size='small' icon={<IconCircleCheck size={14} />} label='Published' color='success' variant='outlined' />
                )}
                <StyledPermissionButton
                    permissionId='tools:update'
                    variant='contained'
                    size='small'
                    disabled={publishing || dirty}
                    onClick={onPublish}
                    startIcon={publishing ? <CircularProgress size={12} color='inherit' /> : <IconUpload size={14} />}
                    sx={{ textTransform: 'none' }}
                >
                    {publishing ? 'Publishing…' : 'Publish'}
                </StyledPermissionButton>
            </Stack>
        </Stack>
    )
}

SkillV2PublishBar.propTypes = {
    skill: PropTypes.object,
    saving: PropTypes.bool,
    onPublish: PropTypes.func,
    publishing: PropTypes.bool,
    lastSavedAt: PropTypes.string,
    dirty: PropTypes.bool
}

export default SkillV2PublishBar
