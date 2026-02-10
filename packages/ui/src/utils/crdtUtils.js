/**
 * Utility functions for CRDT encoding/decoding on the client side
 */

/**
 * Convert Uint8Array to base64 string for JSON transport
 * @param {Uint8Array} buffer - Binary data to encode
 * @returns {string} Base64 encoded string
 */
export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

/**
 * Convert base64 string to Uint8Array
 * @param {string} base64 - Base64 encoded string
 * @returns {Uint8Array} Binary data
 */
export function base64ToArrayBuffer(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

/**
 * Check if a string is valid base64
 * @param {string} str - String to check
 * @returns {boolean} True if valid base64
 */
export function isValidBase64(str) {
    if (!str || typeof str !== 'string') {
        return false
    }
    try {
        return btoa(atob(str)) === str
    } catch {
        return false
    }
}

/**
 * Check if a string is a JSON array
 * @param {string} str - String to check
 * @returns {boolean} True if the string is a JSON array
 */
export function isJSONArray(str) {
    if (typeof str !== 'string') return false
    try {
        const parsed = JSON.parse(str)
        return Array.isArray(parsed)
    } catch {
        return false
    }
}

/**
 * Convert LoroMap to plain JavaScript object
 * @param {import('loro-crdt').LoroMap} loroMap - Loro map to convert
 * @returns {object} Plain JavaScript object
 */
export function loroMapToObject(loroMap) {
    const obj = {}
    for (const [key, value] of loroMap.entries()) {
        if (value && typeof value.entries === 'function') {
            // Nested LoroMap
            obj[key] = loroMapToObject(value)
        } else if (typeof value === 'string' && isJSONArray(value)) {
            // Deserialize arrays
            try {
                obj[key] = JSON.parse(value)
            } catch {
                obj[key] = value
            }
        } else {
            obj[key] = value
        }
    }
    return obj
}

/**
 * Set properties from plain object to LoroMap
 * @param {import('loro-crdt').LoroMap} loroMap - Target Loro map
 * @param {object} obj - Source plain object
 */
export function setLoroMapFromObject(loroMap, obj) {
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue

        if (typeof value === 'object' && !Array.isArray(value)) {
            // Nested object -> create nested LoroMap
            const nestedMap = loroMap.setContainer(key, new loroMap.constructor.LoroMap())
            setLoroMapFromObject(nestedMap, value)
        } else if (Array.isArray(value)) {
            // Serialize arrays to JSON string
            loroMap.set(key, JSON.stringify(value))
        } else {
            // Primitive value
            loroMap.set(key, value)
        }
    }
}
