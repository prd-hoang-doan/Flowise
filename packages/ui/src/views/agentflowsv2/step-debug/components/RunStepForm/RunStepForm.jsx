import { useEffect, useState, useMemo } from 'react'
import PropTypes from 'prop-types'

import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, Alert } from '@mui/material'

import MissingVarField from './MissingVarField'
import { useStepDebug } from '../../store/StepDebugContext'
import { useStepRun } from '../../hooks/useStepRun'
import { STEP_DEBUG_ACTIONS as A } from '../../store/actions'
import { coerceFromInput, estimateSizeBytes } from '../../utils/valueTypeInfer'
import { DEBUG_VAR_INLINE_MAX_BYTES } from '../../utils/constants'

/**
 * Parse a raw missing-variable reference string from the backend into the
 * same shape extractDependentRefs produces, so MissingVarField can render
 * it consistently. The backend list contains things like:
 *   - "$flow.state.mode"
 *   - "$form.email"
 *   - "$webhook.headers.x"
 *   - "$vars.api_key"
 *   - "$question"
 *   - "llmAgentflow_1.output.content"
 *   - "llmAgentflow_1" (bare)
 */
const parseMissingRef = (ref) => {
    if (ref === '$question') return { ref, namespace: 'system', name: 'question' }
    if (ref.startsWith('$flow.state.')) return { ref, namespace: 'flow_state', name: ref.slice('$flow.state.'.length) }
    if (ref.startsWith('$form.')) return { ref, namespace: 'form', name: ref.slice('$form.'.length) }
    if (ref.startsWith('$webhook.')) return { ref, namespace: 'webhook', name: ref.slice('$webhook.'.length) }
    if (ref.startsWith('$vars.')) return { ref, namespace: 'vars', name: ref.slice('$vars.'.length) }
    const [head, ...rest] = ref.split('.')
    return {
        ref,
        namespace: 'node',
        nodeId: head,
        outputPath: rest.length > 1 && rest[0] === 'output' ? rest.slice(1).join('.') : null
    }
}

const guessValueType = (reference) => {
    if (reference.namespace === 'node') return 'json'
    if (reference.namespace === 'flow_state' && reference.name === 'loop_count') return 'number'
    return 'string'
}

/**
 * Modal that opens when the backend reports STEP_RUN_MISSING_VARIABLES.
 * Submitting re-runs the step with the user-supplied values as `inputs`
 * (highest-priority layer of DebugVariablePool).
 */
const RunStepForm = () => {
    const ctx = useStepDebug()
    const { run } = useStepRun(ctx?.state?.pendingForm?.nodeId ?? '__noop__')

    const pending = ctx?.state?.pendingForm
    const [values, setValues] = useState({})
    const [errors, setErrors] = useState({})

    // Reset local form state whenever a new pending form arrives.
    useEffect(() => {
        if (pending) {
            const seed = {}
            for (const raw of pending.missingVariables ?? []) {
                seed[raw] = ''
            }
            setValues(seed)
            setErrors({})
        }
    }, [pending])

    const references = useMemo(
        () => (pending?.missingVariables ?? []).map(parseMissingRef),
        [pending?.missingVariables]
    )

    if (!pending || !ctx) return null

    const handleChange = (ref, raw) => {
        setValues((prev) => ({ ...prev, [ref]: raw }))
        setErrors((prev) => {
            const next = { ...prev }
            delete next[ref]
            return next
        })
    }

    const handleClose = () => {
        ctx.dispatch({ type: A.CLOSE_FORM })
    }

    const handleSubmit = async () => {
        const nextErrors = {}
        const inputs = {}
        let totalBytes = 0
        for (const reference of references) {
            const raw = values[reference.ref]
            const valueType = guessValueType(reference)
            try {
                const coerced = coerceFromInput(raw, valueType)
                inputs[reference.ref] = coerced
                totalBytes += estimateSizeBytes(coerced)
            } catch (err) {
                nextErrors[reference.ref] = err.message
            }
        }
        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors)
            return
        }
        if (totalBytes > DEBUG_VAR_INLINE_MAX_BYTES) {
            ctx.dispatch({
                type: A.SHOW_TOAST,
                severity: 'error',
                message: `Inputs total ${totalBytes} bytes — exceeds the ${DEBUG_VAR_INLINE_MAX_BYTES} byte cap.`
            })
            return
        }

        handleClose()
        await run({ inputs })
    }

    return (
        <Dialog open onClose={handleClose} maxWidth='sm' fullWidth>
            <DialogTitle>Provide missing variables</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Alert severity='info' variant='outlined'>
                        This node references {references.length} variable{references.length === 1 ? '' : 's'} that have
                        no captured value yet. Provide one-off values to continue.
                    </Alert>
                    {references.map((reference) => (
                        <MissingVarField
                            key={reference.ref}
                            reference={reference}
                            value={values[reference.ref]}
                            valueType={guessValueType(reference)}
                            onChange={(raw) => handleChange(reference.ref, raw)}
                            error={errors[reference.ref]}
                        />
                    ))}
                    {references.length === 0 && (
                        <Typography variant='body2' color='text.secondary'>
                            Nothing missing — go ahead and run.
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button variant='contained' onClick={handleSubmit}>
                    Run Step
                </Button>
            </DialogActions>
        </Dialog>
    )
}

RunStepForm.propTypes = {}

export default RunStepForm
