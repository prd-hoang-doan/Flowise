import PropTypes from 'prop-types'
import { Chip } from '@mui/material'

const COLORS = {
    added: 'success',
    changed: 'warning',
    removed: 'error'
}

const LABELS = {
    added: 'Added',
    changed: 'Changed',
    removed: 'Removed'
}

/**
 * Tiny status pill rendered against each row in the Variable Pool table. The
 * `unchanged` kind renders nothing — we don't want a sea of "unchanged" pills.
 */
const DiffBadge = ({ kind }) => {
    if (!kind || kind === 'unchanged') return null
    const color = COLORS[kind] ?? 'default'
    const label = LABELS[kind] ?? kind
    return <Chip size='small' label={label} color={color} variant='outlined' sx={{ height: 20, fontSize: '0.65rem' }} />
}

DiffBadge.propTypes = {
    kind: PropTypes.oneOf(['added', 'changed', 'removed', 'unchanged'])
}

export default DiffBadge
