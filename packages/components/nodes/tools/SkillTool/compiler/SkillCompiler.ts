import { createHash } from 'crypto'
import {
    SkillRuntimeInput,
    SkillFileInput,
    SkillAssetInput,
    NormalizedSkill,
    CompileConfig,
    CompiledSkillOutput,
    SkillMetadata,
    DEFAULT_COMPILE_CONFIG,
    MultimodalContentPart,
    SkillNodeInput,
    NodeCompileConfig
} from './types'
import { normalize, stripFrontMatter, formatToolName } from './normalizer'
import { renderLegacy } from './renderer'
import { AssetCompilerRegistry } from './assetCompilers'
import { compileFromNodes as compileNodes, computeCompileHash } from './nodeCompiler'

export class SkillCompiler {
    private registry: AssetCompilerRegistry

    constructor(registry?: AssetCompilerRegistry) {
        this.registry = registry ?? new AssetCompilerRegistry()
    }

    /**
     * Stage A: Load — convert raw DB objects into a canonical SkillRuntimeInput.
     * Decouples the compiler from the DB schema.
     */
    load(
        folder: { id: string; name: string; description?: string },
        file: SkillFileInput,
        assets: SkillAssetInput[],
        config?: Partial<CompileConfig>
    ): SkillRuntimeInput {
        const mergedConfig: CompileConfig = { ...DEFAULT_COMPILE_CONFIG, ...config }
        const rawContent = file.content || ''
        const instructions = stripFrontMatter(rawContent)

        return {
            skillId: file.id,
            name: file.name,
            description: file.description || '',
            instructions,
            files: [file],
            assets: assets.filter((a) => a.fileId === file.id),
            executionMode: mergedConfig.executionMode,
            config: mergedConfig
        }
    }

    /**
     * Stage B: Normalize — convert into canonical slot structure.
     */
    normalize(input: SkillRuntimeInput): NormalizedSkill {
        return normalize(input, this.registry)
    }

    /**
     * Stage C + D: Compile assets and render the final output.
     * Returns the complete compiled skill output with metadata and hash.
     */
    render(skill: NormalizedSkill, config: CompileConfig, fileCount: number): CompiledSkillOutput {
        const { compiledPrompt, multimodalPayload, sections } = renderLegacy(skill, this.registry, config)

        const assetSummary = this.buildAssetSummary(skill)
        const metadata: SkillMetadata = {
            skillName: skill.header.name,
            fileCount,
            assetSummary,
            executionMode: config.executionMode,
            compiledAt: new Date().toISOString(),
            sections
        }

        const hash = createHash('sha256').update(compiledPrompt).digest('hex').slice(0, 16)
        const tokenEstimate = estimateTokens(compiledPrompt)

        return { compiledPrompt, multimodalPayload, metadata, tokenEstimate, hash }
    }

    /**
     * Full pipeline: Load → Normalize → Render.
     * Convenience method that runs the entire compilation for a single file.
     */
    compile(
        folder: { id: string; name: string; description?: string },
        file: SkillFileInput,
        assets: SkillAssetInput[],
        config?: Partial<CompileConfig>,
        totalFileCount?: number
    ): CompiledSkillOutput {
        const input = this.load(folder, file, assets, config)
        const normalized = this.normalize(input)
        return this.render(normalized, input.config, totalFileCount ?? 1)
    }

    /**
     * Compile for runtime use, returning the same shape as the old inline methods:
     * { summaryContent, multimodalContent }
     */
    compileForTool(
        folder: { id: string; name: string; description?: string },
        file: SkillFileInput,
        assets: SkillAssetInput[],
        config?: Partial<CompileConfig>,
        totalFileCount?: number
    ): { summaryContent: string; multimodalContent: MultimodalContentPart[] | null; output: CompiledSkillOutput } {
        const output = this.compile(folder, file, assets, config, totalFileCount)
        const multimodalContent =
            output.metadata.executionMode === 'multimodal' && output.multimodalPayload.length > 0 ? output.multimodalPayload : null
        return { summaryContent: output.compiledPrompt, multimodalContent, output }
    }

    /**
     * Node-aware compilation: compile from structured nodes instead of raw content.
     * Used when nodes have been extracted from the skill file (Phase 4).
     * Falls back to raw content compilation when no nodes exist.
     */
    compileForToolFromNodes(
        folder: { id: string; name: string; description?: string },
        file: SkillFileInput,
        nodes: SkillNodeInput[],
        assets: SkillAssetInput[],
        config?: Partial<CompileConfig>,
        maxTokenBudget?: number
    ): { summaryContent: string; multimodalContent: MultimodalContentPart[] | null; hash: string; tokenEstimate: number } {
        // If no nodes, fall back to raw content compilation
        if (!nodes.length) {
            const result = this.compileForTool(folder, file, assets, config)
            return {
                summaryContent: result.summaryContent,
                multimodalContent: result.multimodalContent,
                hash: result.output.hash,
                tokenEstimate: result.output.tokenEstimate
            }
        }

        const mergedConfig: CompileConfig = { ...DEFAULT_COMPILE_CONFIG, ...config }
        const nodeConfig: NodeCompileConfig = {
            executionMode: mergedConfig.executionMode,
            maxAssetContext: mergedConfig.maxAssetContext,
            maxMultimodalAssets: mergedConfig.maxMultimodalAssets,
            maxDocumentChars: mergedConfig.maxDocumentChars,
            maxTokenBudget: maxTokenBudget || 0
        }

        const { compiledPrompt, multimodalPayload } = compileNodes(file.name, file.description || '', nodes, assets, nodeConfig)

        const hash = computeCompileHash(nodes, assets, mergedConfig.executionMode, mergedConfig.maxAssetContext)
        const tokenEstimate = estimateTokens(compiledPrompt)
        const multimodalContent = mergedConfig.executionMode === 'multimodal' && multimodalPayload.length > 0 ? multimodalPayload : null

        return { summaryContent: compiledPrompt, multimodalContent, hash, tokenEstimate }
    }

    getRegistry(): AssetCompilerRegistry {
        return this.registry
    }

    private buildAssetSummary(skill: NormalizedSkill): { category: string; count: number }[] {
        const counts: Record<string, number> = {}
        for (const asset of skill.assets) {
            counts[asset.category] = (counts[asset.category] || 0) + 1
        }
        return AssetCompilerRegistry.CATEGORY_ORDER.filter((cat) => counts[cat]).map((cat) => ({ category: cat, count: counts[cat] }))
    }
}

/**
 * Rough token estimate: ~4 chars per token for English text.
 * Good enough for budget display; not a substitute for a real tokenizer.
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

export { formatToolName }
