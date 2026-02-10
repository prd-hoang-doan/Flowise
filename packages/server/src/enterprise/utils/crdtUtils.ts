/**
 * Utility functions for CRDT encoding/decoding
 */

/**
 * Encode Uint8Array to base64 string for JSON transport
 */
export function encodeUpdate(update: Uint8Array): string {
    return Buffer.from(update).toString('base64')
}

/**
 * Decode base64 string to Uint8Array
 */
export function decodeUpdate(encoded: string): Uint8Array {
    return new Uint8Array(Buffer.from(encoded, 'base64'))
}

/**
 * Check if a string is valid base64
 */
export function isValidBase64(str: string): boolean {
    if (!str || typeof str !== 'string') {
        return false
    }
    try {
        return Buffer.from(str, 'base64').toString('base64') === str
    } catch {
        return false
    }
}
