/**
 * Node-aware compilation for skill tools.
 * Compiles structured nodes into a formatted prompt, with priority-based
 * ordering, type grouping, and token budget trimming.
 *
 * Pure function — no DB dependencies.
 */

import { createHash } from 'crypto'
import { SkillNodeInput, SkillAssetInput, NodeCompileConfig, MultimodalContentPart } from './types'
import { AssetCompilerRegistry } from './assetCompilers'

// ─── Type Grouping Order ─────────────────────────────────────────

const TYPE_ORDER: string[] = ['role', 'rule', 'behavior', 'knowledge', 'asset']

const TYPE_SECTION_HEADERS: Record<string, string> = {
    role: 'Role',
    rule: 'Rules',
    behavior: 'Instructions',
    knowledge: 'Knowledge',
    asset: 'Assets'
}

// ─── Main Compilation ────────────────────────────────────────────

/**
 * Compile nodes into a structured prompt string.
 *
 * 1. Sort by priority (desc) then orderIndex (asc)
 * 2. Group by type for structured output sections
 * 3. Trim by token budget — drop lowest-priority nodes first
 * 4. Render into final text
 */
export function compileFromNodes(
    skillName: string,
    skillDescription: string,
    nodes: SkillNodeInput[],
    assets: SkillAssetInput[],
    config: NodeCompileConfig
): { compiledPrompt: string; multimodalPayload: MultimodalContentPart[] } {
    // Sort nodes: priority desc, orderIndex asc
    const sorted = [...nodes].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return a.orderIndex - b.orderIndex
    })

    // Trim by token budget
    const trimmed = trimByTokenBudget(sorted, config.maxTokenBudget)

    // Group by type
    const groups: Record<string, SkillNodeInput[]> = {}
    for (const node of trimmed) {
        if (!groups[node.type]) groups[node.type] = []
        groups[node.type].push(node)
    }

    // Render sections in defined order
    const sections: string[] = [`Skill: ${skillName}`]

    if (skillDescription) {
        sections.push(`Description: ${skillDescription}`)
    }

    for (const type of TYPE_ORDER) {
        const typeNodes = groups[type]
        if (!typeNodes?.length) continue

        const header = TYPE_SECTION_HEADERS[type] || type
        const rendered = renderTypeSection(header, type, typeNodes, assets, config)
        if (rendered) {
            sections.push(rendered)
        }
    }

    const compiledPrompt = sections.join('\n\n')

    // Multimodal payload
    let multimodalPayload: MultimodalContentPart[] = []
    if (config.executionMode === 'multimodal' && assets.length > 0) {
        multimodalPayload = buildMultimodalPayload(compiledPrompt, assets, config)
    }

    return { compiledPrompt, multimodalPayload }
}

// ─── Section Rendering ───────────────────────────────────────────

function renderTypeSection(
    header: string,
    type: string,
    nodes: SkillNodeInput[],
    assets: SkillAssetInput[],
    config: NodeCompileConfig
): string | null {
    if (type === 'role') {
        // Role is rendered as a single block, not a list
        const roleContent = nodes.map((n) => n.content).join('\n')
        return `${header}:\n${roleContent}`
    }

    if (type === 'asset') {
        return renderAssetSection(nodes, assets, config)
    }

    // Rules, Instructions, Knowledge — rendered as bullet lists
    const lines = nodes.map((n) => {
        const content = n.content.trim()
        // If content already starts with a bullet, keep it
        if (/^[-*•]/.test(content)) return content
        return `- ${content}`
    })

    return `${header}:\n${lines.join('\n')}`
}

function renderAssetSection(nodes: SkillNodeInput[], assets: SkillAssetInput[], config: NodeCompileConfig): string | null {
    if (!nodes.length) return null

    // Group asset nodes by sub-category (Images, Documents, etc.)
    const registry = new AssetCompilerRegistry()
    const imageAssets: string[] = []
    const documentAssets: string[] = []
    const otherAssets: string[] = []

    for (const node of nodes) {
        const content = node.content.trim()
        // Try to match against actual assets to determine category
        const matchedAsset = assets.find((a) => content.includes(a.filename))
        if (matchedAsset) {
            const category = registry.categorize({
                id: matchedAsset.id,
                fileId: matchedAsset.fileId,
                filename: matchedAsset.filename,
                mimeType: matchedAsset.mimeType || 'application/octet-stream',
                storagePath: matchedAsset.storagePath,
                caption: matchedAsset.caption || '',
                category: ''
            })
            if (category === 'Images') {
                imageAssets.push(`- ${content}`)
            } else if (category === 'Documents') {
                documentAssets.push(`- ${content}`)
            } else {
                otherAssets.push(`- ${content}`)
            }
        } else {
            otherAssets.push(`- ${content}`)
        }
    }

    const parts: string[] = ['Assets:']
    let totalLen = 0

    if (imageAssets.length) {
        parts.push('Images:')
        for (const line of imageAssets) {
            if (totalLen + line.length > config.maxAssetContext) {
                parts.push('- … (truncated)')
                break
            }
            parts.push(line)
            totalLen += line.length
        }
    }

    if (documentAssets.length) {
        parts.push('Documents:')
        for (const line of documentAssets) {
            if (totalLen + line.length > config.maxAssetContext) {
                parts.push('- … (truncated)')
                break
            }
            parts.push(line)
            totalLen += line.length
        }
    }

    if (otherAssets.length) {
        for (const line of otherAssets) {
            if (totalLen + line.length > config.maxAssetContext) {
                parts.push('- … (truncated)')
                break
            }
            parts.push(line)
            totalLen += line.length
        }
    }

    return parts.length > 1 ? parts.join('\n') : null
}

// ─── Token Budget Trimming ───────────────────────────────────────

/**
 * Drop lowest-priority nodes when exceeding token budget.
 * Nodes are already sorted by priority desc — we take from the top.
 */
function trimByTokenBudget(sorted: SkillNodeInput[], maxTokens: number): SkillNodeInput[] {
    if (maxTokens <= 0) return sorted // 0 = unlimited

    let totalTokens = 0
    const kept: SkillNodeInput[] = []

    for (const node of sorted) {
        const nodeTokens = estimateTokens(node.content)
        if (totalTokens + nodeTokens > maxTokens && kept.length > 0) {
            // Skip this node — would exceed budget
            continue
        }
        kept.push(node)
        totalTokens += nodeTokens
    }

    return kept
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

// ─── Multimodal Payload ──────────────────────────────────────────

function buildMultimodalPayload(compiledText: string, assets: SkillAssetInput[], config: NodeCompileConfig): MultimodalContentPart[] {
    const parts: MultimodalContentPart[] = [{ type: 'text', text: compiledText }]

    let count = 0
    for (const asset of assets) {
        if (count >= config.maxMultimodalAssets) break
        if (!asset.storagePath) continue

        const mime = (asset.mimeType || '').toLowerCase()
        if (mime.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url: asset.storagePath } })
            count++
        }
    }

    return parts
}

// ─── Hash Computation ────────────────────────────────────────────

/**
 * Compute a cache hash from nodes + assets + config.
 */
export function computeCompileHash(
    nodes: SkillNodeInput[],
    assets: SkillAssetInput[],
    executionMode: string,
    maxAssetContext: number
): string {
    const nodeData = nodes
        .map((n) => n.content)
        .sort()
        .join('|')
    const assetData = assets
        .map((a) => a.caption || '')
        .sort()
        .join('|')
    const input = `${nodeData}::${assetData}::${executionMode}::${maxAssetContext}`
    return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
