import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'

import { initialStepDebugState, stepDebugReducer } from './stepDebugReducer'
import { STEP_DEBUG_ACTIONS as A } from './actions'

/**
 * Sibling to flowContext: the Step Debugger's canvas-scoped state lives here.
 * We do NOT integrate with Redux because the data is canvas-local (resetting
 * whenever the user navigates to a different chatflow). AbortControllers are
 * kept in a ref rather than reducer state because they are not serialisable
 * and don't drive any rendered output.
 */

const StepDebugContext = createContext(null)

export const StepDebugProvider = ({ chatflowId, children }) => {
    const [state, dispatch] = useReducer(stepDebugReducer, {
        ...initialStepDebugState,
        chatflowId: chatflowId ?? null
    })

    // Mutable, non-rendered state. Tracking AbortControllers in a ref keeps
    // the reducer pure and lets us cancel runs from outside React tree updates.
    const abortControllersRef = useRef(new Map())

    // Live ReactFlow graph snapshot. Stored in a ref (rather than reducer
    // state) so canvas drags / node-position updates don't cascade Inspector
    // re-renders. Components that need the graph call `getGraph()` on demand,
    // or subscribe via `graphVersion` if they want to re-derive on changes.
    const graphRef = useRef({ nodes: [], edges: [] })
    const graphVersionRef = useRef(0)
    // Force re-render of consumers that read the graph by bumping a counter.
    // We expose `graphVersion` in the context value so downstream `useMemo`
    // can declare it as a dependency without depending on the ref itself.
    const setGraph = useCallback((nodes, edges) => {
        graphRef.current = { nodes: nodes ?? [], edges: edges ?? [] }
        graphVersionRef.current += 1
    }, [])
    const getGraph = useCallback(() => graphRef.current, [])

    // When the user navigates to a different chatflow, clear all cached state
    // and abort any in-flight runs. Component tree under a new <StepDebugProvider>
    // would also reset, but the props-driven reset covers route changes that
    // reuse the same Provider instance.
    useEffect(() => {
        for (const controller of abortControllersRef.current.values()) {
            try {
                controller.abort()
            } catch {
                /* ignore */
            }
        }
        abortControllersRef.current.clear()
        dispatch({ type: A.RESET, chatflowId: chatflowId ?? null })
    }, [chatflowId])

    const value = useMemo(() => {
        return {
            state,
            dispatch,
            abortControllersRef,
            chatflowId,
            setGraph,
            getGraph
        }
    }, [state, chatflowId, setGraph, getGraph])

    return <StepDebugContext.Provider value={value}>{children}</StepDebugContext.Provider>
}

StepDebugProvider.propTypes = {
    chatflowId: PropTypes.string,
    children: PropTypes.node
}

export const useStepDebug = () => {
    const ctx = useContext(StepDebugContext)
    if (!ctx) {
        // Returning a no-op stub keeps consumers (e.g. NodeStepRunControl)
        // safe to render when mounted outside the canvas — they just won't
        // do anything. We log once so this is debuggable.
        if (typeof window !== 'undefined' && !window.__stepDebugWarned) {
            window.__stepDebugWarned = true
            // eslint-disable-next-line no-console
            console.warn('[step-debug] useStepDebug called outside <StepDebugProvider>. Step Debugger disabled.')
        }
        return null
    }
    return ctx
}

export default StepDebugContext
