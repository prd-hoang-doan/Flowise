/**
 * Edge creation heuristics for the skill node extraction pipeline.
 * Creates lightweight relationships between nodes using keyword overlap.
 */

import { extractTriggers } from './classifier'

export interface ExtractedNode {
    id: string
    type: string
    content: string
    cluster: string
    triggers: string[]
}

export interface ExtractedEdge {
    fromNodeId: string
    toNodeId: string
    relation: 'supports' | 'depends_on' | 'extends'
}

/**
 * Create edges between nodes using simple heuristics:
 * 1. Same cluster + keyword overlap → supports
 * 2. Rule referencing behavior topic → extends
 * 3. Asset matching behavior/knowledge topic → supports
 */
export function createEdges(nodes: ExtractedNode[]): ExtractedEdge[] {
    const edges: ExtractedEdge[] = []
    const seen = new Set<string>()

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i]
            const b = nodes[j]

            // Skip self-edges
            if (a.id === b.id) continue

            // Skip edges between role nodes (they don't link to each other meaningfully)
            if (a.type === 'role' && b.type === 'role') continue

            const overlap = getKeywordOverlap(a.triggers, b.triggers)
            if (overlap < 1) continue

            const edgeKey = [a.id, b.id].sort().join(':')
            if (seen.has(edgeKey)) continue

            const edge = determineEdge(a, b, overlap)
            if (edge) {
                seen.add(edgeKey)
                edges.push(edge)
            }
        }
    }

    return edges
}

function getKeywordOverlap(a: string[], b: string[]): number {
    const setB = new Set(b)
    return a.filter((kw) => setB.has(kw)).length
}

function determineEdge(a: ExtractedNode, b: ExtractedNode, overlap: number): ExtractedEdge | null {
    // Rule extends behavior
    if (a.type === 'rule' && b.type === 'behavior' && overlap >= 1) {
        return { fromNodeId: a.id, toNodeId: b.id, relation: 'extends' }
    }
    if (b.type === 'rule' && a.type === 'behavior' && overlap >= 1) {
        return { fromNodeId: b.id, toNodeId: a.id, relation: 'extends' }
    }

    // Knowledge supports behavior
    if (a.type === 'knowledge' && b.type === 'behavior' && overlap >= 1) {
        return { fromNodeId: a.id, toNodeId: b.id, relation: 'supports' }
    }
    if (b.type === 'knowledge' && a.type === 'behavior' && overlap >= 1) {
        return { fromNodeId: b.id, toNodeId: a.id, relation: 'supports' }
    }

    // Asset supports behavior or knowledge
    if (a.type === 'asset' && (b.type === 'behavior' || b.type === 'knowledge') && overlap >= 1) {
        return { fromNodeId: a.id, toNodeId: b.id, relation: 'supports' }
    }
    if (b.type === 'asset' && (a.type === 'behavior' || a.type === 'knowledge') && overlap >= 1) {
        return { fromNodeId: b.id, toNodeId: a.id, relation: 'supports' }
    }

    // Same cluster + overlap → supports (lower priority)
    if (a.cluster === b.cluster && overlap >= 2) {
        return { fromNodeId: a.id, toNodeId: b.id, relation: 'supports' }
    }

    return null
}

export { extractTriggers }
