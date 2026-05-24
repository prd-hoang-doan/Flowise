import { useState } from 'react'
import PropTypes from 'prop-types'

import { Box, Typography, Link } from '@mui/material'

/**
 * Renders a debug variable value with cheap truncation. Strings are clipped
 * at TRUNCATE_AT chars; objects/arrays render as compact JSON. A "Show full"
 * affordance reveals the full payload inline (no modal — keeps the inspector
 * scroll trivially predictable).
 */
const TRUNCATE_AT = 220

const stringify = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

const ValueCell = ({ value, valueType, isTruncated = false, sizeBytes }) => {
    const [expanded, setExpanded] = useState(false)
    const display = stringify(value)
    const needsTruncate = isTruncated || display.length > TRUNCATE_AT
    const shown = !expanded && needsTruncate ? `${display.slice(0, TRUNCATE_AT)}…` : display

    return (
        <Box>
            <Typography
                variant='body2'
                component='pre'
                sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: valueType === 'json' || valueType === 'array' ? 'monospace' : 'inherit',
                    m: 0
                }}
            >
                {shown || (value === null ? 'null' : '—')}
            </Typography>
            {needsTruncate && (
                <Link
                    component='button'
                    type='button'
                    variant='caption'
                    underline='hover'
                    onClick={() => setExpanded((v) => !v)}
                    sx={{ mt: 0.5 }}
                >
                    {expanded ? 'Show less' : 'Show full'}
                </Link>
            )}
            {typeof sizeBytes === 'number' && sizeBytes > 0 && (
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                    {sizeBytes} bytes
                </Typography>
            )}
        </Box>
    )
}

ValueCell.propTypes = {
    value: PropTypes.any,
    valueType: PropTypes.string,
    isTruncated: PropTypes.bool,
    sizeBytes: PropTypes.number
}

export default ValueCell
