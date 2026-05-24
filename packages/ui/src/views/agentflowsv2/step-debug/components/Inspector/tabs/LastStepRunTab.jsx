import { useEffect } from 'react'
import PropTypes from 'prop-types'

import { Box, Typography, Alert } from '@mui/material'

import { NodeExecutionDetails } from '@/views/agentexecutions/NodeExecutionDetails'
import { useStepDebug } from '../../../store/StepDebugContext'
import { useDebugVariables } from '../../../hooks/useDebugVariables'

/**
 * Renders the most recent IDebugNodeExecution for the selected node.
 *
 * Reuses the legacy <NodeExecutionDetails> component from the executions
 * viewer — it consumes the same INodeExecutionData shape the backend
 * persists into DebugNodeExecution.data, so we can pass `data` and `label`
 * straight through.
 *
 * If no run has been recorded yet (`lastRunByNodeId[nodeId]` is undefined),
 * we kick off a fetch via useDebugVariables.fetchLastRun.
 */
const LastStepRunTab = ({ nodeId }) => {
    const ctx = useStepDebug()
    const debugVars = useDebugVariables()
    const lastRun = nodeId ? ctx?.state?.lastRunByNodeId?.[nodeId] : null

    useEffect(() => {
        if (nodeId && lastRun === undefined) {
            debugVars.fetchLastRun(nodeId)
        }
    }, [nodeId, lastRun, debugVars])

    if (!nodeId) {
        return (
            <Box p={2}>
                <Typography variant='body2' color='text.secondary'>
                    Select a node on the canvas to inspect its last Step Run.
                </Typography>
            </Box>
        )
    }

    if (lastRun === undefined) {
        return (
            <Box p={2}>
                <Typography variant='body2' color='text.secondary'>
                    Loading last Step Run…
                </Typography>
            </Box>
        )
    }

    if (lastRun === null) {
        return (
            <Box p={2}>
                <Alert severity='info' variant='outlined'>
                    No Step Run recorded for this node yet. Click the play icon on the node to capture one.
                </Alert>
            </Box>
        )
    }

    return (
        <Box sx={{ padding: 2 }}>
            {lastRun.status && lastRun.status !== 'FINISHED' && (
                <Alert severity={lastRun.status === 'STOPPED' ? 'warning' : 'error'} sx={{ m: 2 }} variant='outlined'>
                    Last Step Run ended with status <strong>{lastRun.status}</strong>.
                </Alert>
            )}
            <NodeExecutionDetails
                data={lastRun.data || {}}
                label={lastRun.nodeLabel}
                status={lastRun.status}
                metadata={{ chatId: `debug:${nodeId}`, sessionId: `debug:${nodeId}` }}
                isPublic
            />
        </Box>
    )
}

LastStepRunTab.propTypes = {
    nodeId: PropTypes.string
}

export default LastStepRunTab
