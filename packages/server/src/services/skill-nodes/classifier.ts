/**
 * Node type classification logic for the skill node extraction pipeline.
 * Uses deterministic pattern matching to assign types to content segments.
 */

export type NodeType = 'role' | 'rule' | 'behavior' | 'knowledge' | 'asset'

export const DEFAULT_PRIORITIES: Record<NodeType, number> = {
    role: 100,
    rule: 95,
    behavior: 80,
    knowledge: 70,
    asset: 60
}

// Patterns checked in priority order to prevent misclassification
const ROLE_PATTERNS = [/\byou are\b/i, /\bact as\b/i, /\bserve as\b/i, /\byour role\b/i]

const RULE_PATTERNS = [/\bdo not\b/i, /\bdon't\b/i, /\bnever\b/i, /\balways\b/i, /\bmust\b/i, /\bavoid\b/i, /\bshould not\b/i]

const BEHAVIOR_VERBS = [
    /^keep\b/i,
    /^adapt\b/i,
    /^generate\b/i,
    /^use\b/i,
    /^create\b/i,
    /^write\b/i,
    /^develop\b/i,
    /^build\b/i,
    /^design\b/i,
    /^implement\b/i,
    /^provide\b/i,
    /^ensure\b/i,
    /^maintain\b/i,
    /^optimize\b/i,
    /^analyze\b/i,
    /^suggest\b/i,
    /^recommend\b/i,
    /^focus\b/i,
    /^include\b/i,
    /^apply\b/i
]

/**
 * Classify a text segment into a node type.
 * Priority order: role → rule → behavior → knowledge
 * (asset type is assigned externally from SkillAsset data)
 */
export function classify(text: string, headingHint?: string): NodeType {
    // Heading hints take priority for classification
    if (headingHint) {
        const h = headingHint.toLowerCase()
        if (/role|persona|identity/.test(h)) return 'role'
        if (/rule|constraint|restriction|limitation|guardrail/.test(h)) return 'rule'
        if (/instruction|behavior|action|capability|skill|task/.test(h)) return 'behavior'
        if (/knowledge|context|background|reference|note|info/.test(h)) return 'knowledge'
        if (/asset|file|image|document|resource/.test(h)) return 'asset'
    }

    const trimmed = text.trim()

    // Check role patterns first
    for (const pattern of ROLE_PATTERNS) {
        if (pattern.test(trimmed)) return 'role'
    }

    // Check rule patterns second
    for (const pattern of RULE_PATTERNS) {
        if (pattern.test(trimmed)) return 'rule'
    }

    // Check behavior patterns (starts with imperative verb)
    for (const pattern of BEHAVIOR_VERBS) {
        if (pattern.test(trimmed)) return 'behavior'
    }

    // Default to knowledge (declarative fact)
    return 'knowledge'
}

/**
 * Assign priority based on node type
 */
export function getPriority(type: NodeType): number {
    return DEFAULT_PRIORITIES[type]
}

/**
 * Generate a title for a node from its content (first ~60 chars, cleaned)
 */
export function generateTitle(content: string, type: NodeType): string {
    const cleaned = content.replace(/[#*_`]/g, '').trim()
    const firstLine = cleaned.split('\n')[0].trim()
    const maxLen = 60
    if (firstLine.length <= maxLen) return firstLine
    return firstLine.substring(0, maxLen - 3) + '...'
}

// Common English stop words for keyword extraction
const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'not',
    'no',
    'if',
    'as',
    'so',
    'up',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'such',
    'only',
    'own',
    'into',
    'over',
    'after',
    'you',
    'your',
    'we',
    'our',
    'they',
    'their',
    'what',
    'which',
    'who',
    'how',
    'when',
    'where',
    'than',
    'also',
    'about',
    'just',
    'them',
    'then',
    'very',
    'any',
    'some'
])

/**
 * Extract trigger keywords from content for retrieval matching
 */
export function extractTriggers(content: string): string[] {
    const words = content
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))

    // Deduplicate and take top meaningful keywords
    const unique = [...new Set(words)]
    return unique.slice(0, 10)
}

// Cluster keyword mapping
const CLUSTER_KEYWORDS: Record<string, string[]> = {
    tone: ['tone', 'voice', 'style', 'language', 'writing', 'concise', 'professional', 'casual', 'formal'],
    platform: ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'social', 'platform', 'blog', 'website', 'email'],
    asset: ['image', 'photo', 'document', 'pdf', 'file', 'spreadsheet', 'video', 'asset'],
    constraint: ['limit', 'restrict', 'avoid', 'never', 'must', 'always', 'constraint', 'rule', 'maximum', 'minimum'],
    output: ['generate', 'create', 'produce', 'output', 'write', 'build', 'deliver', 'format', 'template'],
    identity: ['role', 'expert', 'specialist', 'agent', 'persona', 'identity', 'serve', 'act'],
    process: ['step', 'process', 'workflow', 'pipeline', 'sequence', 'procedure', 'method', 'approach', 'strategy']
}

/**
 * Assign a cluster label based on content keywords
 */
export function assignCluster(content: string, type: NodeType): string {
    // Direct type-to-cluster mapping for strong hints
    if (type === 'role') return 'identity'
    if (type === 'asset') return 'asset'

    const lower = content.toLowerCase()
    let bestCluster = 'process' // default
    let bestScore = 0

    for (const [cluster, keywords] of Object.entries(CLUSTER_KEYWORDS)) {
        const score = keywords.filter((kw) => lower.includes(kw)).length
        if (score > bestScore) {
            bestScore = score
            bestCluster = cluster
        }
    }

    return bestCluster
}
