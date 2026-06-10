/**
 * Constants shared across the Step Debugger frontend. Mirrors the backend
 * surface defined in packages/server/src/utils/agentflow-step-debug/constants.ts
 * and packages/server/src/Interface.ts. Any drift between client and server
 * will be caught by the controller integration tests on the backend side.
 */

export const DEBUG_NODE_SENTINELS = Object.freeze({
    FLOW_STATE: '__flow_state__',
    FORM: '__form__',
    WEBHOOK: '__webhook__',
    CHAT_HISTORY: '__chat_history__',
    SYSTEM: '__system__'
})

export const SENTINEL_TO_SCOPE = Object.freeze({
    [DEBUG_NODE_SENTINELS.FLOW_STATE]: 'flow_state',
    [DEBUG_NODE_SENTINELS.FORM]: 'form',
    [DEBUG_NODE_SENTINELS.WEBHOOK]: 'webhook',
    [DEBUG_NODE_SENTINELS.CHAT_HISTORY]: 'chat_history',
    [DEBUG_NODE_SENTINELS.SYSTEM]: 'system'
})

export const SCOPE_LABEL = Object.freeze({
    node: 'Node',
    flow_state: 'Flow State',
    form: 'Form',
    webhook: 'Webhook',
    system: 'System',
    chat_history: 'Chat History'
})

export const VALUE_TYPES = Object.freeze(['string', 'number', 'boolean', 'json', 'array', 'file'])

// Inline value size cap. Backend default is 64 KiB (env WORKFLOW_DEBUG_VAR_INLINE_MAX).
// We use the same default for client-side guard rails (Run Step Form, edit dialog)
// so the UI can warn before round-tripping.
export const DEBUG_VAR_INLINE_MAX_BYTES = 64 * 1024

export const INSPECTOR_TABS = Object.freeze({
    DEBUG_STEP: 'debugStep',
    LAST_RUN: 'lastRun',
    NODE_VARS: 'nodeVars',
    FLOW_STATE: 'flowState',
    GLOBALS: 'globals'
})

/**
 * Default value for the per-node "Debug Step" form. Stored as strings so
 * the user can keep partial / invalid JSON between sessions without us
 * having to round-trip through the parser on every keystroke.
 */
export const DEFAULT_RUN_INPUT = Object.freeze({
    question: '',
    sessionId: '',
    inputs: '',
    form: '',
    webhook: '',
    // Friendly per-field values keyed by canonical reference (e.g. `$form.topic`,
    // `$flow.state.mode`, `nodeId.output.content`). Populated by the Debug Step
    // tab's auto-detected fields. Folded into the request body alongside the
    // raw JSON fields above at submit time — raw JSON wins on conflict.
    structured: Object.freeze({}),
    // Inferred metadata for the keys in `structured` (ref -> { namespace,
    // valueType, options, … }). Cached so the Inspector "Re-run" and the
    // canvas play-button can compile a meta-aware body without re-walking
    // the graph themselves.
    structuredMeta: Object.freeze({})
})

// Sentinel `nodeId` -> tab the Inspector should focus when a row is opened.
export const SENTINEL_TO_TAB = Object.freeze({
    [DEBUG_NODE_SENTINELS.FLOW_STATE]: INSPECTOR_TABS.FLOW_STATE,
    [DEBUG_NODE_SENTINELS.FORM]: INSPECTOR_TABS.GLOBALS,
    [DEBUG_NODE_SENTINELS.WEBHOOK]: INSPECTOR_TABS.GLOBALS,
    [DEBUG_NODE_SENTINELS.SYSTEM]: INSPECTOR_TABS.GLOBALS,
    [DEBUG_NODE_SENTINELS.CHAT_HISTORY]: INSPECTOR_TABS.GLOBALS
})

/**
 * Variable Pool panel: bottom-anchored drawer that visualises the whole
 * Debug Variable Pool with a Redux-DevTools-style snapshot timeline.
 */
export const DEFAULT_VARIABLE_POOL_HEIGHT_PX = 320
export const MIN_VARIABLE_POOL_HEIGHT_PX = 200
// Upper bound is computed at drag time against `window.innerHeight` — exposed
// here for tests / persistence guard rails.
export const ABSOLUTE_MAX_VARIABLE_POOL_HEIGHT_PX = 1200

/**
 * Pseudo-snapshot id used by the Variable Pool to render the current
 * (live) `debugVarsByScope` cache instead of a historical row.
 */
export const LIVE_SNAPSHOT_SENTINEL = '__live__'
