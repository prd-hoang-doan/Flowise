/**
 * Action types for the StepDebugContext reducer. Kept as plain strings
 * (no Redux Toolkit) because the Step Debugger lives entirely inside the
 * canvas subtree — there is no app-wide store integration.
 */

export const STEP_DEBUG_ACTIONS = Object.freeze({
    SET_SELECTED_NODE: 'SET_SELECTED_NODE',
    OPEN_INSPECTOR: 'OPEN_INSPECTOR',
    CLOSE_INSPECTOR: 'CLOSE_INSPECTOR',
    TOGGLE_INSPECTOR: 'TOGGLE_INSPECTOR',
    SET_TAB: 'SET_TAB',
    SET_WIDTH: 'SET_WIDTH',
    START_RUN: 'START_RUN',
    FINISH_RUN: 'FINISH_RUN',
    OPEN_FORM: 'OPEN_FORM',
    CLOSE_FORM: 'CLOSE_FORM',
    MERGE_LAST_RUN: 'MERGE_LAST_RUN',
    MERGE_VARS: 'MERGE_VARS',
    REPLACE_VARS: 'REPLACE_VARS',
    MERGE_VAR_VALUE: 'MERGE_VAR_VALUE',
    DELETE_VAR: 'DELETE_VAR',
    WIPE_VARS: 'WIPE_VARS',
    SET_RUN_INPUT: 'SET_RUN_INPUT',
    SET_RUN_INPUT_STRUCTURED: 'SET_RUN_INPUT_STRUCTURED',
    RESET_RUN_INPUT: 'RESET_RUN_INPUT',
    SHOW_TOAST: 'SHOW_TOAST',
    DISMISS_TOAST: 'DISMISS_TOAST',
    RESET: 'RESET'
})
