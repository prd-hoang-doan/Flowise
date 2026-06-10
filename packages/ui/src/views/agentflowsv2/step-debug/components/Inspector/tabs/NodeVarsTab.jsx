import { useEffect, useState, useMemo } from 'react'
import PropTypes from 'prop-types'

import { Box, Stack, Typography, Alert } from '@mui/material'

import VariableRow from '../shared/VariableRow'
import ScopeFilter from '../shared/ScopeFilter'
import { useStepDebug } from '../../../store/StepDebugContext'
import { useDebugVariables } from '../../../hooks/useDebugVariables'

const NodeVarsTab = ({ nodeId }) => {
    const ctx = useStepDebug()
    const debugVars = useDebugVariables()
    const [query, setQuery] = useState('')

    const rows = nodeId ? ctx?.state?.debugVarsByScope?.[nodeId] ?? [] : []
    const valuesById = ctx?.state?.variableValuesById ?? {}

    useEffect(() => {
        if (nodeId) debugVars.refreshForNode(nodeId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId])

    const filtered = useMemo(() => {
        if (!query) return rows
        return rows.filter((r) => {
            return r.name.toLowerCase().includes(query) || (r.valueType || '').toLowerCase().includes(query)
        })
    }, [rows, query])

    if (!nodeId) {
        return (
            <Box p={2}>
                <Typography variant='body2' color='text.secondary'>
                    Select a node to see its captured outputs.
                </Typography>
            </Box>
        )
    }

    return (
        <Box p={2}>
            <Stack spacing={1.5}>
                <ScopeFilter onChange={setQuery} placeholder='Filter outputs…' />
                {filtered.length === 0 ? (
                    <Alert severity='info' variant='outlined'>
                        No variables captured for this node yet.
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

NodeVarsTab.propTypes = {
    nodeId: PropTypes.string
}

export default NodeVarsTab
