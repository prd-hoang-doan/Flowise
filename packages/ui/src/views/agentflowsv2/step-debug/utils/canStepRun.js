/**
 * Allowlist gate for the ▶ button on the AgentFlow canvas.
 *
 * Source of truth lives on the server in
 * packages/server/src/utils/agentflow-step-debug/constants.ts. Any drift will
 * surface as the controller rejecting the click with 422; we still gate
 * client-side so users never see a button they cannot use.
 *
 * V1.0 deferred nodes still show the button (disabled) with a tooltip so the
 * affordance is discoverable.
 */

const ALLOWED = new Set([
    'llmAgentflow',
    'agentAgentflow',
    'toolAgentflow',
    'retrieverAgentflow',
    'httpAgentflow',
    'customFunctionAgentflow',
    'conditionAgentflow',
    'conditionAgentAgentflow',
    'directReplyAgentflow'
])

const DEFERRED = new Set(['startAgentflow', 'iterationAgentflow', 'loopAgentflow', 'humanInputAgentflow', 'executeFlowAgentflow'])

export const canStepRun = (nodeName, isChildNode = false) => {
    if (isChildNode) return false
    return ALLOWED.has(nodeName)
}

export const isDeferred = (nodeName) => DEFERRED.has(nodeName)

export const STEP_RUN_ALLOWED_NODES = ALLOWED
export const STEP_RUN_DEFERRED_NODES = DEFERRED
