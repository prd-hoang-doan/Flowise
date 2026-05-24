/**
 * Inspect the chain of nodes that a Step Run will exercise and synthesise a
 * friendly, typed field list so users don't have to hand-craft JSON for
 * inputs / form / webhook.
 *
 * Walked sources, in this priority order:
 *
 *  1. **Start node declarations** — when the upstream chain contains a
 *     `startAgentflow` node configured for `formInput`, each entry in its
 *     `formInputTypes` becomes a typed field (string / number / boolean /
 *     options). Items from `startState` become optional `$flow.state.*`
 *     fields with sensible defaults.
 *
 *  2. **Template references** — every `{{ … }}` template across the selected
 *     node + its ancestors that the backend would otherwise report as missing
 *     (see `extractDependentRefs`). System keys the backend resolves itself
 *     (`$chat_history`, `$current_date_time`, `$loop_count`) are dropped.
 *
 *  3. **Edge-only dependencies** — incoming edges whose source node has no
 *     persisted Debug Variable yet. Surfaced as opaque "node output" entries
 *     so the user can paste in a stand-in JSON payload.
 *
 * Each emitted field carries:
 *   - `ref`         — the canonical reference (`$question`, `$form.email`,
 *                     `$flow.state.mode`, `nodeId.output.content`, …) used as
 *                     the key in the reducer's `structured` map.
 *   - `namespace`   — 'system' | 'form' | 'webhook' | 'flow_state' | 'vars' | 'node'
 *   - `name`        — short label (form variable name, state key, …)
 *   - `label`       — UI label; falls back to `name` / `ref`.
 *   - `valueType`   — 'string' | 'number' | 'boolean' | 'options' | 'json'
 *   - `required`    — boolean (form fields are required by default; templates
 *                     are required; explicit "optional" startState entries
 *                     stay false).
 *   - `default`     — initial value to seed the input with.
 *   - `options`     — for `valueType==='options'`, the available labels.
 *   - `source`      — 'start' | 'template' | 'edge' (lets the UI explain
 *                     where the field came from).
 *   - `description` — optional helper text (e.g. node label for node outputs).
 */

const TEMPLATE_RE = /{{\s*([^}]+?)\s*}}/g

const NEVER_MISSING = new Set(['$chat_history', '$runtime_messages_length', '$current_date_time', '$loop_count', '$file_attachment'])

const classifyRef = (raw) => {
    const ref = raw.trim()
    if (!ref) return null
    if (NEVER_MISSING.has(ref)) return null

    if (ref === '$question') {
        return { ref, namespace: 'system', name: 'question', valueType: 'string', required: true, default: '' }
    }
    if (ref.startsWith('$flow.state.')) {
        const name = ref.slice('$flow.state.'.length).split('.')[0]
        return { ref: `$flow.state.${name}`, namespace: 'flow_state', name, valueType: 'string', required: true, default: '' }
    }
    if (ref.startsWith('$flow.')) return null
    if (ref.startsWith('$iteration')) return null
    if (ref.startsWith('$form.')) {
        const name = ref.slice('$form.'.length).split('.')[0]
        return { ref: `$form.${name}`, namespace: 'form', name, valueType: 'string', required: true, default: '' }
    }
    if (ref.startsWith('$webhook.')) {
        // Default to JSON because webhook payloads are commonly nested.
        const name = ref.slice('$webhook.'.length).split('.')[0]
        return { ref: `$webhook.${name}`, namespace: 'webhook', name, valueType: 'json', required: true, default: '' }
    }
    if (ref.startsWith('$vars.')) {
        const name = ref.slice('$vars.'.length).split('.')[0]
        return { ref: `$vars.${name}`, namespace: 'vars', name, valueType: 'string', required: false, default: '' }
    }

    // nodeId.output.path or bare nodeId
    const [head, ...rest] = ref.split('.')
    const isOutput = rest[0] === 'output' && rest.length > 1
    return {
        ref: isOutput ? ref : head,
        namespace: 'node',
        nodeId: head,
        outputPath: isOutput ? rest.slice(1).join('.') : null,
        name: isOutput ? rest.slice(1).join('.') : head,
        valueType: 'json',
        required: true,
        default: ''
    }
}

const extractRefsFromInputs = (inputs) => {
    let serialized
    try {
        serialized = typeof inputs === 'string' ? inputs : JSON.stringify(inputs ?? {})
    } catch {
        return []
    }
    const out = []
    let match
    TEMPLATE_RE.lastIndex = 0
    while ((match = TEMPLATE_RE.exec(serialized)) !== null) {
        const ref = (match[1] || '').trim()
        if (ref) out.push(ref)
    }
    return out
}

const walkUpstream = (nodes, edges, startId) => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const visited = new Set()
    const order = []
    const queue = [startId]
    while (queue.length) {
        const id = queue.shift()
        if (!id || visited.has(id)) continue
        visited.add(id)
        const node = byId.get(id)
        if (node) order.push(node)
        for (const edge of edges) {
            if (edge?.target === id && edge?.source && !visited.has(edge.source)) queue.push(edge.source)
        }
    }
    return order
}

const findStartNode = (visitedNodes) => visitedNodes.find((n) => n?.data?.name === 'startAgentflow') || null

/**
 * Read a Start node's `formInputTypes` config and turn each entry into a
 * typed field aligned with the backend's `$form.*` namespace.
 */
const startFormFields = (startNode) => {
    if (!startNode) return []
    const inputs = startNode.data?.inputs ?? {}
    if (inputs.startInputType !== 'formInput') return []
    const raw = Array.isArray(inputs.formInputTypes) ? inputs.formInputTypes : []
    return raw
        .filter((row) => row && typeof row.name === 'string' && row.name.length > 0)
        .map((row) => {
            const type = row.type || 'string'
            const base = {
                ref: `$form.${row.name}`,
                namespace: 'form',
                name: row.name,
                label: row.label || row.name,
                required: true,
                source: 'start',
                description: 'Declared by the Start node form'
            }
            if (type === 'number') return { ...base, valueType: 'number', default: '' }
            if (type === 'boolean') return { ...base, valueType: 'boolean', default: false }
            if (type === 'options') {
                const options = Array.isArray(row.addOptions)
                    ? row.addOptions.map((o) => (o && typeof o.option === 'string' ? o.option : null)).filter(Boolean)
                    : []
                return {
                    ...base,
                    valueType: 'options',
                    options,
                    default: options[0] ?? ''
                }
            }
            return { ...base, valueType: 'string', default: '' }
        })
}

/**
 * Read a Start node's `startState` array and turn each entry into an
 * optional `$flow.state.*` field. The Start node lets builders pre-seed
 * state keys; surfacing them gives users an obvious place to override
 * those defaults during a debug run.
 */
const startStateFields = (startNode) => {
    if (!startNode) return []
    const inputs = startNode.data?.inputs ?? {}
    const raw = Array.isArray(inputs.startState) ? inputs.startState : []
    return raw
        .filter((row) => row && typeof row.key === 'string' && row.key.length > 0)
        .map((row) => ({
            ref: `$flow.state.${row.key}`,
            namespace: 'flow_state',
            name: row.key,
            label: row.key,
            valueType: 'string',
            required: false,
            default: typeof row.value === 'string' ? row.value : '',
            source: 'start',
            description: 'Pre-seeded by the Start node'
        }))
}

/**
 * Merge two field lists by `ref`. Later entries override earlier ones but
 * preserve any richer metadata (label, options, default) from the loser.
 */
const mergeFields = (a, b) => {
    const byRef = new Map()
    for (const field of [...a, ...b]) {
        const existing = byRef.get(field.ref)
        if (!existing) {
            byRef.set(field.ref, { ...field })
        } else {
            byRef.set(field.ref, {
                ...existing,
                ...field,
                // Required if either side says so.
                required: existing.required || field.required,
                // Prefer the more specific label / valueType / options.
                label: field.label || existing.label,
                valueType: field.valueType || existing.valueType,
                options: field.options || existing.options,
                default: field.default !== undefined && field.default !== '' ? field.default : existing.default,
                source: existing.source === 'start' ? existing.source : field.source || existing.source
            })
        }
    }
    return Array.from(byRef.values())
}

/**
 * Drop fields that the backend will satisfy from persisted Debug Variables.
 * `presentScopes` is the step-debug context's `debugVarsByScope` map.
 */
const filterSatisfied = (fields, presentScopes) => {
    const has = (scopeKey, name) => {
        const rows = presentScopes?.[scopeKey] || []
        if (!name) return rows.length > 0
        return rows.some((row) => row.name === name)
    }
    return fields.filter((field) => {
        switch (field.namespace) {
            case 'flow_state':
                return !has('__flow_state__', field.name)
            case 'form':
                return !has('__form__', field.name)
            case 'webhook':
                return !has('__webhook__', field.name)
            case 'system':
                return !has('__system__', field.name)
            case 'node':
                return !has(field.nodeId, null)
            case 'vars':
                return !has('vars', field.name)
            default:
                return true
        }
    })
}

/**
 * Main entry: returns `{ fields, startNode, hasStart, satisfiedCount }`.
 *
 * `fields` is grouped + ordered for the UI:
 *   1. system (`$question`)
 *   2. form
 *   3. flow_state
 *   4. webhook
 *   5. node outputs (upstream that hasn't run yet)
 *   6. vars (workspace variables)
 *
 * Already-satisfied fields are dropped unless `includeSatisfied` is true
 * (DebugStepTab toggles this for the "show all" mode).
 */
export const inferDebugInputs = (selectedNodeId, nodes = [], edges = [], { presentScopes, includeSatisfied = false } = {}) => {
    if (!selectedNodeId) {
        return { fields: [], startNode: null, hasStart: false, totalDiscovered: 0 }
    }

    const upstream = walkUpstream(nodes, edges, selectedNodeId)
    const startNode = findStartNode(upstream)

    // Templates from every node in the upstream chain (so missing inputs
    // for a downstream LLM are surfaced even if they reference an
    // earlier-resolved state key).
    const templateFields = []
    for (const node of upstream) {
        for (const ref of extractRefsFromInputs(node?.data?.inputs)) {
            const classified = classifyRef(ref)
            if (classified) {
                templateFields.push({
                    ...classified,
                    label: classified.label || classified.name || classified.ref,
                    source: 'template'
                })
            }
        }
    }

    // Edge-derived node deps (predecessor nodes whose outputs the target
    // implicitly consumes via combineNodeInputs).
    const edgeFields = []
    for (const edge of edges) {
        if (edge?.target !== selectedNodeId || !edge?.source) continue
        const sourceNode = nodes.find((n) => n.id === edge.source)
        const label = sourceNode?.data?.label || edge.source
        edgeFields.push({
            ref: edge.source,
            namespace: 'node',
            nodeId: edge.source,
            outputPath: null,
            name: label,
            label,
            valueType: 'json',
            required: true,
            default: '',
            source: 'edge',
            description: 'Incoming edge — predecessor node output'
        })
    }

    // Start declarations carry the richest metadata (labels, option lists),
    // so they go in last and win the merge.
    let all = mergeFields(mergeFields(templateFields, edgeFields), mergeFields(startFormFields(startNode), startStateFields(startNode)))

    if (!includeSatisfied && presentScopes) {
        all = filterSatisfied(all, presentScopes)
    }

    const order = ['system', 'form', 'flow_state', 'webhook', 'node', 'vars']
    all.sort((a, b) => {
        const ai = order.indexOf(a.namespace)
        const bi = order.indexOf(b.namespace)
        if (ai !== bi) return ai - bi
        return (a.label || a.name || '').localeCompare(b.label || b.name || '')
    })

    return {
        fields: all,
        startNode,
        hasStart: Boolean(startNode),
        totalDiscovered: all.length
    }
}
