/**
 * Text normalization utilities for the skill node extraction pipeline.
 * Cleans parsed content into a consistent format for segmentation and classification.
 */

/**
 * Normalize bullet characters to a single format (-)
 */
export function normalizeBullets(text: string): string {
    return text.replace(/^[\s]*[•*]\s/gm, '- ')
}

/**
 * Remove extra blank lines (collapse multiple blank lines into one)
 */
export function collapseBlankLines(text: string): string {
    return text.replace(/\n{3,}/g, '\n\n')
}

/**
 * Trim trailing whitespace from each line
 */
export function trimLines(text: string): string {
    return text
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
}

/**
 * Remove common markdown formatting artifacts (bold, italic markers left without content)
 */
export function removeFormattingArtifacts(text: string): string {
    // Remove standalone ** or __ or * or _ that aren't wrapping content
    return text.replace(/(?:^|\s)\*{1,2}\s*\*{1,2}(?:\s|$)/g, ' ').trim()
}

/**
 * Full normalization pipeline: bullets → blank lines → trim → artifacts
 */
export function normalize(text: string): string {
    let result = text
    result = normalizeBullets(result)
    result = collapseBlankLines(result)
    result = trimLines(result)
    result = removeFormattingArtifacts(result)
    return result.trim()
}
