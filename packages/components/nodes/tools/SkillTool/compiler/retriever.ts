/**
 * Node-aware retrieval for skill tools.
 * Selects the most relevant nodes based on the user's query using
 * keyword overlap scoring, type boosting, and edge expansion.
 *
 * Pure function — no DB dependencies.
 */

import { SkillNodeInput, SkillEdgeInput } from './types'

/**
 * Retrieve the most relevant nodes for a given query.
 *
 * Algorithm:
 * 1. Always include role + rule nodes (mandatory)
 * 2. Score remaining nodes by keyword overlap with query
 * 3. Take top candidates up to maxNodes
 * 4. Expand via edges — pull nodes connected via 'supports' edges
 * 5. Deduplicate and return
 */
export function retrieveRelevantNodes(
    query: string,
    nodes: SkillNodeInput[],
    edges: SkillEdgeInput[],
    maxNodes: number = 20
): SkillNodeInput[] {
    if (!nodes.length) return []

    // 1. Always include role + rule nodes
    const mandatory = nodes.filter((n) => n.type === 'role' || n.type === 'rule')

    // If we have fewer total nodes than maxNodes, return all
    if (nodes.length <= maxNodes) return nodes

    // 2. Score remaining nodes by keyword overlap with query
    const queryKeywords = extractQueryKeywords(query)
    const optional = nodes.filter((n) => n.type !== 'role' && n.type !== 'rule')

    const scored = optional
        .map((n) => ({
            node: n,
            score: computeRelevance(queryKeywords, parseTriggers(n.triggers), n.content)
        }))
        .sort((a, b) => b.score - a.score)

    // 3. Take top candidates
    const budget = Math.max(0, maxNodes - mandatory.length)
    const candidates = scored.slice(0, budget).map((s) => s.node)

    // 4. Expand via edges — add supporting nodes
    const expanded = expandViaEdges(candidates, edges, nodes)

    // 5. Deduplicate and return
    return deduplicate([...mandatory, ...candidates, ...expanded])
}

// ─── Scoring ─────────────────────────────────────────────────────

/**
 * Extract keywords from a user query for matching.
 */
function extractQueryKeywords(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Parse the triggers field (JSON string array or string[] already).
 */
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

/**
 * Compute relevance score between query keywords and a node.
 * Uses trigger overlap (weighted 2x) + content keyword overlap.
 */
function computeRelevance(queryKeywords: string[], triggers: string[], content: string): number {
    if (queryKeywords.length === 0) return 0

    // Trigger overlap (weighted higher — triggers are curated keywords)
    const triggerSet = new Set(triggers)
    const triggerOverlap = queryKeywords.filter((kw) => triggerSet.has(kw)).length

    // Content keyword overlap
    const contentLower = content.toLowerCase()
    const contentOverlap = queryKeywords.filter((kw) => contentLower.includes(kw)).length

    return triggerOverlap * 2 + contentOverlap
}

// ─── Edge Expansion ──────────────────────────────────────────────

/**
 * Expand the candidate set by following edges.
 * If a candidate node has a 'supports' edge pointing to/from it,
 * include the connected node.
 */
function expandViaEdges(candidates: SkillNodeInput[], edges: SkillEdgeInput[], allNodes: SkillNodeInput[]): SkillNodeInput[] {
    const candidateIds = new Set(candidates.map((n) => n.id))
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
    const expanded: SkillNodeInput[] = []

    for (const edge of edges) {
        if (edge.relation !== 'supports') continue

        // If from-node is a candidate, pull in to-node
        if (candidateIds.has(edge.fromNodeId) && !candidateIds.has(edge.toNodeId)) {
            const target = nodeMap.get(edge.toNodeId)
            if (target) {
                expanded.push(target)
                candidateIds.add(target.id)
            }
        }

        // If to-node is a candidate, pull in from-node
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

// ─── Helpers ─────────────────────────────────────────────────────

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
