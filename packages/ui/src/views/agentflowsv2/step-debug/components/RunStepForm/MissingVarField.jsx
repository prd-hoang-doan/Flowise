import PropTypes from 'prop-types'

import { TextField, FormControlLabel, Switch, Box, Typography, Chip } from '@mui/material'

const FIELD_LABEL_BY_NAMESPACE = {
    flow_state: 'Flow State',
    form: 'Form',
    webhook: 'Webhook',
    system: 'System',
    vars: 'Env Variable',
    node: 'Node Output'
}

/**
 * Single field row inside RunStepForm. Renders the right input affordance
 * based on the inferred valueType (string fallback for unknown types).
 *
 * Value is owned by the parent (RunStepForm) — this component is presentational
 * apart from emitting `(rawValue) => void` on every change.
 */
const MissingVarField = ({ reference, value, valueType, onChange, error }) => {
    const namespaceLabel = FIELD_LABEL_BY_NAMESPACE[reference.namespace] ?? reference.namespace
    const helperText = error || `Resolves the {{ ${reference.ref} }} template at run time.`

    if (valueType === 'boolean') {
        return (
            <Box>
                <FormControlLabel
                    control={
                        <Switch
                            checked={Boolean(value)}
                            onChange={(e) => onChange(e.target.checked)}
                            inputProps={{ 'aria-label': reference.ref }}
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant='body2' fontWeight={500}>
                                {reference.ref}
                            </Typography>
                            <Chip size='small' label={namespaceLabel} />
                        </Box>
                    }
                />
                <Typography variant='caption' color={error ? 'error' : 'text.secondary'}>
                    {helperText}
                </Typography>
            </Box>
        )
    }

    const multiline = valueType === 'json' || valueType === 'array'

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant='body2' fontWeight={500}>
                    {reference.ref}
                </Typography>
                <Chip size='small' label={namespaceLabel} />
                <Chip size='small' variant='outlined' label={valueType} />
            </Box>
            <TextField
                fullWidth
                size='small'
                multiline={multiline}
                minRows={multiline ? 3 : undefined}
                maxRows={multiline ? 10 : undefined}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                error={Boolean(error)}
                helperText={helperText}
                inputProps={{ 'aria-label': reference.ref }}
                placeholder={multiline ? '{ "key": "value" }' : ''}
            />
        </Box>
    )
}

MissingVarField.propTypes = {
    reference: PropTypes.shape({
        ref: PropTypes.string.isRequired,
        namespace: PropTypes.string.isRequired,
        name: PropTypes.string,
        nodeId: PropTypes.string
    }).isRequired,
    value: PropTypes.any,
    valueType: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    error: PropTypes.string
}

export default MissingVarField
