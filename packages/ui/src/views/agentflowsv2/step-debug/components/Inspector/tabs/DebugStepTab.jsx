import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import {
    Box,
    Stack,
    Typography,
    TextField,
    Button,
    Alert,
    Divider,
    IconButton,
    Tooltip,
    FormControlLabel,
    Switch,
    MenuItem,
    Chip,
    Accordion,
    AccordionSummary,
    AccordionDetails
} from '@mui/material'
import { IconPlayerPlayFilled, IconPlayerStopFilled, IconRotateClockwise, IconChevronDown, IconWand } from '@tabler/icons-react'

import { useStepDebug } from '../../../store/StepDebugContext'
import { useStepRun } from '../../../hooks/useStepRun'
import { STEP_DEBUG_ACTIONS as A } from '../../../store/actions'
import { DEFAULT_RUN_INPUT } from '../../../utils/constants'
import { compileRunInputBody, RunInputParseError } from '../../../utils/runInput'
import { inferDebugInputs } from '../../../utils/inferDebugInputs'

const NAMESPACE_HELP = {
    system: 'System variable',
    form: 'Provided by the Start form',
    flow_state: 'Flow state key',
    webhook: 'Webhook payload field',
    node: 'Output of a connected node',
    vars: 'Workspace variable'
}

const NAMESPACE_LABEL = {
    system: 'System',
    form: 'Form',
    flow_state: 'Flow State',
    webhook: 'Webhook',
    node: 'Node Output',
    vars: 'Env Variable'
}

/**
 * "Debug Step" tab — the primary surface for choosing what to send into a
 * Step Run before clicking ▶. Form values are persisted in the step-debug
 * reducer keyed by nodeId, so switching nodes or closing the Inspector
 * doesn't blow away the user's draft.
 *
 * UX layers, top → bottom:
 *
 *   1. **Detected inputs** — the auto-discovered list of fields this node
 *      actually depends on, computed by `inferDebugInputs` from the live
 *      ReactFlow graph (Start `formInputTypes`, Start `startState`,
 *      `{{ … }}` template references across the upstream chain). Each
 *      field renders with the right control (text / number / switch /
 *      select) so non-developers can fill them in without writing JSON.
 *
 *   2. **Advanced JSON overrides** — collapsed by default. Power users
 *      can still paste raw JSON for `inputs`, `form`, `webhook`. Raw
 *      JSON wins over structured values on conflict.
 *
 *   3. **Session controls** — `question` and `sessionId` always shown
 *      (they're cross-cutting concerns rather than per-node).
 */
const DebugStepTab = ({ nodeId }) => {
    const ctx = useStepDebug()
    const { run, abort, isRunning, enabled } = useStepRun(nodeId ?? '__noop__')
    const [advancedOpen, setAdvancedOpen] = useState(false)

    const formValues = useMemo(() => {
        if (!nodeId) return DEFAULT_RUN_INPUT
        return ctx?.state?.runInputsByNodeId?.[nodeId] ?? DEFAULT_RUN_INPUT
    }, [ctx, nodeId])

    // Pull the live ReactFlow graph from the StepDebug provider so we can
    // walk upstream from the selected node. `getGraph` reads a ref, so this
    // doesn't subscribe to graph mutations directly — we re-derive on every
    // render which is fine because inference is cheap and the tab is only
    // mounted while the Inspector is open.
    const graph = ctx?.getGraph?.() ?? { nodes: [], edges: [] }
    const presentScopes = ctx?.state?.debugVarsByScope

    const inferred = useMemo(() => {
        return inferDebugInputs(nodeId, graph.nodes, graph.edges, { presentScopes, includeSatisfied: true })
        // We deliberately key off node + graph identity + presentScopes — those
        // are the only inputs to inferDebugInputs. The graph object identity
        // changes whenever Canvas calls setGraph (see StepDebugContext).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, graph.nodes, graph.edges, presentScopes])

    // Cache the inferred field metadata on the per-node entry so re-runs
    // kicked off from the canvas play button or InspectorHeader can still
    // coerce structured values with the right types.
    useEffect(() => {
        if (!nodeId || !ctx?.dispatch) return
        const meta = {}
        for (const field of inferred.fields) meta[field.ref] = field
        ctx.dispatch({ type: A.SET_RUN_INPUT, nodeId, patch: { structuredMeta: meta } })
        // Only fire when the inferred set genuinely changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, inferred.fields.map((f) => f.ref).join('|')])

    if (!nodeId) {
        return (
            <Box p={2}>
                <Typography variant='body2' color='text.secondary'>
                    Select a node on the canvas to configure its Step Run inputs.
                </Typography>
            </Box>
        )
    }

    if (!enabled) {
        return (
            <Box p={2}>
                <Alert severity='warning' variant='outlined'>
                    Step Debugger context is not available on this canvas.
                </Alert>
            </Box>
        )
    }

    const patch = (field, value) => {
        ctx?.dispatch({ type: A.SET_RUN_INPUT, nodeId, patch: { [field]: value } })
    }

    const setStructured = (ref, value) => {
        ctx?.dispatch({ type: A.SET_RUN_INPUT_STRUCTURED, nodeId, ref, value })
    }

    const handleReset = () => {
        ctx?.dispatch({ type: A.RESET_RUN_INPUT, nodeId })
    }

    const handleRun = async () => {
        let body
        try {
            const meta = {}
            for (const field of inferred.fields) meta[field.ref] = field
            body = compileRunInputBody(formValues, meta).body
        } catch (err) {
            const message = err instanceof RunInputParseError ? err.message : err?.message || 'Invalid input'
            ctx?.dispatch({ type: A.SHOW_TOAST, severity: 'error', message })
            return
        }
        await run(body)
    }

    const renderStructuredField = (field) => {
        const stored = formValues.structured?.[field.ref]
        const value = stored !== undefined ? stored : field.default ?? ''
        const labelText = field.label || field.name || field.ref
        const namespaceLabel = NAMESPACE_LABEL[field.namespace] ?? field.namespace
        const helper = field.description || NAMESPACE_HELP[field.namespace] || `Resolves {{ ${field.ref} }} at run time.`

        const header = (
            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
                <Typography variant='body2' fontWeight={600}>
                    {labelText}
                </Typography>
                <Chip size='small' label={namespaceLabel} />
                {field.required && <Chip size='small' color='warning' variant='outlined' label='Required' />}
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                    {`{{ ${field.ref} }}`}
                </Typography>
            </Stack>
        )

        if (field.valueType === 'boolean') {
            return (
                <Box key={field.ref}>
                    {header}
                    <FormControlLabel
                        control={
                            <Switch
                                checked={Boolean(value)}
                                onChange={(e) => setStructured(field.ref, e.target.checked)}
                                inputProps={{ 'aria-label': field.ref }}
                            />
                        }
                        label={value ? 'true' : 'false'}
                    />
                    <Typography variant='caption' color='text.secondary' display='block'>
                        {helper}
                    </Typography>
                </Box>
            )
        }

        if (field.valueType === 'options') {
            return (
                <Box key={field.ref}>
                    {header}
                    <TextField
                        select
                        fullWidth
                        size='small'
                        value={value}
                        onChange={(e) => setStructured(field.ref, e.target.value)}
                        helperText={helper}
                    >
                        {(field.options ?? []).map((opt) => (
                            <MenuItem key={opt} value={opt}>
                                {opt}
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
            )
        }

        if (field.valueType === 'number') {
            return (
                <Box key={field.ref}>
                    {header}
                    <TextField
                        fullWidth
                        size='small'
                        type='number'
                        value={value}
                        onChange={(e) => setStructured(field.ref, e.target.value)}
                        helperText={helper}
                        inputProps={{ 'aria-label': field.ref }}
                    />
                </Box>
            )
        }

        const isJson = field.valueType === 'json' || field.valueType === 'array'
        return (
            <Box key={field.ref}>
                {header}
                <TextField
                    fullWidth
                    size='small'
                    multiline={isJson}
                    minRows={isJson ? 3 : undefined}
                    maxRows={isJson ? 10 : undefined}
                    value={value ?? ''}
                    onChange={(e) => setStructured(field.ref, e.target.value)}
                    placeholder={isJson ? '{"key":"value"}' : ''}
                    helperText={helper}
                    inputProps={{
                        'aria-label': field.ref,
                        style: isJson ? { fontFamily: 'monospace' } : undefined
                    }}
                />
            </Box>
        )
    }

    const fields = inferred.fields
    const requiredCount = fields.filter((f) => f.required).length

    return (
        <Box p={2}>
            <Stack spacing={2}>
                {fields.length > 0 ? (
                    <Alert severity={requiredCount > 0 ? 'info' : 'success'} variant='outlined' icon={<IconWand size={18} />}>
                        Detected {fields.length} input field{fields.length === 1 ? '' : 's'} this step depends on
                        {requiredCount > 0 ? ` (${requiredCount} required)` : ''}
                        {inferred.hasStart ? ' — sourced from the upstream Start node and template references.' : '.'}
                    </Alert>
                ) : (
                    <Alert severity='success' variant='outlined' icon={<IconWand size={18} />}>
                        No external inputs detected for this step. You can run it as-is, or use the advanced JSON overrides below.
                    </Alert>
                )}

                {fields.map(renderStructuredField)}

                {fields.length > 0 && <Divider flexItem />}

                <Box>
                    <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                        <Typography variant='subtitle2'>Question</Typography>
                        <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                            {`{{ $question }}`}
                        </Typography>
                    </Stack>
                    <TextField
                        fullWidth
                        size='small'
                        multiline
                        minRows={2}
                        maxRows={6}
                        value={formValues.question}
                        onChange={(e) => patch('question', e.target.value)}
                        placeholder='What should this node receive as the user question?'
                    />
                </Box>

                <Box>
                    <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                        <Typography variant='subtitle2'>Session ID</Typography>
                        <Typography variant='caption' color='text.secondary'>
                            Optional — used for chat memory grouping
                        </Typography>
                    </Stack>
                    <TextField
                        fullWidth
                        size='small'
                        value={formValues.sessionId}
                        onChange={(e) => patch('sessionId', e.target.value)}
                        placeholder='auto-generated when blank'
                    />
                </Box>

                <Accordion
                    expanded={advancedOpen}
                    onChange={(_, open) => setAdvancedOpen(open)}
                    disableGutters
                    elevation={0}
                    sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}
                >
                    <AccordionSummary expandIcon={<IconChevronDown size={18} />}>
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Typography variant='subtitle2'>Advanced JSON overrides</Typography>
                            <Chip size='small' label='Power users' variant='outlined' />
                        </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Stack spacing={2}>
                            <Typography variant='caption' color='text.secondary'>
                                Raw JSON here is merged on top of the detected fields above — keys in JSON win on conflict.
                            </Typography>

                            <Box>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                                    <Typography variant='subtitle2'>Inputs (Flow State overrides)</Typography>
                                    <Typography variant='caption' color='text.secondary'>
                                        JSON object
                                    </Typography>
                                </Stack>
                                <TextField
                                    fullWidth
                                    size='small'
                                    multiline
                                    minRows={3}
                                    maxRows={10}
                                    value={formValues.inputs}
                                    onChange={(e) => patch('inputs', e.target.value)}
                                    placeholder='{"mode":"pro","threshold":0.7}'
                                    inputProps={{ style: { fontFamily: 'monospace' } }}
                                />
                            </Box>

                            <Box>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                                    <Typography variant='subtitle2'>Form payload</Typography>
                                    <Typography variant='caption' color='text.secondary'>
                                        Seeds {`{{ $form.* }}`}
                                    </Typography>
                                </Stack>
                                <TextField
                                    fullWidth
                                    size='small'
                                    multiline
                                    minRows={3}
                                    maxRows={10}
                                    value={formValues.form}
                                    onChange={(e) => patch('form', e.target.value)}
                                    placeholder='{"email":"hello@example.com"}'
                                    inputProps={{ style: { fontFamily: 'monospace' } }}
                                />
                            </Box>

                            <Box>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                                    <Typography variant='subtitle2'>Webhook payload</Typography>
                                    <Typography variant='caption' color='text.secondary'>
                                        Seeds {`{{ $webhook.* }}`}
                                    </Typography>
                                </Stack>
                                <TextField
                                    fullWidth
                                    size='small'
                                    multiline
                                    minRows={3}
                                    maxRows={10}
                                    value={formValues.webhook}
                                    onChange={(e) => patch('webhook', e.target.value)}
                                    placeholder='{"headers":{"x-source":"github"}}'
                                    inputProps={{ style: { fontFamily: 'monospace' } }}
                                />
                            </Box>
                        </Stack>
                    </AccordionDetails>
                </Accordion>

                <Stack direction='row' spacing={1} alignItems='center' justifyContent='flex-end'>
                    <Tooltip title='Clear all Debug Step inputs for this node'>
                        <span>
                            <IconButton size='small' onClick={handleReset} aria-label='Reset Debug Step inputs'>
                                <IconRotateClockwise size={18} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    {isRunning ? (
                        <Button variant='contained' color='error' startIcon={<IconPlayerStopFilled size={16} />} onClick={() => abort()}>
                            Stop
                        </Button>
                    ) : (
                        <Button variant='contained' color='primary' startIcon={<IconPlayerPlayFilled size={16} />} onClick={handleRun}>
                            Run Step
                        </Button>
                    )}
                </Stack>
            </Stack>
        </Box>
    )
}

DebugStepTab.propTypes = {
    nodeId: PropTypes.string
}

export default DebugStepTab
