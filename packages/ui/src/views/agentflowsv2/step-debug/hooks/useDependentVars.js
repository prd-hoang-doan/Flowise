import { useMemo } from 'react'

import { extractDependentRefs, computeMissingFromCache } from '../utils/dependentVarExtractor'
import { useStepDebug } from '../store/StepDebugContext'

/**
 * Live computation of "what variables does this node depend on?".
 *
 * Two inputs flow in:
 *   - `reactFlowNode` and `edges` (canvas truth) → extractDependentRefs
 *   - the step-debug store's debugVarsByScope cache → presence check
 *
 * Returns { all, missing, present } so the Inspector can show coverage
 * and the Run Step Form can render only the unsatisfied ones.
 */
export const useDependentVars = (reactFlowNode, edges) => {
    const ctx = useStepDebug()
    const debugVarsByScope = ctx?.state?.debugVarsByScope

    return useMemo(() => {
        const presentScopes = debugVarsByScope ?? {}
        const all = extractDependentRefs(reactFlowNode, edges ?? [])
        const missing = computeMissingFromCache(all, presentScopes)
        const missingKeys = new Set(missing.map((r) => r.ref))
        const present = all.filter((r) => !missingKeys.has(r.ref))
        return { all, missing, present }
    }, [reactFlowNode, edges, debugVarsByScope])
}
