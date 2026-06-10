import { DEBUG_NODE_SENTINELS } from './constants'

/**
 * Common row shape consumed by `PoolTable`. Both snapshot payloads (from
 * the backend) and the live `debugVarsByScope` reducer cache flatten into
 * the same array so a single table component can render either source.
 *
 * Each row keeps the `scopeKey` (real nodeId or one of the
 * `DEBUG_NODE_SENTINELS` values) and a human-readable `scopeLabel` derived
 * from the canvas graph passed in as `nodesById`.
 */

const SCOPE_LABELS = {
    [DEBUG_NODE_SENTINELS.SYSTEM]: 'System',
    [DEBUG_NODE_SENTINELS.FORM]: 'Form',
    [DEBUG_NODE_SENTINELS.WEBHOOK]: 'Webhook',
    [DEBUG_NODE_SENTINELS.FLOW_STATE]: 'Flow State',
    [DEBUG_NODE_SENTINELS.CHAT_HISTORY]: 'Chat History'
}

// Render order: globals first (system → form → webhook → flow_state →
// chat_history), then per-node outputs. Matches the Inspector's mental model.
const SCOPE_SORT_ORDER = [
    DEBUG_NODE_SENTINELS.SYSTEM,
    DEBUG_NODE_SENTINELS.FORM,
    DEBUG_NODE_SENTINELS.WEBHOOK,
    DEBUG_NODE_SENTINELS.FLOW_STATE,
    DEBUG_NODE_SENTINELS.CHAT_HISTORY
]

export const scopeLabelFor = (scopeKey, nodesById = {}) => {
    if (SCOPE_LABELS[scopeKey]) return SCOPE_LABELS[scopeKey]
    const node = nodesById[scopeKey]
    return node?.data?.label || scopeKey
}

export const scopeSortKey = (scopeKey) => {
    const idx = SCOPE_SORT_ORDER.indexOf(scopeKey)
    // Sentinels come first (idx 0..4), then real nodes alphabetically (huge offset).
    return idx >= 0 ? idx : 1000 + scopeKey.localeCompare('')
}

/**
 * Normalise a single source (snapshot payload OR live debugVarsByScope) into
 * a flat row array. The source is the union of both:
 *
 * - snapshot payload: `{ [scopeKey]: [{ id, name, valueType, value, sizeBytes, edited, visible }] }`
 * - live cache:       `{ [scopeKey]: [IDebugVariableSummary] }`  (no `value` field — summaries only)
 *
 * We treat absent values as `undefined` so the diff util can flag them as
 * "changed (value not yet loaded)" without exploding.
 */
export const flattenSnapshot = (source, { nodesById = {}, filter = '' } = {}) => {
    if (!source || typeof source !== 'object') return []
    const needle = filter.trim().toLowerCase()
    const rows = []
    for (const [scopeKey, entries] of Object.entries(source)) {
        if (!Array.isArray(entries)) continue
        const label = scopeLabelFor(scopeKey, nodesById)
        for (const entry of entries) {
            const refKey = `${scopeKey}:${entry?.name ?? ''}`
            const row = {
                refKey,
                scopeKey,
                scopeLabel: label,
                name: entry?.name ?? '',
                valueType: entry?.valueType ?? 'json',
                value: entry?.value,
                sizeBytes: entry?.sizeBytes ?? 0,
                edited: !!entry?.edited,
                visible: entry?.visible !== false,
                id: entry?.id ?? null
            }
            if (!needle) {
                rows.push(row)
                continue
            }
            const haystack = `${label} ${row.name} ${row.valueType}`.toLowerCase()
            if (haystack.includes(needle)) rows.push(row)
        }
    }
    rows.sort((a, b) => {
        const sa = scopeSortKey(a.scopeKey)
        const sb = scopeSortKey(b.scopeKey)
        if (sa !== sb) return sa - sb
        if (a.scopeKey !== b.scopeKey) return a.scopeKey.localeCompare(b.scopeKey)
        return a.name.localeCompare(b.name)
    })
    return rows
}
