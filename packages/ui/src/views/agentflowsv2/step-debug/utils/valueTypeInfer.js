/**
 * Best-effort inference of a DebugVariableValueType from a runtime value.
 *
 * The backend uses the same six categories: 'string' | 'number' | 'boolean'
 * | 'json' | 'array' | 'file'. Files are detected by IFileUpload shape
 * (object with a string `data` or `name` and a `mime` field) so we don't
 * have to plumb a separate `type` arg through every form field.
 */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const looksLikeFileUpload = (v) =>
    isPlainObject(v) &&
    typeof v.mime === 'string' &&
    (typeof v.data === 'string' || typeof v.name === 'string') &&
    typeof v.type === 'string'

export const inferValueType = (value) => {
    if (value === null || value === undefined) return 'string'
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number' && Number.isFinite(value)) return 'number'
    if (typeof value === 'string') return 'string'
    if (looksLikeFileUpload(value)) return 'file'
    if (typeof value === 'object') return 'json'
    return 'string'
}

/**
 * Inverse of inferValueType — coerce a UI string input into the runtime type
 * the backend will see. Used by RunStepForm / VariableRow edit flows.
 *
 * Throws when the input cannot be coerced into the requested type (e.g.
 * "abc" with valueType='number'). Callers catch and surface the error
 * via toast or inline form error.
 */
export const coerceFromInput = (raw, valueType) => {
    if (valueType === 'string') return typeof raw === 'string' ? raw : String(raw ?? '')
    if (valueType === 'number') {
        if (raw === '' || raw === null || raw === undefined) return null
        const n = Number(raw)
        if (Number.isNaN(n) || !Number.isFinite(n)) throw new Error(`'${raw}' is not a valid number`)
        return n
    }
    if (valueType === 'boolean') {
        if (typeof raw === 'boolean') return raw
        if (raw === 'true' || raw === '1' || raw === 1) return true
        if (raw === 'false' || raw === '0' || raw === 0 || raw === '' || raw === null || raw === undefined) return false
        throw new Error(`'${raw}' is not a valid boolean`)
    }
    if (valueType === 'json' || valueType === 'array') {
        if (raw === '' || raw === null || raw === undefined) return null
        if (typeof raw !== 'string') return raw
        try {
            return JSON.parse(raw)
        } catch (err) {
            throw new Error(`Invalid JSON: ${err.message}`)
        }
    }
    return raw
}

/**
 * Cheap byte-size estimate for size-cap guard rails. Uses JSON.stringify
 * length as a proxy because the backend computes sizeBytes the same way.
 */
export const estimateSizeBytes = (value) => {
    if (value === null || value === undefined) return 0
    if (typeof value === 'string') return value.length
    try {
        return JSON.stringify(value).length
    } catch {
        return 0
    }
}
