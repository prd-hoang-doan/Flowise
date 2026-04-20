import PropTypes from 'prop-types'

import { Box } from '@mui/material'

// Plain textarea for code / data files. A full Monaco/CodeMirror integration
// is deferred per FRONTEND_PLAN Phase F-C; a monospace textarea is enough for
// MVP authoring and keeps the bundle size unchanged.
const SkillV2CodeEditor = ({ value, onChange, onBlur, disabled, placeholder }) => {
    return (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
            <Box
                component='textarea'
                value={value || ''}
                onChange={(e) => onChange?.(e.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                placeholder={placeholder}
                spellCheck={false}
                sx={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    p: 2,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: '0.85rem',
                    lineHeight: 1.55,
                    background: 'transparent',
                    color: 'text.primary',
                    whiteSpace: 'pre',
                    overflow: 'auto'
                }}
            />
        </Box>
    )
}

SkillV2CodeEditor.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    disabled: PropTypes.bool,
    placeholder: PropTypes.string
}

export default SkillV2CodeEditor
