import { useCallback } from 'react'

import debugSnapshotsApi from '@/api/debug-snapshots'
import { useStepDebug } from '../store/StepDebugContext'
import { STEP_DEBUG_ACTIONS as A } from '../store/actions'
import { LIVE_SNAPSHOT_SENTINEL } from '../utils/constants'
import { classifyStepRunError } from '../utils/stepDebugErrors'

/**
 * Read-only facade over the snapshot endpoints. Mirrors `useDebugVariables`:
 * lazy by design, dispatches into the step-debug reducer, and tolerant of
 * being called outside a `<StepDebugProvider>`.
 *
 * `list()` is light (no `variables` blob); `loadDetail()` fetches the
 * full payload for one snapshot only when the user selects it — keeping
 * the timeline cheap to render even for long sessions.
 */
export const useDebugSnapshots = () => {
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

    const list = useCallback(
        async (params) => {
            if (!chatflowId || !dispatch) return []
            dispatch({ type: A.SET_SNAPSHOTS_LOADING, loading: true })
            try {
                const res = await debugSnapshotsApi.listSnapshots(chatflowId, params)
                const rows = res?.data?.data ?? []
                dispatch({ type: A.SET_SNAPSHOTS, snapshots: rows })
                return rows
            } catch (err) {
                dispatch({ type: A.SET_SNAPSHOTS_LOADING, loading: false })
                toast('error', classifyStepRunError(err).message)
                return []
            }
        },
        [chatflowId, dispatch, toast]
    )

    const loadDetail = useCallback(
        async (snapshotId) => {
            if (!chatflowId || !dispatch) return null
            if (!snapshotId || snapshotId === LIVE_SNAPSHOT_SENTINEL) return null
            try {
                const res = await debugSnapshotsApi.getSnapshot(chatflowId, snapshotId)
                const detail = res?.data ?? null
                if (detail) {
                    dispatch({ type: A.MERGE_SNAPSHOT_DETAIL, snapshotId, detail })
                }
                return detail
            } catch (err) {
                toast('error', classifyStepRunError(err).message)
                return null
            }
        },
        [chatflowId, dispatch, toast]
    )

    const select = useCallback(
        (snapshotId) => {
            if (!dispatch) return
            dispatch({ type: A.SELECT_SNAPSHOT, snapshotId: snapshotId ?? LIVE_SNAPSHOT_SENTINEL })
        },
        [dispatch]
    )

    return {
        enabled: Boolean(ctx),
        list,
        loadDetail,
        select
    }
}
