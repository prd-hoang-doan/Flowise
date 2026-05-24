import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { TextField, InputAdornment } from '@mui/material'
import { IconSearch } from '@tabler/icons-react'

/**
 * Debounced search input used at the top of variable lists. Emits the
 * current query string via onChange after a short delay so per-keystroke
 * filtering doesn't thrash large lists.
 */
const ScopeFilter = ({ placeholder = 'Filter variables…', onChange, initialValue = '', delay = 150 }) => {
    const [value, setValue] = useState(initialValue)

    useEffect(() => {
        const id = setTimeout(() => onChange?.(value.trim().toLowerCase()), delay)
        return () => clearTimeout(id)
    }, [value, delay, onChange])

    return (
        <TextField
            fullWidth
            size='small'
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            InputProps={{
                startAdornment: (
                    <InputAdornment position='start'>
                        <IconSearch size={16} />
                    </InputAdornment>
                )
            }}
        />
    )
}

ScopeFilter.propTypes = {
    placeholder: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    initialValue: PropTypes.string,
    delay: PropTypes.number
}

export default ScopeFilter
