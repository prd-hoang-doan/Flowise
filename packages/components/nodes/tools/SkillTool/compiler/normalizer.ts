import { SkillRuntimeInput, NormalizedSkill, NormalizedAsset, SkillAssetInput } from './types'
import { AssetCompilerRegistry } from './assetCompilers'

const FRONT_MATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n?/

const IMPERATIVE_VERBS = [
    'prioritize',
    'adapt',
    'avoid',
    'generate',
    'use',
    'create',
    'ensure',
    'maintain',
    'follow',
    'apply',
    'include',
    'implement',
    'optimize',
    'analyze',
    'develop',
    'design',
    'build',
    'write',
    'produce',
    'deliver',
    'manage',
    'coordinate',
    'execute',
    'plan',
    'review',
    'test',
    'monitor',
    'track',
    'report',
    'document',
    'handle',
    'resolve',
    'configure',
    'deploy',
    'integrate',
    'validate',
    'verify',
    'focus',
    'leverage',
    'keep',
    'always',
    'never',
    'do',
    "don't",
    'make',
    'provide',
    'set',
    'check',
    'start',
    'stop'
]

export function stripFrontMatter(content: string): string {
    return content.replace(FRONT_MATTER_RE, '').trim()
}

/**
 * Extract role from description: take the first semantic paragraph
 * (the opening sentence or block that defines who/what the agent is).
 */
export function extractRole(description: string): string {
    if (!description) return ''
    const paragraphs = description.split(/\n\s*\n/)
    return (paragraphs[0] || '').trim()
}

/**
 * Classify a single instruction line as behavior (imperative) or knowledge (declarative).
 * Behavior: starts with a verb (imperative sentence).
 * Knowledge: declarative domain fact.
 */
function isBehavior(line: string): boolean {
    const trimmed = line
        .replace(/^[-*•]\s*/, '')
        .trim()
        .toLowerCase()
    if (!trimmed) return false
    const firstWord = trimmed.split(/[\s,:]/)[0]
    return IMPERATIVE_VERBS.includes(firstWord)
}

/**
 * Split raw instruction text into behavior (imperative directives) and
 * knowledge (declarative domain facts) buckets.
 */
export function splitInstructions(instructions: string): { behavior: string[]; knowledge: string[] } {
    const behavior: string[] = []
    const knowledge: string[] = []

    if (!instructions) return { behavior, knowledge }

    const lines = instructions.split('\n').filter((l) => l.trim())

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (isBehavior(trimmed)) {
            behavior.push(trimmed)
        } else {
            knowledge.push(trimmed)
        }
    }

    return { behavior, knowledge }
}

export function normalizeAssets(assets: SkillAssetInput[], registry: AssetCompilerRegistry): NormalizedAsset[] {
    return assets
        .filter((a) => a.caption?.trim())
        .map((a) => ({
            id: a.id,
            fileId: a.fileId,
            filename: a.filename,
            mimeType: a.mimeType || 'application/octet-stream',
            storagePath: a.storagePath,
            caption: a.caption!.trim(),
            category: registry.categorize({
                ...a,
                mimeType: a.mimeType || 'application/octet-stream',
                caption: a.caption!.trim(),
                category: ''
            })
        }))
}

export function formatToolName(name: string): string {
    return name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function normalize(input: SkillRuntimeInput, registry: AssetCompilerRegistry): NormalizedSkill {
    const role = extractRole(input.description)
    const { behavior, knowledge } = splitInstructions(input.instructions)
    const normalizedAssets = normalizeAssets(input.assets, registry)

    return {
        header: { name: formatToolName(input.name) },
        role,
        behavior,
        knowledge,
        assets: normalizedAssets,
        runtimeRules: []
    }
}
