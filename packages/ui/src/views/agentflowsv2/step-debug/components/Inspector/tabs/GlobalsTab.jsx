import { useEffect, useState } from 'react'

import { Box, Stack, Typography, Alert, Accordion, AccordionSummary, AccordionDetails, Chip, Link } from '@mui/material'
import { IconChevronDown, IconExternalLink } from '@tabler/icons-react'
import { Link as RouterLink } from 'react-router-dom'

import VariableRow from '../shared/VariableRow'
import { useStepDebug } from '../../../store/StepDebugContext'
import { useDebugVariables } from '../../../hooks/useDebugVariables'
import { DEBUG_NODE_SENTINELS } from '../../../utils/constants'
import variablesApi from '@/api/variables'

const Section = ({ title, count, children, defaultExpanded = false }) => (
    <Accordion defaultExpanded={defaultExpanded} disableGutters>
        <AccordionSummary expandIcon={<IconChevronDown size={18} />}>
            <Stack direction='row' alignItems='center' spacing={1}>
                <Typography variant='subtitle2'>{title}</Typography>
                {typeof count === 'number' && <Chip size='small' label={count} variant='outlined' />}
            </Stack>
        </AccordionSummary>
        <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
)

const renderRows = (rows, valuesById, debugVars, editable) => {
    if (!rows.length) {
        return (
            <Alert severity='info' variant='outlined'>
                No values captured yet.
            </Alert>
        )
    }
    return (
        <Stack spacing={1.5}>
            {rows.map((row) => (
                <VariableRow
                    key={row.id}
                    summary={row}
                    value={valuesById[row.id]?.value}
                    onRequestValue={debugVars.getValue}
                    onUpdate={editable ? debugVars.update : undefined}
                    onReset={editable ? debugVars.reset : undefined}
                    onDelete={editable ? debugVars.remove : undefined}
                    editable={editable}
                />
            ))}
        </Stack>
    )
}

const GlobalsTab = () => {
    const ctx = useStepDebug()
    const debugVars = useDebugVariables()
    const valuesById = ctx?.state?.variableValuesById ?? {}

    const systemRows = ctx?.state?.debugVarsByScope?.[DEBUG_NODE_SENTINELS.SYSTEM] ?? []
    const formRows = ctx?.state?.debugVarsByScope?.[DEBUG_NODE_SENTINELS.FORM] ?? []
    const webhookRows = ctx?.state?.debugVarsByScope?.[DEBUG_NODE_SENTINELS.WEBHOOK] ?? []

    // Re-fetch the System / Form / Webhook sentinels on mount so users
    // landing directly on Globals (without first running a Start node) see
    // current values instead of an empty list.
    useEffect(() => {
        debugVars.refreshAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // $vars come from a different API (workspace-scoped Variable entity).
    // We fetch lazily on mount and surface them read-only with a deep link
    // to the Settings → Variables page for editing.
    const [envVars, setEnvVars] = useState(null)
    useEffect(() => {
        let active = true
        variablesApi
            .getAllVariables()
            .then((res) => {
                if (!active) return
                setEnvVars(Array.isArray(res?.data) ? res.data : [])
            })
            .catch(() => {
                if (!active) return
                setEnvVars([])
            })
        return () => {
            active = false
        }
    }, [])

    return (
        <Box>
            <Section title='System' count={systemRows.length} defaultExpanded>
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
                    Read-only: <code>{`{{ $question }}`}</code>, <code>{`{{ $file_attachment }}`}</code>,{' '}
                    <code>{`{{ $current_date_time }}`}</code>.
                </Typography>
                {renderRows(systemRows, valuesById, debugVars, false)}
            </Section>

            <Section title='Form' count={formRows.length}>
                {renderRows(formRows, valuesById, debugVars, true)}
            </Section>

            <Section title='Webhook' count={webhookRows.length}>
                {renderRows(webhookRows, valuesById, debugVars, true)}
            </Section>

            <Section title='Env Variables ($vars)' count={envVars?.length ?? 0}>
                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                    <Typography variant='caption' color='text.secondary'>
                        Workspace-scoped, read-only here.
                    </Typography>
                    <Link
                        component={RouterLink}
                        to='/variables'
                        underline='hover'
                        target='_blank'
                        rel='noopener'
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                        Edit in Settings <IconExternalLink size={14} />
                    </Link>
                </Stack>
                {envVars === null && <Typography variant='body2'>Loading…</Typography>}
                {envVars !== null && envVars.length === 0 && (
                    <Alert severity='info' variant='outlined'>
                        No workspace variables defined.
                    </Alert>
                )}
                {envVars !== null && envVars.length > 0 && (
                    <Stack spacing={1}>
                        {envVars.map((v) => (
                            <Box
                                key={v.id}
                                sx={{
                                    py: 1,
                                    px: 1.5,
                                    borderRadius: 1,
                                    border: (t) => `1px solid ${t.palette.divider}`
                                }}
                            >
                                <Stack direction='row' alignItems='center' spacing={1}>
                                    <Typography variant='body2' fontWeight={600}>
                                        {v.name}
                                    </Typography>
                                    <Chip size='small' label={v.type} variant='outlined' />
                                </Stack>
                                <Typography variant='caption' color='text.secondary' sx={{ wordBreak: 'break-all' }}>
                                    {v.type === 'runtime' ? '(runtime-evaluated)' : v.value}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Section>
        </Box>
    )
}

export default GlobalsTab
