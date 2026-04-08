import { NormalizedSkill, CompileConfig, MultimodalContentPart } from './types'
import { AssetCompilerRegistry } from './assetCompilers'

export interface RenderResult {
    compiledPrompt: string
    multimodalPayload: MultimodalContentPart[]
    sections: string[]
}

function renderHeader(skill: NormalizedSkill): string | null {
    return `Skill: ${skill.header.name}`
}

function renderRole(skill: NormalizedSkill): string | null {
    if (!skill.role) return null
    return `Role:\n${skill.role}`
}

function renderBehavior(skill: NormalizedSkill): string | null {
    if (skill.behavior.length === 0) return null
    return `Behavior:\n${skill.behavior.join('\n')}`
}

function renderKnowledge(skill: NormalizedSkill): string | null {
    if (skill.knowledge.length === 0) return null
    return `Knowledge:\n${skill.knowledge.join('\n')}`
}

function renderSummaryAssets(skill: NormalizedSkill, registry: AssetCompilerRegistry, config: CompileConfig): string | null {
    if (skill.assets.length === 0) return null

    const grouped: Record<string, string[]> = {}
    for (const asset of skill.assets) {
        const compiler = registry.resolve(asset.mimeType)
        const result = compiler.compileSummary(asset, config)
        if (result.textBlock) {
            const cat = asset.category
            if (!grouped[cat]) grouped[cat] = []
            grouped[cat].push(result.textBlock)
        }
    }

    if (Object.keys(grouped).length === 0) return null

    let block = ''
    let totalLen = 0
    for (const category of AssetCompilerRegistry.CATEGORY_ORDER) {
        const lines = grouped[category]
        if (!lines?.length) continue
        const catHeader = `\n${category}:\n`
        block += catHeader
        totalLen += catHeader.length
        for (const line of lines) {
            if (totalLen + line.length + 1 > config.maxAssetContext) {
                block += '- … (truncated)\n'
                return `Assets:${block.trimEnd()}`
            }
            block += `${line}\n`
            totalLen += line.length + 1
        }
    }

    return block ? `Assets:${block.trimEnd()}` : null
}

function renderRules(skill: NormalizedSkill): string | null {
    if (skill.runtimeRules.length === 0) return null
    return `Rules:\n${skill.runtimeRules.join('\n')}`
}

/**
 * Compile multimodal payloads from all assets using the registry.
 */
function compileMultimodalAssets(skill: NormalizedSkill, registry: AssetCompilerRegistry, config: CompileConfig): MultimodalContentPart[] {
    const parts: MultimodalContentPart[] = []
    let count = 0

    for (const asset of skill.assets) {
        if (count >= config.maxMultimodalAssets) break
        const compiler = registry.resolve(asset.mimeType)
        const result = compiler.compileMultimodal(asset, config)
        if (result.multimodalPayload?.length) {
            parts.push(...result.multimodalPayload)
            count++
        }
    }

    return parts
}

/**
 * Render a NormalizedSkill into a compiled prompt string and optional multimodal payload.
 * Empty sections are eliminated entirely (never output empty headers).
 */
export function render(skill: NormalizedSkill, registry: AssetCompilerRegistry, config: CompileConfig): RenderResult {
    const sections: { name: string; content: string | null }[] = [
        { name: 'header', content: renderHeader(skill) },
        { name: 'role', content: renderRole(skill) },
        { name: 'behavior', content: renderBehavior(skill) },
        { name: 'knowledge', content: renderKnowledge(skill) },
        { name: 'assets', content: renderSummaryAssets(skill, registry, config) },
        { name: 'rules', content: renderRules(skill) }
    ]

    const activeSections = sections.filter((s) => s.content !== null)
    const compiledPrompt = activeSections.map((s) => s.content).join('\n\n')
    const sectionNames = activeSections.map((s) => s.name)

    let multimodalPayload: MultimodalContentPart[] = []
    if (config.executionMode === 'multimodal' && skill.assets.length > 0) {
        multimodalPayload = compileMultimodalAssets(skill, registry, config)
    }

    return { compiledPrompt, multimodalPayload, sections: sectionNames }
}

/**
 * Render in legacy format that matches the original compileSkillContent() output.
 * Used for backward compatibility with existing SkillTool consumers.
 */
export function renderLegacy(skill: NormalizedSkill, registry: AssetCompilerRegistry, config: CompileConfig): RenderResult {
    const parts: string[] = [`Skill: ${skill.header.name}`]
    const sectionNames: string[] = ['header']

    const instructions = [...skill.behavior, ...skill.knowledge].join('\n')
    if (instructions) {
        parts.push(`\nInstructions:\n${instructions}`)
        sectionNames.push('instructions')
    }

    if (skill.assets.length > 0) {
        const assetSection = renderSummaryAssets(skill, registry, config)
        if (assetSection) {
            parts.push(`\n${assetSection}`)
            sectionNames.push('assets')
        }
    }

    const compiledPrompt = parts.join('\n')

    let multimodalPayload: MultimodalContentPart[] = []
    if (config.executionMode === 'multimodal' && skill.assets.length > 0) {
        const textPart = parts.join('\n')
        multimodalPayload = [{ type: 'text', text: textPart }, ...compileMultimodalAssets(skill, registry, config)]
    }

    return { compiledPrompt, multimodalPayload, sections: sectionNames }
}
