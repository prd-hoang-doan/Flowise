/**
 * Extract every variable reference a node depends on, used to drive the
 * RunStepForm "missing vars" experience.
 *
 * Two sources are merged:
 *
 *  1. Every `{{ ... }}` template found in stringified `node.data.inputs`.
 *     We deliberately scan the JSON-stringified form so deeply-nested
 *     template usage (e.g. inside arrays or condition predicates) is caught.
 *
 *  2. Every incoming edge `source` — predecessor nodes whose output the
 *     node implicitly consumes via `combineNodeInputs` even when the
 *     template syntax isn't used.
 *
 * Each reference is classified into a namespace so the form can render the
 * right input type and the missing-vars UI can group by scope. References
 * the backend doesn't expect users to provide (`$chat_history`,
 * `$current_date_time`, `$loop_count`, …) are filtered out.
 */

const TEMPLATE_RE = /{{\s*([^}]+?)\s*}}/g

const NEVER_MISSING_REFS = new Set(['$chat_history', '$runtime_messages_length', '$current_date_time', '$loop_count', '$file_attachment'])

const classify = (ref) => {
    if (NEVER_MISSING_REFS.has(ref)) return { ref, namespace: null }

    if (ref === '$question') return { ref, namespace: 'system', name: 'question' }

    if (ref.startsWith('$flow.state.')) {
        return { ref, namespace: 'flow_state', name: ref.slice('$flow.state.'.length) }
    }
    if (ref.startsWith('$flow.')) {
        return { ref, namespace: null }
    }
    if (ref.startsWith('$form.')) {
        return { ref, namespace: 'form', name: ref.slice('$form.'.length) }
    }
    if (ref.startsWith('$webhook.')) {
        return { ref, namespace: 'webhook', name: ref.slice('$webhook.'.length) }
    }
    if (ref.startsWith('$vars.')) {
        return { ref, namespace: 'vars', name: ref.slice('$vars.'.length) }
    }
    if (ref.startsWith('$iteration')) {
        return { ref, namespace: null }
    }

    // nodeId.output.path OR bare nodeId
    const [head, ...rest] = ref.split('.')
    return {
        ref,
        namespace: 'node',
        nodeId: head,
        outputPath: rest.length > 1 && rest[0] === 'output' ? rest.slice(1).join('.') : null
    }
}

const extractTemplateRefs = (value) => {
    if (value === null || value === undefined) return []
    let serialized
    try {
        serialized = typeof value === 'string' ? value : JSON.stringify(value)
    } catch {
        return []
    }
    if (typeof serialized !== 'string') return []
    const refs = []
    let match
    TEMPLATE_RE.lastIndex = 0
    while ((match = TEMPLATE_RE.exec(serialized)) !== null) {
        const raw = match[1].trim()
        if (raw) refs.push(raw)
    }
    return refs
}

/**
 * Returns every reference the node depends on, classified by namespace.
 *
 * @param {object} reactFlowNode - { id, data: { inputs }, parentNode? }
 * @param {Array<object>} edges  - ReactFlow edges
 * @returns {Array<{ ref, namespace, name?, nodeId?, outputPath?, source: 'template'|'edge' }>}
 */
export const extractDependentRefs = (reactFlowNode, edges = []) => {
    if (!reactFlowNode || !reactFlowNode.data) return []

    const out = []
    const seen = new Set()

    // dedupe key: node refs collapse on nodeId (so an explicit template ref
    // shadows a bare edge dep for the same predecessor). Everything else
    // keys on namespace+name.
    const keyFor = (c) => (c.namespace === 'node' ? `n:${c.nodeId}` : `${c.namespace}:${c.name ?? c.ref}`)

    const inputs = reactFlowNode.data.inputs ?? {}
    for (const ref of extractTemplateRefs(inputs)) {
        const c = classify(ref)
        if (!c.namespace) continue
        const key = keyFor(c)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ ...c, source: 'template' })
    }

    for (const edge of edges) {
        if (!edge || edge.target !== reactFlowNode.id) continue
        const sourceNodeId = edge.source
        if (!sourceNodeId) continue
        const c = { ref: sourceNodeId, namespace: 'node', nodeId: sourceNodeId, outputPath: null }
        const key = keyFor(c)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ ...c, source: 'edge' })
    }

    return out
}

/**
 * Filter `extractDependentRefs` output against the live debug-variable cache
 * to produce the missing-vars list the Run Step Form needs to render.
 *
 * `presentScopes` is a map from scope key (nodeId or sentinel) to the array
 * of names already captured under that scope.
 */
export const computeMissingFromCache = (refs, presentScopes = {}) => {
    const has = (scopeKey, name) => {
        const list = presentScopes[scopeKey] || []
        if (!name) return list.length > 0
        return list.some((row) => row.name === name)
    }

    return refs.filter((ref) => {
        switch (ref.namespace) {
            case 'flow_state':
                return !has('__flow_state__', ref.name)
            case 'form':
                return !has('__form__', ref.name)
            case 'webhook':
                return !has('__webhook__', ref.name)
            case 'system':
                return !has('__system__', ref.name)
            case 'vars':
                // $vars are workspace-scoped; presence checked against the
                // /variables endpoint cache passed in via presentScopes.vars.
                return !has('vars', ref.name)
            case 'node':
                return !has(ref.nodeId, null)
            default:
                return false
        }
    })
}
