import PropTypes from 'prop-types'

import { useTheme } from '@mui/material/styles'
import { Box, IconButton, Typography, Tabs, Tab, Stack, Tooltip } from '@mui/material'
import { IconX, IconRefresh, IconTrash } from '@tabler/icons-react'

import { INSPECTOR_TABS } from '../../utils/constants'

/**
 * Sticky header for the Inspector drawer:
 *   - Title row: selected node label + close button.
 *   - Action row: Re-run, Wipe debug state, etc.
 *   - Tabs row: Last Run / Node Vars / Flow State / Globals.
 */
const InspectorHeader = ({
    title,
    subtitle,
    onClose,
    onRerun,
    onWipe,
    tab,
    onTabChange,
    canRerun = false,
    rerunBusy = false,
    nodeVarsCount = 0,
    flowStateCount = 0,
    hasDebugStepOverrides = false
}) => {
    const theme = useTheme()
    return (
        <Box
            sx={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                backgroundColor: theme.palette.background.paper,
                borderBottom: `1px solid ${theme.palette.divider}`,
                px: 2,
                pt: 1.5
            }}
        >
            <Stack direction='row' alignItems='flex-start' justifyContent='space-between' spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant='subtitle1' fontWeight={600} noWrap>
                        {title || 'Inspector'}
                    </Typography>
                    {subtitle && (
                        <Typography variant='caption' color='text.secondary' noWrap>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Stack direction='row' spacing={0.5}>
                    {onRerun && (
                        <Tooltip title='Re-run Step'>
                            <span>
                                <IconButton size='small' onClick={onRerun} disabled={!canRerun || rerunBusy}>
                                    <IconRefresh size={18} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}
                    {onWipe && (
                        <Tooltip title='Wipe debug state for this flow'>
                            <IconButton size='small' onClick={onWipe}>
                                <IconTrash size={18} />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title='Close Inspector'>
                        <IconButton size='small' onClick={onClose} aria-label='Close Inspector'>
                            <IconX size={18} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>
            <Tabs
                value={tab}
                onChange={(_, value) => onTabChange?.(value)}
                variant='scrollable'
                allowScrollButtonsMobile
                sx={{ mt: 1, minHeight: 36 }}
            >
                <Tab
                    value={INSPECTOR_TABS.DEBUG_STEP}
                    label={hasDebugStepOverrides ? 'Debug Step •' : 'Debug Step'}
                    sx={{ minHeight: 36 }}
                />
                <Tab value={INSPECTOR_TABS.LAST_RUN} label='Last Step Run' sx={{ minHeight: 36 }} />
                <Tab
                    value={INSPECTOR_TABS.NODE_VARS}
                    label={nodeVarsCount ? `Node Vars (${nodeVarsCount})` : 'Node Vars'}
                    sx={{ minHeight: 36 }}
                />
                <Tab
                    value={INSPECTOR_TABS.FLOW_STATE}
                    label={flowStateCount ? `Flow State (${flowStateCount})` : 'Flow State'}
                    sx={{ minHeight: 36 }}
                />
                <Tab value={INSPECTOR_TABS.GLOBALS} label='Globals' sx={{ minHeight: 36 }} />
            </Tabs>
        </Box>
    )
}

InspectorHeader.propTypes = {
    title: PropTypes.string,
    subtitle: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onRerun: PropTypes.func,
    onWipe: PropTypes.func,
    tab: PropTypes.string.isRequired,
    onTabChange: PropTypes.func,
    canRerun: PropTypes.bool,
    rerunBusy: PropTypes.bool,
    nodeVarsCount: PropTypes.number,
    flowStateCount: PropTypes.number,
    hasDebugStepOverrides: PropTypes.bool
}

export default InspectorHeader
