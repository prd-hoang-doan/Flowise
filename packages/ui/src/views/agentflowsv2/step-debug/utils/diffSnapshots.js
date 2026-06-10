/**
 * Compute a per-variable diff between two snapshot payloads. Returns a map
 * keyed by `${scopeKey}:${name}` so the table can render `added` / `changed`
 * / `removed` badges without re-walking the snapshot every render.
 *
 * Both `prev` and `current` accept either the raw snapshot blob
 * (`{ [scopeKey]: [{ name, value, sizeBytes, valueType }] }`) OR the
 * `debugVarsByScope` live cache (which is summary-only and lacks `value`).
 * When values aren't available we fall back to comparing `sizeBytes +
 * valueType`, which catches every realistic mutation cheaply.
 *
 * Value comparison is JSON-equality bounded by `MAX_DEEP_COMPARE_BYTES` —
 * larger payloads degrade to the size/type heuristic to keep the diff O(n)
 * in the number of variables, not in their cumulative bytes.
 */

export const MAX_DEEP_COMPARE_BYTES = 16 * 1024

const refKey = (scopeKey, name) => `${scopeKey}:${name}`

const flatMap = (source) => {
    const out = new Map()
    if (!source || typeof source !== 'object') return out
    for (const [scopeKey, entries] of Object.entries(source)) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries) {
            if (!entry || typeof entry.name !== 'string') continue
            out.set(refKey(scopeKey, entry.name), { scopeKey, ...entry })
        }
    }
    return out
}

const safeStringify = (v) => {
    try {
        return JSON.stringify(v)
    } catch {
        return undefined
    }
}

const valuesEqual = (a, b) => {
    // Both undefined → treat as equal (e.g. summary-only sources). The size
    // / type heuristic below catches changes within that path.
    if (a === undefined && b === undefined) return true
    if (a === b) return true
    const aJson = safeStringify(a)
    const bJson = safeStringify(b)
    if (aJson === undefined || bJson === undefined) return false
    if (aJson.length > MAX_DEEP_COMPARE_BYTES || bJson.length > MAX_DEEP_COMPARE_BYTES) {
        // Cheap comparison only; trust the size/type heuristic.
        return false
    }
    return aJson === bJson
}

/**
 * @param {object|null} prev   Previous snapshot payload (nullable for the first snapshot).
 * @param {object} current     Current snapshot payload.
 * @returns {{
 *   added: Set<string>,
 *   changed: Set<string>,
 *   removed: Set<string>,
 *   byKey: Map<string, 'added'|'changed'|'removed'|'unchanged'>
 * }}
 */
export const diffSnapshots = (prev, current) => {
    const added = new Set()
    const changed = new Set()
    const removed = new Set()
    const byKey = new Map()

    const prevMap = flatMap(prev)
    const currMap = flatMap(current)

    for (const [key, currEntry] of currMap) {
        const prevEntry = prevMap.get(key)
        if (!prevEntry) {
            added.add(key)
            byKey.set(key, 'added')
            continue
        }
        // Fast path: same size + same type + value-equal => unchanged.
        const sameSize = (prevEntry.sizeBytes ?? 0) === (currEntry.sizeBytes ?? 0)
        const sameType = prevEntry.valueType === currEntry.valueType
        if (sameSize && sameType && valuesEqual(prevEntry.value, currEntry.value)) {
            byKey.set(key, 'unchanged')
            continue
        }
        changed.add(key)
        byKey.set(key, 'changed')
    }

    for (const key of prevMap.keys()) {
        if (!currMap.has(key)) {
            removed.add(key)
            byKey.set(key, 'removed')
        }
    }

    return { added, changed, removed, byKey }
}

export const diffKey = refKey
