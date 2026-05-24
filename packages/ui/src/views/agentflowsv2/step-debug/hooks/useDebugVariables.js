import { useCallback } from 'react'

import debugVariablesApi from '@/api/debug-variables'
import { useStepDebug } from '../store/StepDebugContext'
import { STEP_DEBUG_ACTIONS as A } from '../store/actions'
import { classifyStepRunError } from '../utils/stepDebugErrors'

/**
 * CRUD facade over the /debug/variables endpoints with an in-memory cache
 * mirrored into the step-debug reducer. All methods are no-ops when used
 * outside <StepDebugProvider> (returns null from useStepDebug).
 *
 * We do NOT auto-fetch on mount — callers (Inspector tabs, RunStepForm)
 * trigger the right calls when they need data, which keeps render counts
 * predictable and avoids surprising network calls on canvas hover.
 */
export const useDebugVariables = () => {
    const ctx = useStepDebug()
    const dispatch = ctx?.dispatch
    const chatflowId = ctx?.chatflowId

    const toast = useCallback(
        (severity, message) => {
            if (!dispatch) return
            dispatch({ type: A.SHOW_TOAST, severity, message })
        },
        [dispatch]
    )

    const refreshForNode = useCallback(
        async (nodeId) => {
            if (!chatflowId || !nodeId) return []
            try {
                const res = await debugVariablesApi.listNodeVariables(chatflowId, nodeId)
                const rows = res?.data?.data ?? []
                // Group rows by scope key (nodeId or sentinel) so the reducer can
                // replace each slot atomically.
                const byScope = rows.reduce((acc, row) => {
                    const key = row.nodeId || nodeId
                    if (!acc[key]) acc[key] = []
                    acc[key].push(row)
                    return acc
                }, {})
                for (const [scopeKey, scopedRows] of Object.entries(byScope)) {
                    dispatch({ type: A.MERGE_VARS, scopeKey, rows: scopedRows })
                }
                return rows
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return []
            }
        },
        [chatflowId, dispatch, toast]
    )

    /**
     * Fetch every Debug Variable for the (chatflow, workspace, user) scope in
     * a single round trip and atomically swap the local cache. This is the
     * only call path that brings back the sentinel buckets (`__flow_state__`,
     * `__form__`, `__webhook__`, `__system__`) for non-Start nodes — the
     * per-node endpoint deliberately stays narrow for cost reasons.
     */
    const refreshAll = useCallback(async () => {
        if (!chatflowId) return []
        try {
            const res = await debugVariablesApi.listVariables(chatflowId)
            const rows = res?.data?.data ?? []
            const scopes = rows.reduce((acc, row) => {
                const key = row.nodeId
                if (!key) return acc
                if (!acc[key]) acc[key] = []
                acc[key].push(row)
                return acc
            }, {})
            dispatch({ type: A.REPLACE_VARS, scopes })
            return rows
        } catch (err) {
            toast('error', classifyStepRunError(err).message)
            return []
        }
    }, [chatflowId, dispatch, toast])

    const getValue = useCallback(
        async (varId) => {
            if (!chatflowId) return null
            try {
                const res = await debugVariablesApi.getVariable(chatflowId, varId)
                const row = res?.data ?? null
                if (row) {
                    dispatch({
                        type: A.MERGE_VAR_VALUE,
                        varId,
                        value: row.value,
                        sizeBytes: row.sizeBytes ?? 0,
                        edited: row.edited ?? false,
                        valueType: row.valueType
                    })
                }
                return row
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return null
            }
        },
        [chatflowId, dispatch, toast]
    )

    const update = useCallback(
        async (varId, body) => {
            if (!chatflowId) return null
            try {
                const res = await debugVariablesApi.updateVariable(chatflowId, varId, body)
                const row = res?.data ?? null
                if (row) {
                    dispatch({
                        type: A.MERGE_VAR_VALUE,
                        varId,
                        value: row.value,
                        sizeBytes: row.sizeBytes ?? 0,
                        edited: true,
                        valueType: row.valueType
                    })
                }
                return row
            } catch (err) {
                const classified = classifyStepRunError(err)
                toast('error', classified.message)
                throw err
            }
        },
        [chatflowId, dispatch, toast]
    )

    const reset = useCallback(
        async (varId) => {
            if (!chatflowId) return null
            try {
                const res = await debugVariablesApi.resetVariable(chatflowId, varId)
                const row = res?.data ?? null
                if (row?.deleted) {
                    dispatch({ type: A.DELETE_VAR, varId })
                } else if (row) {
                    dispatch({
                        type: A.MERGE_VAR_VALUE,
                        varId,
                        value: row.value,
                        sizeBytes: row.sizeBytes ?? 0,
                        edited: false,
                        valueType: row.valueType
                    })
                }
                return row
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return null
            }
        },
        [chatflowId, dispatch, toast]
    )

    const remove = useCallback(
        async (varId) => {
            if (!chatflowId) return false
            try {
                await debugVariablesApi.deleteVariable(chatflowId, varId)
                dispatch({ type: A.DELETE_VAR, varId })
                return true
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return false
            }
        },
        [chatflowId, dispatch, toast]
    )

    const wipe = useCallback(async () => {
        if (!chatflowId) return false
        try {
            await debugVariablesApi.wipeVariables(chatflowId)
            dispatch({ type: A.WIPE_VARS })
            return true
        } catch (err) {
            toast('error', classifyStepRunError(err).message)
            return false
        }
    }, [chatflowId, dispatch, toast])

    const fetchLastRun = useCallback(
        async (nodeId) => {
            if (!chatflowId || !nodeId) return null
            try {
                const res = await debugVariablesApi.getLastRun(chatflowId, nodeId)
                const exec = res?.data ?? null
                dispatch({ type: A.MERGE_LAST_RUN, nodeId, execution: exec })
                return exec
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return null
            }
        },
        [chatflowId, dispatch, toast]
    )

    return {
        enabled: Boolean(ctx),
        refreshForNode,
        refreshAll,
        getValue,
        update,
        reset,
        remove,
        wipe,
        fetchLastRun
    }
}
