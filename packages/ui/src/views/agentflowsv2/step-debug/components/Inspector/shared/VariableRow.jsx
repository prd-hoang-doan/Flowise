import { useState } from 'react'
import PropTypes from 'prop-types'

import {
    Box,
    Stack,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    TextField,
    Button,
    Collapse
} from '@mui/material'
import { IconCopy, IconRotateClockwise, IconTrash, IconPencil, IconCheck, IconX } from '@tabler/icons-react'

import ValueCell from './ValueCell'
import { coerceFromInput, estimateSizeBytes } from '../../../utils/valueTypeInfer'
import { toTemplateReference } from '../../../utils/adapters'
import { DEBUG_VAR_INLINE_MAX_BYTES } from '../../../utils/constants'

/**
 * Single variable row in the Inspector. Encapsulates:
 *   - the value cell (with truncation)
 *   - inline edit -> PATCH
 *   - copy-as-`{{ ref }}` to clipboard
 *   - reset (re-derive from last run)
 *   - delete
 *
 * Value loading is the caller's responsibility — VariableRow renders the
 * cached value passed in via `value` and triggers `onRequestValue` lazily
 * when the user expands or edits a row whose value hasn't been fetched yet.
 */
const VariableRow = ({
    summary,
    value,
    onRequestValue,
    onUpdate,
    onReset,
    onDelete,
    editable = true
}) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)

    const handleCopyRef = async () => {
        const ref = toTemplateReference(summary)
        if (!ref) return
        try {
            await navigator.clipboard.writeText(ref)
        } catch {
            /* clipboard may not be available */
        }
    }

    const beginEdit = async () => {
        if (!editable || !summary.editable) return
        if (value === undefined && onRequestValue) {
            await onRequestValue(summary.id)
        }
        const initial = value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        setDraft(initial)
        setError(null)
        setEditing(true)
    }

    const cancelEdit = () => {
        setEditing(false)
        setError(null)
    }

    const commitEdit = async () => {
        try {
            const coerced = coerceFromInput(draft, summary.valueType)
            const size = estimateSizeBytes(coerced)
            if (size > DEBUG_VAR_INLINE_MAX_BYTES) {
                setError(`Value is ${size} bytes — exceeds the ${DEBUG_VAR_INLINE_MAX_BYTES} byte cap.`)
                return
            }
            setBusy(true)
            await onUpdate?.(summary.id, { value: coerced })
            setEditing(false)
        } catch (err) {
            setError(err?.message || 'Update failed')
        } finally {
            setBusy(false)
        }
    }

    const handleReset = async () => {
        setBusy(true)
        try {
            await onReset?.(summary.id)
        } finally {
            setBusy(false)
        }
    }

    const handleDelete = async () => {
        setBusy(true)
        try {
            await onDelete?.(summary.id)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Box
            sx={{
                py: 1.25,
                px: 1.5,
                borderRadius: 1,
                border: (t) => `1px solid ${t.palette.divider}`
            }}
        >
            <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.25 }}>
                        <Typography variant='body2' fontWeight={600} noWrap>
                            {summary.name}
                        </Typography>
                        <Chip size='small' label={summary.valueType} variant='outlined' />
                        {summary.edited && <Chip size='small' label='Edited' color='warning' variant='outlined' />}
                    </Stack>
                </Box>
                <Stack direction='row' spacing={0.25}>
                    <Tooltip title='Copy as template'>
                        <IconButton size='small' onClick={handleCopyRef} aria-label='Copy as template'>
                            <IconCopy size={16} />
                        </IconButton>
                    </Tooltip>
                    {editable && summary.editable && !editing && (
                        <Tooltip title='Edit value'>
                            <IconButton size='small' onClick={beginEdit} aria-label='Edit value' disabled={busy}>
                                <IconPencil size={16} />
                            </IconButton>
                        </Tooltip>
                    )}
                    {editable && (
                        <Tooltip title='Reset from last run'>
                            <IconButton size='small' onClick={handleReset} aria-label='Reset value' disabled={busy}>
                                <IconRotateClockwise size={16} />
                            </IconButton>
                        </Tooltip>
                    )}
                    {editable && (
                        <Tooltip title='Delete variable'>
                            <IconButton size='small' onClick={handleDelete} aria-label='Delete variable' disabled={busy}>
                                <IconTrash size={16} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>
            </Stack>

            <Box sx={{ mt: 0.75 }}>
                <ValueCell
                    value={value}
                    valueType={summary.valueType}
                    isTruncated={summary.isTruncated}
                    sizeBytes={summary.sizeBytes}
                />
            </Box>

            <Collapse in={editing} unmountOnExit>
                <Box sx={{ mt: 1 }}>
                    <TextField
                        fullWidth
                        size='small'
                        multiline={summary.valueType === 'json' || summary.valueType === 'array'}
                        minRows={summary.valueType === 'json' || summary.valueType === 'array' ? 3 : undefined}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        error={Boolean(error)}
                        helperText={error || `New value (type: ${summary.valueType})`}
                    />
                    <Stack direction='row' spacing={1} sx={{ mt: 1 }} justifyContent='flex-end'>
                        <Button size='small' onClick={cancelEdit} startIcon={<IconX size={14} />} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            size='small'
                            variant='contained'
                            onClick={commitEdit}
                            startIcon={<IconCheck size={14} />}
                            disabled={busy}
                        >
                            Save
                        </Button>
                    </Stack>
                </Box>
            </Collapse>
        </Box>
    )
}

VariableRow.propTypes = {
    summary: PropTypes.shape({
        id: PropTypes.string.isRequired,
        scope: PropTypes.string,
        nodeId: PropTypes.string,
        name: PropTypes.string.isRequired,
        valueType: PropTypes.string.isRequired,
        edited: PropTypes.bool,
        editable: PropTypes.bool,
        isTruncated: PropTypes.bool,
        sizeBytes: PropTypes.number
    }).isRequired,
    value: PropTypes.any,
    onRequestValue: PropTypes.func,
    onUpdate: PropTypes.func,
    onReset: PropTypes.func,
    onDelete: PropTypes.func,
    editable: PropTypes.bool
}

export default VariableRow
