/**
 * Mode-driven call strategies for SkillFileTool._call().
 *
 * Each folder mode (simple, advanced, dedicated) gets its own strategy
 * so that _call() delegates cleanly instead of using a monolithic if/else chain.
 */

import { ICommonObject } from '../../../../src/Interface'
import {
    MultimodalContentPart,
    MULTIMODAL_CONTENT_KEY,
    SkillAssetInput,
    SkillNodeInput,
    SkillEdgeInput,
    NodeCompileConfig,
    NodeEmbeddingInput
} from './types'
import { compileFromNodes } from './nodeCompiler'
import { retrieveRelevantNodes } from './semanticRetriever'

// ─── Context Interface ───────────────────────────────────────────

export interface CallStrategyContext {
    content: string
    multimodalContent: MultimodalContentPart[] | null
    nodes: SkillNodeInput[] | null
    edges: SkillEdgeInput[] | null
    skillName: string
    skillDescription: string
    fileAssets: SkillAssetInput[]
    nodeCompileConfig: NodeCompileConfig | null
    maxRetrievedNodes: number
    embeddings: NodeEmbeddingInput[]
    embeddingModelConfig: ICommonObject | null
    embeddingModelInstance: any | null
}

// ─── Strategy Interface ──────────────────────────────────────────

export interface ICallStrategy {
    execute(input: string, ctx: CallStrategyContext): Promise<string>
}

// ─── Simple Strategy ─────────────────────────────────────────────

/**
 * Simple mode: return pre-compiled content directly.
 * No retrieval, no assets, no multimodal — just the markdown text.
 */
export class SimpleCallStrategy implements ICallStrategy {
    async execute(_input: string, ctx: CallStrategyContext): Promise<string> {
        return ctx.content
    }
}

// ─── Advanced Strategy ───────────────────────────────────────────

/**
 * Advanced mode: return pre-compiled content with asset-aware compilation.
 * Supports multimodal payloads when executionMode is 'multimodal'.
 * No node retrieval — uses content compiled at init time.
 */
export class AdvancedCallStrategy implements ICallStrategy {
    async execute(_input: string, ctx: CallStrategyContext): Promise<string> {
        if (ctx.multimodalContent) {
            return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: ctx.multimodalContent })
        }
        return ctx.content
    }
}

// ─── Dedicated Strategy ──────────────────────────────────────────

/**
 * Dedicated mode: full semantic retrieval + node-aware compilation.
 * Embeds query → retrieves relevant nodes → compiles structured prompt.
 * Falls back to advanced behavior if no nodes are available.
 */
export class DedicatedCallStrategy implements ICallStrategy {
    async execute(input: string, ctx: CallStrategyContext): Promise<string> {
        // If nodes are available, use semantic retrieval + node compilation
        if (ctx.nodes && ctx.nodes.length > 0 && ctx.nodeCompileConfig) {
            const queryEmbedding = await this.generateQueryEmbedding(input, ctx)

            const relevantNodes = retrieveRelevantNodes(input, ctx.nodes, ctx.edges || [], ctx.embeddings, queryEmbedding, {
                maxNodes: ctx.maxRetrievedNodes
            })

            const { compiledPrompt, multimodalPayload } = compileFromNodes(
                ctx.skillName,
                ctx.skillDescription,
                relevantNodes,
                ctx.fileAssets,
                ctx.nodeCompileConfig
            )

            console.log(
                `Retrieved ${relevantNodes.length} relevant nodes for query "${input}". Compiled prompt length: ${compiledPrompt.length}.`
            )

            if (ctx.nodeCompileConfig.executionMode === 'multimodal' && multimodalPayload.length > 0) {
                return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: multimodalPayload })
            }
            return compiledPrompt
        }

        // Fallback: no nodes yet, behave like advanced mode
        if (ctx.multimodalContent) {
            return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: ctx.multimodalContent })
        }
        return ctx.content
    }

    private async generateQueryEmbedding(query: string, ctx: CallStrategyContext): Promise<number[] | null> {
        if (!ctx.embeddingModelInstance) return null
        if (!ctx.embeddings.length) return null

        try {
            console.log(`Generating embedding for query: "${query}" using model ${ctx.embeddingModelConfig?.name}`)
            const result = await ctx.embeddingModelInstance.embedQuery(query)
            return result
        } catch (error) {
            console.log(`Embedding generation failed for query "${query}": ${error}`)
            return null
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────────

const STRATEGIES: Record<string, ICallStrategy> = {
    simple: new SimpleCallStrategy(),
    advanced: new AdvancedCallStrategy(),
    dedicated: new DedicatedCallStrategy()
}

export function createCallStrategy(mode: string): ICallStrategy {
    return STRATEGIES[mode] || STRATEGIES['simple']
}
