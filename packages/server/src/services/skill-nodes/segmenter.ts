/**
 * Content segmentation logic for the skill node extraction pipeline.
 * Breaks large blocks into smallest meaningful pieces.
 */

/**
 * Segment a block of text into individual candidate units.
 * Priority: bullet split → sentence split → paragraph split
 */
export function segment(text: string): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []

    // Try bullet split first
    const bulletSegments = splitByBullets(trimmed)
    if (bulletSegments.length > 1) return bulletSegments

    // Try paragraph split
    const paragraphSegments = splitByParagraphs(trimmed)
    if (paragraphSegments.length > 1) return paragraphSegments

    // Try sentence split
    const sentenceSegments = splitBySentences(trimmed)
    if (sentenceSegments.length > 1) return sentenceSegments

    // Return as single unit
    return [trimmed]
}

/**
 * Split by bullet points (lines starting with -)
 */
function splitByBullets(text: string): string[] {
    const lines = text.split('\n')
    const segments: string[] = []
    let currentNonBullet: string[] = []

    for (const line of lines) {
        if (/^\s*-\s+/.test(line)) {
            // Flush non-bullet lines as a segment
            if (currentNonBullet.length > 0) {
                const joined = currentNonBullet.join('\n').trim()
                if (joined) segments.push(joined)
                currentNonBullet = []
            }
            const bulletContent = line.replace(/^\s*-\s+/, '').trim()
            if (bulletContent) segments.push(bulletContent)
        } else {
            currentNonBullet.push(line)
        }
    }

    // Flush remaining non-bullet lines
    if (currentNonBullet.length > 0) {
        const joined = currentNonBullet.join('\n').trim()
        if (joined) segments.push(joined)
    }

    return segments
}

/**
 * Split by paragraph breaks (double newlines)
 */
function splitByParagraphs(text: string): string[] {
    return text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
}

/**
 * Split by sentences (period/exclamation/question mark followed by space or end)
 */
function splitBySentences(text: string): string[] {
    // Split on sentence boundaries but keep the delimiter with the sentence
    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

    // Only split if we get meaningful segments (at least 10 chars each)
    if (sentences.every((s) => s.length >= 10)) return sentences

    return [text]
}
