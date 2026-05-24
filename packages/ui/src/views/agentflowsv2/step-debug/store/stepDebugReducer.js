import { STEP_DEBUG_ACTIONS as A } from './actions'
import { INSPECTOR_TABS, DEFAULT_RUN_INPUT } from '../utils/constants'

export const initialStepDebugState = Object.freeze({
    chatflowId: null,
    selectedNodeId: null,

    inspectorOpen: false,
    inspectorTab: INSPECTOR_TABS.DEBUG_STEP,
    inspectorWidthPx: 480,

    // Per-node Debug Step form values (strings, parsed at submit time).
    runInputsByNodeId: {},

    // Per-node in-flight runs. We track each independently because the
    // backend semaphore caps concurrency per (chatflowId, userId) — not
    // per node — so it is legal to run two distinct nodes at once.
    runningNodeIds: {}, // { [nodeId]: { startedAt: number } }

    pendingForm: null, // { nodeId, missingVariables: string[] } | null

    lastRunByNodeId: {}, // { [nodeId]: IDebugNodeExecution | null }
    debugVarsByScope: {}, // { [nodeIdOrSentinel]: IDebugVariableSummary[] }
    variableValuesById: {}, // { [varId]: { value, sizeBytes, edited, valueType } }

    toast: null // { severity, message, key }
})

let toastSeq = 0

export const stepDebugReducer = (state, action) => {
    switch (action.type) {
        case A.SET_SELECTED_NODE:
            return { ...state, selectedNodeId: action.nodeId ?? null }

        case A.OPEN_INSPECTOR: {
            const tab = action.tab ?? state.inspectorTab
            const selected = action.nodeId ?? state.selectedNodeId
            return { ...state, inspectorOpen: true, inspectorTab: tab, selectedNodeId: selected }
        }
        case A.CLOSE_INSPECTOR:
            return { ...state, inspectorOpen: false }
        case A.TOGGLE_INSPECTOR:
            return { ...state, inspectorOpen: !state.inspectorOpen }

        case A.SET_TAB:
            return { ...state, inspectorTab: action.tab }
        case A.SET_WIDTH:
            return { ...state, inspectorWidthPx: Math.max(360, Math.min(2400, Number(action.width) || 480)) }

        case A.START_RUN: {
            return {
                ...state,
                runningNodeIds: {
                    ...state.runningNodeIds,
                    [action.nodeId]: { startedAt: action.startedAt ?? Date.now() }
                }
            }
        }
        case A.FINISH_RUN: {
            const next = { ...state.runningNodeIds }
            delete next[action.nodeId]
            return { ...state, runningNodeIds: next }
        }

        case A.OPEN_FORM:
            return {
                ...state,
                pendingForm: {
                    nodeId: action.nodeId,
                    missingVariables: action.missingVariables ?? []
                }
            }
        case A.CLOSE_FORM:
            return { ...state, pendingForm: null }

        case A.MERGE_LAST_RUN:
            return {
                ...state,
                lastRunByNodeId: { ...state.lastRunByNodeId, [action.nodeId]: action.execution ?? null }
            }

        case A.MERGE_VARS: {
            // action.scopeKey is a real nodeId or sentinel; rows replace the slot
            // wholesale so deletions on the backend propagate cleanly.
            return {
                ...state,
                debugVarsByScope: { ...state.debugVarsByScope, [action.scopeKey]: action.rows ?? [] }
            }
        }

        case A.REPLACE_VARS: {
            // Atomic swap of the whole map. Used by refreshAll() so scopes that
            // no longer have any rows (e.g. after a wipe or backend deletion)
            // drop out of the cache instead of lingering as stale entries.
            return {
                ...state,
                debugVarsByScope: { ...(action.scopes ?? {}) }
            }
        }

        case A.MERGE_VAR_VALUE: {
            return {
                ...state,
                variableValuesById: {
                    ...state.variableValuesById,
                    [action.varId]: {
                        value: action.value,
                        sizeBytes: action.sizeBytes ?? 0,
                        edited: action.edited ?? false,
                        valueType: action.valueType ?? state.variableValuesById[action.varId]?.valueType ?? 'string'
                    }
                }
            }
        }

        case A.DELETE_VAR: {
            const nextScopes = { ...state.debugVarsByScope }
            const nextValues = { ...state.variableValuesById }
            for (const [scopeKey, rows] of Object.entries(nextScopes)) {
                const filtered = rows.filter((row) => row.id !== action.varId)
                if (filtered.length !== rows.length) nextScopes[scopeKey] = filtered
            }
            delete nextValues[action.varId]
            return { ...state, debugVarsByScope: nextScopes, variableValuesById: nextValues }
        }

        case A.WIPE_VARS:
            return { ...state, debugVarsByScope: {}, variableValuesById: {}, lastRunByNodeId: {} }

        case A.SET_RUN_INPUT: {
            if (!action.nodeId) return state
            const prev = state.runInputsByNodeId[action.nodeId] ?? DEFAULT_RUN_INPUT
            return {
                ...state,
                runInputsByNodeId: {
                    ...state.runInputsByNodeId,
                    [action.nodeId]: { ...prev, ...(action.patch ?? {}) }
                }
            }
        }

        case A.SET_RUN_INPUT_STRUCTURED: {
            // Partial patch into the per-field `structured` map. Setting a
            // value to `undefined` removes the entry — that's how the UI
            // signals "user cleared this field, don't send it".
            if (!action.nodeId || !action.ref) return state
            const prev = state.runInputsByNodeId[action.nodeId] ?? DEFAULT_RUN_INPUT
            const prevStructured = prev.structured ?? {}
            const nextStructured = { ...prevStructured }
            if (action.value === undefined) {
                delete nextStructured[action.ref]
            } else {
                nextStructured[action.ref] = action.value
            }
            return {
                ...state,
                runInputsByNodeId: {
                    ...state.runInputsByNodeId,
                    [action.nodeId]: { ...prev, structured: nextStructured }
                }
            }
        }

        case A.RESET_RUN_INPUT: {
            if (!action.nodeId) return state
            if (!(action.nodeId in state.runInputsByNodeId)) return state
            const next = { ...state.runInputsByNodeId }
            delete next[action.nodeId]
            return { ...state, runInputsByNodeId: next }
        }

        case A.SHOW_TOAST:
            return {
                ...state,
                toast: {
                    key: ++toastSeq,
                    severity: action.severity ?? 'info',
                    message: action.message ?? ''
                }
            }
        case A.DISMISS_TOAST:
            return { ...state, toast: null }

        case A.RESET:
            return { ...initialStepDebugState, chatflowId: action.chatflowId ?? null }

        default:
            return state
    }
}
