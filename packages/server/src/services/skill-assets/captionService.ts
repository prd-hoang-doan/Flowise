import fs from 'fs'

/**
 * Generate a fallback caption for an image file.
 * In Phase 1, this returns a descriptive string based on filename.
 * Future phases can integrate vision LLM models for auto-captioning.
 */
const generateFallbackCaption = (filename: string): string => {
    // Convert filename to a readable description
    const name = filename.replace(/\.[^.]+$/, '') // remove extension
    const readable = name.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
    return `Image: ${readable}`
}

/**
 * Read an image file and return it as a base64 data URI.
 * Useful for sending to vision LLMs for captioning.
 */
const imageToBase64DataUri = (filePath: string, mimeType: string): string | null => {
    try {
        if (!fs.existsSync(filePath)) return null
        const buffer = fs.readFileSync(filePath)
        const base64 = buffer.toString('base64')
        return `data:${mimeType};base64,${base64}`
    } catch {
        return null
    }
}

export default {
    generateFallbackCaption,
    imageToBase64DataUri
}
