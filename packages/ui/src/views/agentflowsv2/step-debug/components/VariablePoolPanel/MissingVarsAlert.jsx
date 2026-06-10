import { useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, AlertTitle, Box, Chip, Collapse, IconButton, Stack } from '@mui/material'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'

/**
 * Collapsed alert that surfaces the snapshot's `missingVariables` list so
 * users can see what blocked downstream steps at this point in time. Hidden
 * entirely when the snapshot has no missing references.
 */
const MissingVarsAlert = ({ missing = [] }) => {
    const [open, setOpen] = useState(false)
    if (!missing || missing.length === 0) return null

    return (
        <Alert severity='warning' sx={{ alignItems: 'flex-start' }}>
            <Stack direction='row' alignItems='center' justifyContent='space-between' spacing={1}>
                <Box>
                    <AlertTitle sx={{ mb: 0 }}>
                        {missing.length} missing reference{missing.length === 1 ? '' : 's'}
                    </AlertTitle>
                </Box>
                <IconButton size='small' onClick={() => setOpen((v) => !v)} aria-label='Toggle missing variables'>
                    {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                </IconButton>
            </Stack>
            <Collapse in={open} unmountOnExit>
                <Stack direction='row' flexWrap='wrap' sx={{ mt: 1, gap: 0.5 }}>
                    {missing.map((ref) => (
                        <Chip key={ref} size='small' label={ref} variant='outlined' />
                    ))}
                </Stack>
            </Collapse>
        </Alert>
    )
}

MissingVarsAlert.propTypes = {
    missing: PropTypes.arrayOf(PropTypes.string)
}

export default MissingVarsAlert
