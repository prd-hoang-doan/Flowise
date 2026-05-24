/**
 * Adapter between backend Step Debugger types and the shapes the observe
 * package expects. The Inspector's "Last Step Run" tab renders observe's
 * `<NodeExecutionDetail>`, which consumes an ExecutionTreeNode-shaped value
 * derived from `IAgentflowExecutedData`. Our DebugNodeExecution rows store
 * the same `data` payload but with metadata one level up; this module is
 * the single place where we reshape it.
 */

/**
 * @param {object} debugNodeExec - IDebugNodeExecution row from the backend
 * @returns {object | null} ExecutionTreeNode-shaped value, or null when
 * the input is null/undefined (the Inspector renders an empty state).
 */
export const toExecutionTreeNode = (debugNodeExec) => {
    if (!debugNodeExec) return null
    return {
        nodeId: debugNodeExec.nodeId,
        nodeLabel: debugNodeExec.nodeLabel,
        data: debugNodeExec.data ?? {},
        status: debugNodeExec.status,
        previousNodeIds: [],
        children: []
    }
}

/**
 * Build the `inputs` body for POST /debug/nodes/:id/run from a Run Step Form
 * submission. Inputs are flat key/value pairs where the key is the bare
 * variable reference (e.g. `$flow.state.mode`, `llmAgentflow_1.output.content`,
 * `$question`) and the value is the user-supplied JS value (already coerced
 * to the right type via `coerceFromInput`).
 *
 * Backend reads this map as the highest-priority layer of DebugVariablePool.
 */
export const toStepRunInputs = (formValues) => {
    const inputs = {}
    for (const [ref, value] of Object.entries(formValues || {})) {
        if (value === undefined) continue
        inputs[ref] = value
    }
    return inputs
}

/**
 * Bare convenience: given a DebugVariableSummary row, format a `{{ ... }}`
 * template the user can copy into another node's input.
 */
export const toTemplateReference = (summary) => {
    if (!summary) return ''
    switch (summary.scope) {
        case 'flow_state':
            return `{{ $flow.state.${summary.name} }}`
        case 'form':
            return `{{ $form.${summary.name} }}`
        case 'webhook':
            return `{{ $webhook.${summary.name} }}`
        case 'system':
            return summary.name === 'question' ? '{{ $question }}' : `{{ $${summary.name} }}`
        case 'chat_history':
            return '{{ $chat_history }}'
        case 'node':
        default:
            return `{{ ${summary.nodeId}.output.${summary.name} }}`
    }
}
