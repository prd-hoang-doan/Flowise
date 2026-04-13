/**
 * Semantic (hybrid) retrieval for skill tools.
 * Combines cosine similarity on embeddings with keyword overlap and priority boosting.
 * Falls back gracefully to keyword-only when embeddings are unavailable.
 *
 * Pure function — no DB dependencies.
 */

import { SkillNodeInput, SkillEdgeInput, NodeEmbeddingInput, RetrievalConfig, DEFAULT_RETRIEVAL_CONFIG } from './types'
import { cosineSimilarity } from './cosineSimilarity'

// ─── Public API ──────────────────────────────────────────────────

/**
 * Retrieve the most relevant nodes for a given query using hybrid scoring.
 *
 * Algorithm:
 * 1. Always include role + rule nodes (mandatory)
 * 2. If total nodes ≤ maxNodes, return all
 * 3. Score remaining nodes with hybrid scoring (semantic + keyword + priority)
 * 4. Filter by minSemanticScore when embeddings are active
 * 5. Take top candidates up to budget
 * 6. Expand via edges
 * 7. Deduplicate and return
 */
export function retrieveRelevantNodes(
    query: string,
    nodes: SkillNodeInput[],
    edges: SkillEdgeInput[],
    embeddings: NodeEmbeddingInput[],
    queryEmbedding: number[] | null,
    config: Partial<RetrievalConfig> = {}
): SkillNodeInput[] {
    if (!nodes.length) return []

    const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config }

    // 1. Always include role + rule nodes
    const mandatory = nodes.filter((n) => n.type === 'role' || n.type === 'rule')

    // If we have fewer total nodes than maxNodes, return all
    if (nodes.length <= cfg.maxNodes) return nodes

    // 2. Score remaining nodes
    const queryKeywords = extractQueryKeywords(query)
    const optional = nodes.filter((n) => n.type !== 'role' && n.type !== 'rule')

    // Build a fast lookup map for embeddings
    const embeddingMap = new Map<string, number[]>()
    for (const emb of embeddings) {
        embeddingMap.set(emb.nodeId, emb.embedding)
    }

    const hasSemanticPath = queryEmbedding !== null && embeddingMap.size > 0

    const scored = optional
        .map((n) => {
            const score = computeHybridScore(queryKeywords, n, embeddingMap, queryEmbedding, cfg)
            return { node: n, score }
        })
        .filter((s) => {
            // Apply minSemanticScore threshold only when semantic path is active
            if (hasSemanticPath) {
                const nodeEmb = embeddingMap.get(s.node.id)
                if (nodeEmb && queryEmbedding) {
                    const sem = cosineSimilarity(queryEmbedding, nodeEmb)
                    // Discard nodes that have an embedding but score below threshold
                    if (sem < cfg.minSemanticScore) return false
                }
            }
            return true
        })
        .sort((a, b) => b.score - a.score)

    // 3. Take top candidates
    const budget = Math.max(0, cfg.maxNodes - mandatory.length)
    const candidates = scored.slice(0, budget).map((s) => s.node)

    // 4. Expand via edges
    const expanded = expandViaEdges(candidates, edges, nodes)

    // 5. Deduplicate and return
    return deduplicate([...mandatory, ...candidates, ...expanded])
}

// ─── Scoring ─────────────────────────────────────────────────────

/**
 * Compute a hybrid relevance score combining three signals:
 * - Semantic similarity (cosine of query/node embeddings)
 * - Keyword overlap (trigger match + content match)
 * - Priority boost (node.priority / 100)
 */
function computeHybridScore(
    queryKeywords: string[],
    node: SkillNodeInput,
    embeddingMap: Map<string, number[]>,
    queryEmbedding: number[] | null,
    config: RetrievalConfig
): number {
    // Signal 1: Semantic similarity (0–1)
    let semanticScore = 0
    if (queryEmbedding) {
        const nodeEmb = embeddingMap.get(node.id)
        if (nodeEmb) {
            semanticScore = cosineSimilarity(queryEmbedding, nodeEmb)
        }
    }

    // Signal 2: Keyword overlap (normalized 0–1)
    const keywordScore = computeKeywordScore(queryKeywords, node)

    // Signal 3: Priority boost (normalized 0–1)
    const priorityBoost = node.priority / 100

    // Weighted combination
    return config.semanticWeight * semanticScore + config.keywordWeight * keywordScore + config.priorityWeight * priorityBoost
}

/**
 * Compute keyword overlap score between query keywords and a node.
 * Normalized to 0–1 range.
 */
function computeKeywordScore(queryKeywords: string[], node: SkillNodeInput): number {
    if (queryKeywords.length === 0) return 0

    const triggers = parseTriggers(node.triggers)

    // Trigger overlap (weighted 2x — triggers are curated keywords)
    const triggerSet = new Set(triggers)
    const triggerOverlap = queryKeywords.filter((kw) => triggerSet.has(kw)).length

    // Content keyword overlap
    const contentLower = node.content.toLowerCase()
    const contentOverlap = queryKeywords.filter((kw) => contentLower.includes(kw)).length

    const rawScore = triggerOverlap * 2 + contentOverlap
    // Normalize: max possible score = queryKeywords.length * 3 (all triggers match + all content matches)
    const maxPossible = queryKeywords.length * 3
    return maxPossible > 0 ? Math.min(1, rawScore / maxPossible) : 0
}

// ─── Helpers ─────────────────────────────────────────────────────

function extractQueryKeywords(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

function parseTriggers(triggers?: string | string[]): string[] {
    if (!triggers) return []
    if (Array.isArray(triggers)) return triggers
    try {
        const parsed = JSON.parse(triggers)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function expandViaEdges(candidates: SkillNodeInput[], edges: SkillEdgeInput[], allNodes: SkillNodeInput[]): SkillNodeInput[] {
    const candidateIds = new Set(candidates.map((n) => n.id))
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
    const expanded: SkillNodeInput[] = []

    for (const edge of edges) {
        if (edge.relation !== 'supports') continue

        if (candidateIds.has(edge.fromNodeId) && !candidateIds.has(edge.toNodeId)) {
            const target = nodeMap.get(edge.toNodeId)
            if (target) {
                expanded.push(target)
                candidateIds.add(target.id)
            }
        }

        if (candidateIds.has(edge.toNodeId) && !candidateIds.has(edge.fromNodeId)) {
            const source = nodeMap.get(edge.fromNodeId)
            if (source) {
                expanded.push(source)
                candidateIds.add(source.id)
            }
        }
    }

    return expanded
}

function deduplicate(nodes: SkillNodeInput[]): SkillNodeInput[] {
    const seen = new Set<string>()
    return nodes.filter((n) => {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
    })
}

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
    'not',
    'you',
    'your',
    'how',
    'what',
    'when',
    'where',
    'which',
    'who'
])
