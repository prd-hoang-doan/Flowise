import { Fragment, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box, Chip, Stack, Typography, Tooltip } from '@mui/material'

import ValueCell from '../Inspector/shared/ValueCell'
import DiffBadge from './DiffBadge'

/**
 * Flat, read-only rendering of the Variable Pool grouped by scope. Snapshot
 * rows render with full values; live rows (from the `debugVarsByScope`
 * cache) render the summary and lazy-load values via `onRequestValue` if
 * the caller wants — but in V1 we keep it pure summary to avoid stampeding
 * the value endpoint when the panel first opens.
 *
 * Removed entries (when scrubbing back) render faded so users can still
 * see what changed.
 */
const PoolTable = ({ rows, diffByKey, removedRows = [], emptyHint }) => {
    const grouped = useMemo(() => {
        const out = []
        let currentScope = null
        for (const row of rows) {
            if (row.scopeKey !== currentScope) {
                currentScope = row.scopeKey
                out.push({ kind: 'group', scopeKey: row.scopeKey, scopeLabel: row.scopeLabel })
            }
            out.push({ kind: 'row', row })
        }
        // Append removed rows at the bottom (also grouped) so users see deletions.
        if (removedRows && removedRows.length > 0) {
            out.push({ kind: 'group', scopeKey: '__removed__', scopeLabel: 'Removed' })
            for (const row of removedRows) out.push({ kind: 'row', row, removed: true })
        }
        return out
    }, [rows, removedRows])

    if (grouped.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant='body2' color='text.secondary'>
                    {emptyHint || 'No variables yet. Run a step to populate the Debug Variable Pool.'}
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {grouped.map((item, idx) => {
                if (item.kind === 'group') {
                    return (
                        <Box
                            key={`group-${item.scopeKey}-${idx}`}
                            sx={{
                                px: 2,
                                py: 0.75,
                                bgcolor: (t) => t.palette.action.hover,
                                position: 'sticky',
                                top: 0,
                                zIndex: 1
                            }}
                        >
                            <Typography variant='caption' fontWeight={700} sx={{ textTransform: 'uppercase' }}>
                                {item.scopeLabel}
                            </Typography>
                        </Box>
                    )
                }
                const row = item.row
                const diff = diffByKey?.get?.(row.refKey)
                return (
                    <Fragment key={`${row.refKey}-${idx}`}>
                        <Box
                            sx={{
                                px: 2,
                                py: 1,
                                borderBottom: (t) => `1px solid ${t.palette.divider}`,
                                opacity: item.removed ? 0.55 : 1
                            }}
                        >
                            <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1}>
                                <Stack direction='row' alignItems='center' spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant='body2' fontWeight={600} noWrap>
                                        {row.name}
                                    </Typography>
                                    <Chip size='small' label={row.valueType} variant='outlined' sx={{ height: 20 }} />
                                    {row.edited && (
                                        <Chip size='small' label='Edited' color='warning' variant='outlined' sx={{ height: 20 }} />
                                    )}
                                </Stack>
                                <Stack direction='row' alignItems='center' spacing={1}>
                                    <DiffBadge kind={item.removed ? 'removed' : diff} />
                                    {row.sizeBytes > 0 && (
                                        <Tooltip title={`${row.sizeBytes} bytes`}>
                                            <Typography variant='caption' color='text.secondary'>
                                                {row.sizeBytes}B
                                            </Typography>
                                        </Tooltip>
                                    )}
                                </Stack>
                            </Stack>
                            <Box sx={{ mt: 0.5 }}>
                                <ValueCell value={row.value} valueType={row.valueType} sizeBytes={0} />
                            </Box>
                        </Box>
                    </Fragment>
                )
            })}
        </Box>
    )
}

PoolTable.propTypes = {
    rows: PropTypes.array.isRequired,
    diffByKey: PropTypes.instanceOf(Map),
    removedRows: PropTypes.array,
    emptyHint: PropTypes.string
}

export default PoolTable
