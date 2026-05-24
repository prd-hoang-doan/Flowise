import { useEffect, useMemo, useRef } from 'react'

import { useTheme } from '@mui/material/styles'
import { Drawer, Box } from '@mui/material'

import InspectorHeader from './InspectorHeader'
import DebugStepTab from './tabs/DebugStepTab'
import LastStepRunTab from './tabs/LastStepRunTab'
import NodeVarsTab from './tabs/NodeVarsTab'
import FlowStateTab from './tabs/FlowStateTab'
import GlobalsTab from './tabs/GlobalsTab'

import { useStepDebug } from '../../store/StepDebugContext'
import { useDebugVariables } from '../../hooks/useDebugVariables'
import { useStepRun } from '../../hooks/useStepRun'
import { STEP_DEBUG_ACTIONS as A } from '../../store/actions'
import { INSPECTOR_TABS, DEBUG_NODE_SENTINELS } from '../../utils/constants'
import { compileRunInputBody } from '../../utils/runInput'

const MIN_WIDTH = 360
const MAX_WIDTH_PADDING = 400 // keep this many px of canvas visible

/**
 * Right-anchored, resizable Inspector drawer.
 *
 * The drawer is a controlled MUI Drawer with variant='persistent' so it
 * coexists with the canvas (the canvas itself does not reflow — same
 * pattern as ChatPopUp). Resizing is implemented via a left-edge handle
 * (mouse drag) so we don't take a runtime dependency on observe's
 * useResizableSidebar for this small surface.
 */
const Inspector = ({ resolveNodeLabel }) => {
    const theme = useTheme()
    const ctx = useStepDebug()
    const debugVars = useDebugVariables()
    const open = ctx?.state?.inspectorOpen ?? false
    const tab = ctx?.state?.inspectorTab ?? INSPECTOR_TABS.LAST_RUN
    const widthPx = ctx?.state?.inspectorWidthPx ?? 560
    const selectedNodeId = ctx?.state?.selectedNodeId ?? null
    const chatflowId = ctx?.chatflowId

    const { run, isRunning } = useStepRun(selectedNodeId ?? '__noop__')

    // Prime the variable cache whenever the Inspector first opens for a
    // chatflow. Without this, the Flow State and Globals tabs would only
    // populate after the user explicitly triggers a Step Run for a Start
    // node, because the per-node endpoint deliberately does NOT return the
    // sentinel buckets for non-Start nodes.
    useEffect(() => {
        if (!open || !chatflowId) return
        debugVars.refreshAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, chatflowId])

    const draggingRef = useRef(false)

    useEffect(() => {
        if (!draggingRef.current) return undefined
        const onMove = (e) => {
            if (!draggingRef.current || !ctx) return
            // Drawer is right-anchored, so dragging towards the left increases width.
            const next = Math.max(MIN_WIDTH, Math.min(window.innerWidth - MAX_WIDTH_PADDING, window.innerWidth - e.clientX))
            ctx.dispatch({ type: A.SET_WIDTH, width: next })
        }
        const onUp = () => {
            draggingRef.current = false
            document.body.style.userSelect = ''
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [ctx])

    const startDrag = () => {
        draggingRef.current = true
        document.body.style.userSelect = 'none'
    }

    const handleClose = () => ctx?.dispatch({ type: A.CLOSE_INSPECTOR })
    const handleTabChange = (next) => ctx?.dispatch({ type: A.SET_TAB, tab: next })

    const handleWipe = async () => {
        if (!ctx) return
        const ok = window.confirm('Wipe all Debug Variables and Step Run history for this flow?')
        if (!ok) return
        await debugVars.wipe()
    }

    const subtitle = useMemo(() => {
        if (!selectedNodeId) return ''
        return selectedNodeId
    }, [selectedNodeId])

    const title = useMemo(() => {
        if (!selectedNodeId) return 'Step Debugger'
        return resolveNodeLabel ? resolveNodeLabel(selectedNodeId) : selectedNodeId
    }, [selectedNodeId, resolveNodeLabel])

    const nodeVarsCount = selectedNodeId ? (ctx?.state?.debugVarsByScope?.[selectedNodeId] ?? []).length : 0
    const flowStateCount = (ctx?.state?.debugVarsByScope?.[DEBUG_NODE_SENTINELS.FLOW_STATE] ?? []).length

    const hasDebugStepOverrides = useMemo(() => {
        if (!selectedNodeId) return false
        const formValues = ctx?.state?.runInputsByNodeId?.[selectedNodeId]
        if (!formValues) return false
        try {
            return compileRunInputBody(formValues).hasOverrides
        } catch {
            // Parse errors still mean "user has typed something"; flag the tab.
            return true
        }
    }, [ctx, selectedNodeId])

    return (
        <Drawer
            anchor='right'
            variant='persistent'
            open={open}
            PaperProps={{
                sx: {
                    width: widthPx,
                    top: 70, // canvas AppBar height
                    height: 'calc(100vh - 70px)',
                    borderLeft: `1px solid ${theme.palette.divider}`,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            <Box
                onMouseDown={startDrag}
                aria-label='Resize Inspector'
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 4,
                    height: '100%',
                    cursor: 'col-resize',
                    zIndex: 3,
                    '&:hover': { backgroundColor: theme.palette.primary.main }
                }}
            />

            <InspectorHeader
                title={title}
                subtitle={subtitle}
                onClose={handleClose}
                onRerun={selectedNodeId ? () => run({}) : undefined}
                onWipe={handleWipe}
                tab={tab}
                onTabChange={handleTabChange}
                canRerun={Boolean(selectedNodeId)}
                rerunBusy={isRunning}
                nodeVarsCount={nodeVarsCount}
                flowStateCount={flowStateCount}
                hasDebugStepOverrides={hasDebugStepOverrides}
            />

            <Box sx={{ flex: 1, overflow: 'auto' }}>
                {tab === INSPECTOR_TABS.DEBUG_STEP && <DebugStepTab nodeId={selectedNodeId} />}
                {tab === INSPECTOR_TABS.LAST_RUN && <LastStepRunTab nodeId={selectedNodeId} />}
                {tab === INSPECTOR_TABS.NODE_VARS && <NodeVarsTab nodeId={selectedNodeId} />}
                {tab === INSPECTOR_TABS.FLOW_STATE && <FlowStateTab />}
                {tab === INSPECTOR_TABS.GLOBALS && <GlobalsTab />}
            </Box>
        </Drawer>
    )
}

export default Inspector
