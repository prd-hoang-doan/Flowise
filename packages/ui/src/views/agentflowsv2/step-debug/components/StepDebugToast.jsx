import { useEffect, useRef } from 'react'
import { useSnackbar } from 'notistack'

import { useStepDebug } from '../store/StepDebugContext'
import { STEP_DEBUG_ACTIONS as A } from '../store/actions'

/**
 * Bridges the step-debug reducer's `toast` field into the existing notistack
 * provider already mounted by the legacy app shell. Mounting this component
 * once (alongside Inspector / RunStepForm) is enough — no portal needed.
 */
const StepDebugToast = () => {
    const ctx = useStepDebug()
    const { enqueueSnackbar } = useSnackbar()
    const lastKeyRef = useRef(null)

    useEffect(() => {
        const toast = ctx?.state?.toast
        if (!toast || toast.key === lastKeyRef.current) return
        lastKeyRef.current = toast.key
        enqueueSnackbar(toast.message, {
            variant: toast.severity || 'default',
            autoHideDuration: 5000
        })
        // Reducer keeps the toast in state so a re-render with the same key
        // is a no-op. Dismiss it after enqueuing to keep the slot free.
        ctx?.dispatch({ type: A.DISMISS_TOAST })
    }, [ctx, enqueueSnackbar])

    return null
}

export default StepDebugToast
