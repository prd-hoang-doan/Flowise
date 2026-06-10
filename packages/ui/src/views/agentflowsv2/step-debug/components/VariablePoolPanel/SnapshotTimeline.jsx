import PropTypes from 'prop-types'
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material'
import { IconCheck, IconAlertCircle, IconHandStop, IconBolt } from '@tabler/icons-react'

import { LIVE_SNAPSHOT_SENTINEL } from '../../utils/constants'

const formatRelative = (date) => {
    if (!date) return ''
    const ms = Date.now() - new Date(date).getTime()
    if (ms < 1000) return 'just now'
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return new Date(date).toLocaleDateString()
}

const StatusIcon = ({ status }) => {
    if (status === 'FINISHED') return <IconCheck size={12} />
    if (status === 'ERROR') return <IconAlertCircle size={12} />
    if (status === 'STOPPED') return <IconHandStop size={12} />
    return <IconBolt size={12} />
}

StatusIcon.propTypes = { status: PropTypes.string }

const statusColor = (status) => {
    if (status === 'FINISHED') return 'success'
    if (status === 'ERROR') return 'error'
    if (status === 'STOPPED') return 'warning'
    return 'default'
}

/**
 * Horizontal scroll rail of snapshot chips, newest right, plus a pinned
 * "Live" chip on the far right that always reflects the current
 * `debugVarsByScope` cache. Clicking a chip selects that snapshot —
 * selection lives in the step-debug reducer so re-opening the panel
 * preserves the user's chosen viewpoint.
 */
const SnapshotTimeline = ({ snapshots = [], selectedSnapshotId, onSelect }) => {
    // Render oldest-left → newest-right so the timeline reads left-to-right.
    const ordered = [...snapshots].sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate))
    return (
        <Box
            sx={{
                overflowX: 'auto',
                overflowY: 'hidden',
                borderBottom: (t) => `1px solid ${t.palette.divider}`,
                px: 1.5,
                py: 1
            }}
        >
            <Stack direction='row' spacing={1} sx={{ minWidth: 'fit-content' }}>
                {ordered.map((snap) => {
                    const isSelected = snap.id === selectedSnapshotId
                    return (
                        <Tooltip
                            key={snap.id}
                            title={
                                <Box>
                                    <Typography variant='caption' sx={{ display: 'block' }}>
                                        {snap.nodeLabel || snap.nodeId}
                                    </Typography>
                                    <Typography variant='caption' sx={{ display: 'block' }}>
                                        {snap.status} · {snap.durationMs ?? '?'}ms
                                    </Typography>
                                    {snap.runArgs?.question && (
                                        <Typography variant='caption' sx={{ display: 'block' }}>
                                            question: {snap.runArgs.question}
                                        </Typography>
                                    )}
                                </Box>
                            }
                        >
                            <Chip
                                size='small'
                                icon={<StatusIcon status={snap.status} />}
                                color={statusColor(snap.status)}
                                variant={isSelected ? 'filled' : 'outlined'}
                                label={
                                    <Stack direction='row' spacing={0.5} alignItems='center'>
                                        <Typography variant='caption' fontWeight={600}>
                                            {snap.nodeLabel || snap.nodeId}
                                        </Typography>
                                        <Typography variant='caption' color='text.secondary'>
                                            {formatRelative(snap.createdDate)}
                                        </Typography>
                                    </Stack>
                                }
                                onClick={() => onSelect?.(snap.id)}
                                sx={{ flexShrink: 0 }}
                            />
                        </Tooltip>
                    )
                })}
                <Box sx={{ width: 8 }} />
                <Chip
                    size='small'
                    label='Live'
                    color='primary'
                    variant={selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL ? 'filled' : 'outlined'}
                    onClick={() => onSelect?.(LIVE_SNAPSHOT_SENTINEL)}
                    sx={{ flexShrink: 0, ml: 'auto' }}
                />
            </Stack>
        </Box>
    )
}

SnapshotTimeline.propTypes = {
    snapshots: PropTypes.array,
    selectedSnapshotId: PropTypes.string,
    onSelect: PropTypes.func
}

export default SnapshotTimeline
