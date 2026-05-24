import { useState, useMemo, useEffect } from 'react'

import { Box, Stack, Alert } from '@mui/material'

import VariableRow from '../shared/VariableRow'
import ScopeFilter from '../shared/ScopeFilter'
import { useStepDebug } from '../../../store/StepDebugContext'
import { useDebugVariables } from '../../../hooks/useDebugVariables'
import { DEBUG_NODE_SENTINELS } from '../../../utils/constants'

const FlowStateTab = () => {
    const ctx = useStepDebug()
    const debugVars = useDebugVariables()
    const [query, setQuery] = useState('')

    const rows = ctx?.state?.debugVarsByScope?.[DEBUG_NODE_SENTINELS.FLOW_STATE] ?? []
    const valuesById = ctx?.state?.variableValuesById ?? {}

    // Re-fetch when the tab mounts so Flow State is fresh even if the user
    // arrived here without triggering a Step Run.
    useEffect(() => {
        debugVars.refreshAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const filtered = useMemo(() => {
        if (!query) return rows
        return rows.filter((r) => r.name.toLowerCase().includes(query))
    }, [rows, query])

    return (
        <Box p={2}>
            <Stack spacing={1.5}>
                <ScopeFilter onChange={setQuery} placeholder='Filter flow state keys…' />
                {filtered.length === 0 ? (
                    <Alert severity='info' variant='outlined'>
                        Flow State is empty for this builder. Run a node that calls <code>updateState(...)</code> or edit a key directly via
                        the Node Vars tab to seed it.
                    </Alert>
                ) : (
                    filtered.map((row) => (
                        <VariableRow
                            key={row.id}
                            summary={row}
                            value={valuesById[row.id]?.value}
                            onRequestValue={debugVars.getValue}
                            onUpdate={debugVars.update}
                            onReset={debugVars.reset}
                            onDelete={debugVars.remove}
                            editable
                        />
                    ))
                )}
            </Stack>
        </Box>
    )
}

export default FlowStateTab
