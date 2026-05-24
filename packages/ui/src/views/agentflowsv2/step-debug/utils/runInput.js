import { DEFAULT_RUN_INPUT } from './constants'

/**
 * Friendly Error thrown when one of the JSON-shaped fields in the Debug Step
 * form cannot be parsed. Carries the field name so the UI can surface the
 * error inline next to the offending input.
 */
export class RunInputParseError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`)
        this.name = 'RunInputParseError'
        this.field = field
    }
}

const parseJsonObject = (field, raw) => {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) return undefined
    let parsed
    try {
        parsed = JSON.parse(trimmed)
    } catch (err) {
        throw new RunInputParseError(field, `Invalid JSON — ${err.message}`)
    }
    if (parsed === null) return undefined
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new RunInputParseError(field, 'Expected a JSON object (e.g. {"key":"value"}).')
    }
    return parsed
}

/**
 * Try to parse a single structured field value into the right primitive,
 * given the metadata captured at inference time. We're permissive on
 * purpose — coercion failures yield the raw string so the backend can
 * still try to use it; only truly malformed JSON is rejected.
 */
const coerceStructuredValue = (rawValue, meta) => {
    if (rawValue === undefined || rawValue === null) return undefined
    const valueType = meta?.valueType || 'string'

    if (valueType === 'boolean') {
        if (typeof rawValue === 'boolean') return rawValue
        if (typeof rawValue === 'string') {
            if (rawValue === '') return undefined
            if (/^true$/i.test(rawValue)) return true
            if (/^false$/i.test(rawValue)) return false
        }
        return Boolean(rawValue)
    }

    if (valueType === 'number') {
        if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : undefined
        const trimmed = String(rawValue).trim()
        if (trimmed === '') return undefined
        const num = Number(trimmed)
        return Number.isFinite(num) ? num : trimmed
    }

    if (valueType === 'json' || valueType === 'array') {
        if (typeof rawValue !== 'string') return rawValue
        const trimmed = rawValue.trim()
        if (trimmed === '') return undefined
        try {
            return JSON.parse(trimmed)
        } catch {
            // fall back to raw string so the user's input still reaches the
            // backend (rather than being silently dropped on a typo).
            return rawValue
        }
    }

    // string / options / fallback
    if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim()
        return trimmed === '' ? undefined : trimmed
    }
    return rawValue
}

const setDeep = (target, path, value) => {
    if (path.length === 0) return value
    let cursor = target
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {}
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = value
    return target
}

/**
 * Fold the per-field `structured` map into the request body.
 *   `$question`           -> body.question
 *   `$form.<name>`        -> body.form[<name>]      (nested path supported)
 *   `$webhook.<path>`     -> body.webhook[<path>]
 *   `$flow.state.<name>`  -> body.inputs[<name>]    (Flow State overlay)
 *   `$vars.<name>`        -> body.inputs[<name>]    (best-effort; backend ignores
 *                                                    if the workspace has a real
 *                                                    variable with that name)
 *   `<nodeId>` or `<nodeId>.output.<path>` -> stored under body.inputs._nodeOutputs
 *                                                    so the backend can read it via
 *                                                    {{ <ref> }} templates.
 *
 * `fieldMeta` is the keyed map produced by inferDebugInputs (ref -> field).
 * Falls back to plain string treatment if a ref has no metadata entry.
 */
const applyStructured = (body, structured, fieldMeta) => {
    if (!structured) return
    for (const [ref, raw] of Object.entries(structured)) {
        const meta = fieldMeta?.[ref]
        const value = coerceStructuredValue(raw, meta)
        if (value === undefined) continue

        if (ref === '$question') {
            body.question = String(value)
            continue
        }
        if (ref.startsWith('$form.')) {
            body.form = body.form ?? {}
            const path = ref.slice('$form.'.length).split('.')
            setDeep(body.form, path, value)
            continue
        }
        if (ref.startsWith('$webhook.')) {
            body.webhook = body.webhook ?? {}
            const path = ref.slice('$webhook.'.length).split('.')
            setDeep(body.webhook, path, value)
            continue
        }
        if (ref.startsWith('$flow.state.')) {
            body.inputs = body.inputs ?? {}
            const path = ref.slice('$flow.state.'.length).split('.')
            setDeep(body.inputs, path, value)
            continue
        }
        if (ref.startsWith('$vars.')) {
            body.inputs = body.inputs ?? {}
            const path = ref.slice('$vars.'.length).split('.')
            setDeep(body.inputs, path, value)
            continue
        }
        // node output overlay — stash under inputs.__nodeOutputs[nodeId] for the
        // backend's missing-vars resolver to pick up.
        if (meta?.namespace === 'node' || /^\w[\w-]*(\.output\.|$)/.test(ref)) {
            body.inputs = body.inputs ?? {}
            body.inputs.__nodeOutputs = body.inputs.__nodeOutputs ?? {}
            body.inputs.__nodeOutputs[ref] = value
            continue
        }

        // Unknown shape — drop into inputs under the raw key as a best-effort.
        body.inputs = body.inputs ?? {}
        body.inputs[ref] = value
    }
}

/**
 * Compile the form values stored in `runInputsByNodeId[nodeId]` into the
 * request body the controller expects (matches `IStepRunArgs`).
 *
 * Returns `{ body, hasOverrides }`:
 *   - `body` is suitable for `runStepSSE` / `runStepJson` — empty fields are
 *     omitted so the backend can apply its own defaults.
 *   - `hasOverrides` is true when at least one field is populated, which the
 *     UI uses to show the "Edited" pill in the InspectorHeader.
 *
 * `fieldMeta` (optional) is a `{ ref -> field }` map produced by
 * `inferDebugInputs`, used to coerce structured field values to the right type.
 *
 * Order of precedence (later wins on conflict):
 *   1. structured per-field values (friendly UI)
 *   2. raw JSON blobs (advanced JSON section) — power users can override
 *
 * Throws `RunInputParseError` if any of the JSON fields are malformed.
 */
export const compileRunInputBody = (formValues, fieldMeta) => {
    const v = { ...DEFAULT_RUN_INPUT, ...(formValues ?? {}) }
    const body = {}

    // Structured first so raw JSON can layer over it.
    applyStructured(body, v.structured, fieldMeta)

    const question = (v.question ?? '').trim()
    if (question.length > 0) body.question = question

    const sessionId = (v.sessionId ?? '').trim()
    if (sessionId.length > 0) body.sessionId = sessionId

    const inputs = parseJsonObject('inputs', v.inputs)
    if (inputs && Object.keys(inputs).length > 0) {
        body.inputs = { ...(body.inputs ?? {}), ...inputs }
    }

    const form = parseJsonObject('form', v.form)
    if (form && Object.keys(form).length > 0) {
        body.form = { ...(body.form ?? {}), ...form }
    }

    const webhook = parseJsonObject('webhook', v.webhook)
    if (webhook && Object.keys(webhook).length > 0) {
        body.webhook = { ...(body.webhook ?? {}), ...webhook }
    }

    // Strip empty sub-objects that may have been seeded then fully overlayed.
    if (body.inputs && Object.keys(body.inputs).length === 0) delete body.inputs
    if (body.form && Object.keys(body.form).length === 0) delete body.form
    if (body.webhook && Object.keys(body.webhook).length === 0) delete body.webhook

    return { body, hasOverrides: Object.keys(body).length > 0 }
}
