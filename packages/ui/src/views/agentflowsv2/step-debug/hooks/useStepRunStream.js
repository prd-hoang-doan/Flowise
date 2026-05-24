import { useCallback, useRef } from 'react'

import stepRunApi from '@/api/step-run'
import { classifyStepRunError } from '../utils/stepDebugErrors'

/**
 * Thin React wrapper around `stepRunApi.runStepSSE` that owns one
 * AbortController per active stream and surfaces classified errors so
 * callers don't need to repeat the parsing dance.
 *
 * The hook stays "headless" — it doesn't dispatch to the step-debug store;
 * the caller (useStepRun) owns that side effect.
 */
export const useStepRunStream = () => {
    // Track in-flight controllers per nodeId so the consumer can call
    // `abort(nodeId)` from anywhere — even outside the React tree.
    const controllersRef = useRef(new Map())

    const start = useCallback(async ({ chatflowId, nodeId, body, onEvent, signal: externalSignal }) => {
        if (controllersRef.current.has(nodeId)) {
            // Defensive: avoid two concurrent runs on the same node.
            // Callers should also guard via runningNodeIds, but races happen.
            throw new Error(`Step Run already in flight for node ${nodeId}`)
        }
        const controller = new AbortController()
        controllersRef.current.set(nodeId, controller)

        // Chain an external signal (e.g. unmount cleanup) if provided.
        const onExternalAbort = () => controller.abort()
        if (externalSignal) {
            if (externalSignal.aborted) controller.abort()
            else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
        }

        try {
            await stepRunApi.runStepSSE(chatflowId, nodeId, body, {
                onEvent,
                signal: controller.signal
            })
        } catch (err) {
            const classified = classifyStepRunError(err)
            // Re-throw with classification attached so callers can switch
            // on `error.kind` without re-running the regex pipeline.
            const wrapped = Object.assign(new Error(classified.message), { kind: classified.kind, classified })
            throw wrapped
        } finally {
            controllersRef.current.delete(nodeId)
            if (externalSignal) externalSignal.removeEventListener?.('abort', onExternalAbort)
        }
    }, [])

    const abort = useCallback((nodeId) => {
        const controller = controllersRef.current.get(nodeId)
        if (controller) {
            try {
                controller.abort()
            } catch {
                /* ignore */
            }
        }
    }, [])

    const abortAll = useCallback(() => {
        for (const controller of controllersRef.current.values()) {
            try {
                controller.abort()
            } catch {
                /* ignore */
            }
        }
        controllersRef.current.clear()
    }, [])

    return { start, abort, abortAll }
}
