/**
 * SkillNodeExtractor — 8-stage deterministic pipeline to transform raw skill
 * markdown into structured, typed, prioritized nodes and edges.
 *
 * Pipeline: Load → Parse → Normalize → Segment → Classify → Prioritize → Link → Persist
 *
 * All stages are deterministic (no LLM dependency). Same input always produces same nodes.
 */

import { createHash, randomUUID } from 'crypto'
import { normalize } from './normalizer'
import { segment } from './segmenter'
import { classify, getPriority, generateTitle, extractTriggers, assignCluster } from './classifier'
import { createEdges, ExtractedNode } from './linker'

// ─── Types ───────────────────────────────────────────────────────

export interface RawSkillInput {
    skillFileId: string
    folderId: string
    name: string
    description: string
    content: string
    workspaceId: string
    assets: Array<{ id: string; filename: string; caption?: string }>
}

export interface ParsedBlock {
    heading: string | null
    content: string
    level: number
}

export interface ExtractionResult {
    nodes: Array<{
        id: string
        skillFileId: string
        folderId: string
        type: string
        title: string
        content: string
        priority: number
        triggers: string
        cluster: string
        embeddingText: string | null
        orderIndex: number
        workspaceId: string
    }>
    edges: Array<{
        id: string
        skillFileId: string
        folderId: string
        fromNodeId: string
        toNodeId: string
        relation: string
        workspaceId: string
    }>
    compileHash: string
}

// ─── Pipeline ────────────────────────────────────────────────────

/**
 * Run the full extraction pipeline on raw skill input.
 * Returns nodes, edges, and a content hash.
 */
export function extract(input: RawSkillInput): ExtractionResult {
    // Stage 1: Load — input is already loaded, compute hash from raw content
    const compileHash = computeHash(input.content)

    // Stage 2: Parse — detect structural blocks from markdown headings
    const rawContent = stripFrontMatter(input.content)
    const blocks = parse(rawContent)

    // Stage 3+4+5+6: Normalize → Segment → Classify → Prioritize
    const extractedNodes: ExtractedNode[] = []
    const nodeRecords: ExtractionResult['nodes'] = []
    let orderIndex = 0

    for (const block of blocks) {
        const normalized = normalize(block.content)
        if (!normalized) continue

        const segments = segment(normalized)

        for (const seg of segments) {
            if (seg.trim().length < 3) continue

            const type = classify(seg, block.heading ?? undefined)
            const priority = getPriority(type)
            const title = generateTitle(seg, type)
            const triggers = extractTriggers(seg)
            const cluster = assignCluster(seg, type)
            const nodeId = randomUUID()

            extractedNodes.push({
                id: nodeId,
                type,
                content: seg,
                cluster,
                triggers
            })

            nodeRecords.push({
                id: nodeId,
                skillFileId: input.skillFileId,
                folderId: input.folderId,
                type,
                title,
                content: seg,
                priority,
                triggers: JSON.stringify(triggers),
                cluster,
                embeddingText: null,
                orderIndex: orderIndex++,
                workspaceId: input.workspaceId
            })
        }
    }

    // Create asset nodes from SkillAsset captions
    for (const asset of input.assets) {
        if (!asset.caption) continue

        const nodeId = randomUUID()
        const triggers = extractTriggers(asset.caption)
        const title = `Asset: ${asset.filename}`

        extractedNodes.push({
            id: nodeId,
            type: 'asset',
            content: `${asset.filename} → ${asset.caption}`,
            cluster: 'asset',
            triggers
        })

        nodeRecords.push({
            id: nodeId,
            skillFileId: input.skillFileId,
            folderId: input.folderId,
            type: 'asset',
            title,
            content: `${asset.filename} → ${asset.caption}`,
            priority: getPriority('asset'),
            triggers: JSON.stringify(triggers),
            cluster: 'asset',
            embeddingText: null,
            orderIndex: orderIndex++,
            workspaceId: input.workspaceId
        })
    }

    // Stage 7: Link — create edges between nodes
    const rawEdges = createEdges(extractedNodes)
    const edgeRecords: ExtractionResult['edges'] = rawEdges.map((edge) => ({
        id: randomUUID(),
        skillFileId: input.skillFileId,
        folderId: input.folderId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        relation: edge.relation,
        workspaceId: input.workspaceId
    }))

    return {
        nodes: nodeRecords,
        edges: edgeRecords,
        compileHash
    }
}

// ─── Stage 2: Parse ──────────────────────────────────────────────

/**
 * Strip YAML front matter from markdown content
 */
function stripFrontMatter(content: string): string {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()
}

/**
 * Parse markdown into structural blocks based on headings
 */
export function parse(content: string): ParsedBlock[] {
    const lines = content.split('\n')
    const blocks: ParsedBlock[] = []
    let currentHeading: string | null = null
    let currentLevel = 0
    let currentLines: string[] = []

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

        if (headingMatch) {
            // Flush current block
            if (currentLines.length > 0) {
                const blockContent = currentLines.join('\n').trim()
                if (blockContent) {
                    blocks.push({
                        heading: currentHeading,
                        content: blockContent,
                        level: currentLevel
                    })
                }
            }

            currentHeading = headingMatch[2].trim()
            currentLevel = headingMatch[1].length
            currentLines = []
        } else {
            currentLines.push(line)
        }
    }

    // Flush final block
    if (currentLines.length > 0) {
        const blockContent = currentLines.join('\n').trim()
        if (blockContent) {
            blocks.push({
                heading: currentHeading,
                content: blockContent,
                level: currentLevel
            })
        }
    }

    return blocks
}

// ─── Utils ───────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of content for change detection
 */
export function computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}
