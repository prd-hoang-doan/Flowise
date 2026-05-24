import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'

import { useTheme } from '@mui/material/styles'
import { IconButton, Tooltip, CircularProgress } from '@mui/material'
import { IconPlayerPlayFilled, IconPlayerStopFilled } from '@tabler/icons-react'

import { useStepRun } from '../hooks/useStepRun'
import { useStepDebug } from '../store/StepDebugContext'
import { canStepRun, isDeferred } from '../utils/canStepRun'

/**
 * ▶/⏹ icon button injected into the AgentFlowNode action bar.
 *
 * Visibility rules:
 *   - Hidden entirely for non-allowlisted, non-deferred node types
 *     (e.g. stickyNoteAgentflow, future unknown node types).
 *   - Hidden for children of iteration / loop containers (server would
 *     reject the click anyway; hiding avoids the failed-attempt UX).
 *   - Rendered disabled with a tooltip for V1.1 deferred node types so
 *     the affordance is discoverable.
 *
 * Idle state: ▶ play icon. While a Step Run is in flight for this nodeId:
 * ⏹ stop icon over a small CircularProgress. Clicking the stop variant
 * aborts via the underlying AbortController.
 */
const NodeStepRunControl = ({ nodeId, nodeName, isChildNode = false }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const ctx = useStepDebug()

    const allowed = canStepRun(nodeName, isChildNode)
    const deferred = !allowed && isDeferred(nodeName) && !isChildNode

    const { run, abort, openInspector, isRunning, enabled } = useStepRun(nodeId, { nodeName, isChildNode })

    if (!ctx || !enabled) return null
    if (!allowed && !deferred) return null

    if (deferred) {
        return (
            <Tooltip title='Step Run for this node ships in V1.1' arrow>
                <span>
                    <IconButton
                        size='small'
                        aria-label='Step Run (coming in V1.1)'
                        disabled
                        sx={{ color: customization.isDarkMode ? 'white' : 'inherit' }}
                    >
                        <IconPlayerPlayFilled size={18} />
                    </IconButton>
                </span>
            </Tooltip>
        )
    }

    if (isRunning) {
        return (
            <Tooltip title='Stop Step Run' arrow>
                <IconButton
                    size='small'
                    aria-label='Stop Step Run'
                    onClick={() => abort()}
                    sx={{
                        color: theme.palette.error.main,
                        position: 'relative'
                    }}
                >
                    <CircularProgress
                        size={22}
                        thickness={3}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: theme.palette.error.main
                        }}
                    />
                    <IconPlayerStopFilled size={18} />
                </IconButton>
            </Tooltip>
        )
    }

    return (
        <Tooltip title='Run this step' arrow>
            <IconButton
                size='small'
                aria-label='Run Step'
                onClick={() => openInspector()}
                sx={{
                    color: customization.isDarkMode ? 'white' : 'inherit',
                    '&:hover': { color: theme.palette.success.main }
                }}
            >
                <IconPlayerPlayFilled size={18} />
            </IconButton>
        </Tooltip>
    )
}

NodeStepRunControl.propTypes = {
    nodeId: PropTypes.string.isRequired,
    nodeName: PropTypes.string.isRequired,
    isChildNode: PropTypes.bool
}

export default NodeStepRunControl
