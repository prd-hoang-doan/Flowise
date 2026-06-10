import { useCallback } from 'react'

import { useStepDebug } from '../store/StepDebugContext'
import { useStepRunStream } from './useStepRunStream'
import { useDebugVariables } from './useDebugVariables'
import { useDebugSnapshots } from './useDebugSnapshots'
import { STEP_DEBUG_ACTIONS as A } from '../store/actions'
import { INSPECTOR_TABS } from '../utils/constants'
import { canStepRun, isDeferred } from '../utils/canStepRun'
import { compileRunInputBody, RunInputParseError } from '../utils/runInput'

/**
 * Top-level orchestration of a Step Run.
 *
 * Lifecycle:
 *   run()    → gate via canStepRun → START_RUN → SSE stream → MERGE_LAST_RUN
 *              → refresh node vars cache → FINISH_RUN
 *
 *   On 422 STEP_RUN_MISSING_VARIABLES → OPEN_FORM(missingVariables)
 *   On 422 deferred / unsupported     → toast
 *   On 413 / 429 / 5xx                → toast
 *   On AbortError                     → FINISH_RUN, banner "aborted"
 *
 * abort() cancels the in-flight stream via useStepRunStream.
 */
export const useStepRun = (nodeId, { nodeName, isChildNode = false } = {}) => {
    const ctx = useStepDebug()
    const stream = useStepRunStream()
    const debugVars = useDebugVariables()
    const snapshots = useDebugSnapshots()

    const dispatch = ctx?.dispatch
    const chatflowId = ctx?.chatflowId
    const isRunning = Boolean(ctx?.state?.runningNodeIds?.[nodeId])

    const run = useCallback(
        async (bodyArg) => {
            if (!ctx || !dispatch || !chatflowId) return
            if (nodeName && !canStepRun(nodeName, isChildNode)) {
                if (nodeName && isDeferred(nodeName)) {
                    dispatch({ type: A.SHOW_TOAST, severity: 'info', message: 'Step Run for this node ships in V1.1.' })
                }
                return
            }
            if (isRunning) return

            // Body resolution order:
            //   1. Explicit `bodyArg` passed in (used by RunStepForm submit
            //      where missing variables are already coerced).
            //   2. Persisted Debug Step form values for this node.
            //   3. Empty body (backend applies its own defaults).
            let body
            if (bodyArg && typeof bodyArg === 'object') {
                body = bodyArg
            } else {
                const formValues = ctx.state?.runInputsByNodeId?.[nodeId]
                try {
                    // Forward the cached field metadata so structured values
                    // (numbers, booleans, JSON) get coerced correctly even
                    // when the user kicks off a re-run from outside DebugStepTab.
                    body = compileRunInputBody(formValues, formValues?.structuredMeta).body
                } catch (err) {
                    const message = err instanceof RunInputParseError ? err.message : err?.message || 'Invalid Debug Step input'
                    dispatch({ type: A.SHOW_TOAST, severity: 'error', message })
                    dispatch({ type: A.OPEN_INSPECTOR, nodeId, tab: INSPECTOR_TABS.DEBUG_STEP })
                    return
                }
            }

            dispatch({ type: A.START_RUN, nodeId })
            // dispatch({ type: A.OPEN_INSPECTOR, nodeId, tab: INSPECTOR_TABS.DEBUG_STEP })

            try {
                await stream.start({
                    chatflowId,
                    nodeId,
                    body,
                    onEvent: (event, data) => {
                        if (event === 'agentFlowExecutedData' && Array.isArray(data) && data[0]) {
                            const frame = data[0]
                            dispatch({
                                type: A.MERGE_LAST_RUN,
                                nodeId,
                                execution: {
                                    nodeId: frame.nodeId,
                                    nodeLabel: frame.nodeLabel,
                                    data: frame.data,
                                    status: frame.status ?? 'INPROGRESS',
                                    createdDate: new Date().toISOString()
                                }
                            })
                        }
                    }
                })
                // Refresh persisted state after the stream drains. We don't
                // try to derive variables from SSE frames; the backend saver
                // is the source of truth and a single GET keeps it simple.
                //
                // `refreshAll` is required (not `refreshForNode`) because the
                // per-node endpoint never returns the `__flow_state__` /
                // `__system__` / `__form__` / `__webhook__` sentinel buckets
                // for anything other than a Start node, so otherwise the
                // Flow State + Globals tabs would never populate.
                await debugVars.refreshAll()
                await debugVars.fetchLastRun(nodeId)
                // Refresh the snapshot timeline so the Variable Pool panel
                // picks up the row the StepRunner just captured. Best-effort:
                // the hook tolerates an absent provider and snapshots are
                // purely informational, never gating.
                if (snapshots?.enabled) {
                    snapshots.list()
                }
            } catch (err) {
                const kind = err?.kind ?? 'unknown'
                if (kind === 'missing_vars') {
                    dispatch({
                        type: A.OPEN_FORM,
                        nodeId,
                        missingVariables: err?.classified?.missingVariables ?? []
                    })
                } else if (kind === 'aborted') {
                    dispatch({ type: A.SHOW_TOAST, severity: 'info', message: 'Step Run aborted.' })
                } else {
                    dispatch({
                        type: A.SHOW_TOAST,
                        severity: 'error',
                        message: err?.message || 'Step Run failed'
                    })
                }
            } finally {
                dispatch({ type: A.FINISH_RUN, nodeId })
            }
        },
        [ctx, dispatch, chatflowId, nodeId, nodeName, isChildNode, isRunning, stream, debugVars, snapshots]
    )

    const abort = useCallback(() => {
        stream.abort(nodeId)
    }, [stream, nodeId])

    const openInspector = useCallback(() => {
        if (!ctx || !dispatch) return
        dispatch({ type: A.OPEN_INSPECTOR, nodeId, tab: INSPECTOR_TABS.DEBUG_STEP })
    }, [ctx, dispatch, nodeId])

    return { run, abort, openInspector, isRunning, enabled: Boolean(ctx) }
}
