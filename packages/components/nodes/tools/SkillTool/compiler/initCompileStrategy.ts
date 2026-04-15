/**
 * Mode-driven init-time compilation strategies for SkillTool.getTools().
 *
 * Each folder mode (simple, advanced, dedicated) gets its own strategy
 * that encapsulates the compilation pipeline + cache management.
 * Parallel to callStrategy.ts which handles runtime _call() dispatch.
 */

import { MultimodalContentPart, SkillAssetInput, SkillFileInput, SkillNodeInput, CompileConfig } from './types'
import { SkillCompiler } from './SkillCompiler'
import { computeCompileHash } from './nodeCompiler'

// ─── Context & Result Interfaces ─────────────────────────────────

export interface InitCompileContext {
    folder: { id: string; name: string; description?: string }
    file: SkillFileInput
    assets: SkillAssetInput[]
    nodes: SkillNodeInput[]
    compileConfig: Partial<CompileConfig>
    totalFileCount: number
    // Cache support (dedicated only)
    cacheByFileKey: Record<string, { compiledPrompt: string }>
    // DB references for cache write (dedicated only)
    cacheRepo?: any
    searchOptions?: any
    folderId?: string
    executionMode?: string
}

export interface InitCompileResult {
    summaryContent: string
    multimodalContent: MultimodalContentPart[] | null
}

// ─── Strategy Interface ──────────────────────────────────────────

export interface IInitCompileStrategy {
    compile(ctx: InitCompileContext): InitCompileResult
}

// ─── Simple Strategy ─────────────────────────────────────────────

/**
 * Simple mode: compile raw content without assets.
 * Pipeline: Load → Normalize → Render (no asset context).
 */
export class SimpleInitCompileStrategy implements IInitCompileStrategy {
    private compiler: SkillCompiler

    constructor(compiler?: SkillCompiler) {
        this.compiler = compiler ?? new SkillCompiler()
    }

    compile(ctx: InitCompileContext): InitCompileResult {
        const output = this.compiler.compile(ctx.folder, ctx.file, [], ctx.compileConfig, ctx.totalFileCount)
        return {
            summaryContent: output.compiledPrompt,
            multimodalContent: null
        }
    }
}

// ─── Advanced Strategy ───────────────────────────────────────────

/**
 * Advanced mode: compile raw content WITH asset context.
 * Pipeline: Load → Normalize → Render (with assets + optional multimodal).
 */
export class AdvancedInitCompileStrategy implements IInitCompileStrategy {
    private compiler: SkillCompiler

    constructor(compiler?: SkillCompiler) {
        this.compiler = compiler ?? new SkillCompiler()
    }

    compile(ctx: InitCompileContext): InitCompileResult {
        const result = this.compiler.compileForTool(ctx.folder, ctx.file, ctx.assets, ctx.compileConfig, ctx.totalFileCount)
        return {
            summaryContent: result.summaryContent,
            multimodalContent: result.multimodalContent
        }
    }
}

// ─── Dedicated Strategy ──────────────────────────────────────────

/**
 * Dedicated mode: cache-aware node compilation.
 * Pipeline: check cache → compileForToolFromNodes → save cache.
 * Falls back to advanced compilation when no nodes exist yet.
 */
export class DedicatedInitCompileStrategy implements IInitCompileStrategy {
    private compiler: SkillCompiler

    constructor(compiler?: SkillCompiler) {
        this.compiler = compiler ?? new SkillCompiler()
    }

    compile(ctx: InitCompileContext): InitCompileResult {
        if (ctx.nodes.length === 0) {
            // No nodes yet — fall back to advanced compilation
            const result = this.compiler.compileForTool(ctx.folder, ctx.file, ctx.assets, ctx.compileConfig, ctx.totalFileCount)
            return { summaryContent: result.summaryContent, multimodalContent: result.multimodalContent }
        }

        // Check cache first
        const cacheHash = computeCompileHash(
            ctx.nodes,
            ctx.assets,
            ctx.compileConfig.executionMode || 'summary',
            ctx.compileConfig.maxAssetContext || 2000
        )
        const cached = ctx.cacheByFileKey[`${ctx.file.id}:${cacheHash}`]

        if (cached) {
            return { summaryContent: cached.compiledPrompt, multimodalContent: null }
        }

        // Compile from nodes
        const result = this.compiler.compileForToolFromNodes(ctx.folder, ctx.file, ctx.nodes, ctx.assets, ctx.compileConfig)

        // Save cache (fire-and-forget)
        if (ctx.cacheRepo) {
            this.saveCache(ctx, cacheHash, result.summaryContent, result.tokenEstimate)
        }

        return { summaryContent: result.summaryContent, multimodalContent: result.multimodalContent }
    }

    private saveCache(ctx: InitCompileContext, hash: string, compiledPrompt: string, tokenCount: number): void {
        try {
            ctx.cacheRepo
                .delete({ skillFileId: ctx.file.id, executionMode: ctx.executionMode, ...ctx.searchOptions })
                .then(() => {
                    const entry = ctx.cacheRepo.create({
                        skillFileId: ctx.file.id,
                        folderId: ctx.folderId,
                        hash,
                        compiledPrompt,
                        tokenCount,
                        executionMode: ctx.executionMode,
                        workspaceId: ctx.searchOptions?.workspaceId || ''
                    })
                    ctx.cacheRepo.save(entry).catch(() => {})
                })
                .catch(() => {})
        } catch {
            // Cache save is best-effort
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────────

export function createInitCompileStrategy(mode: string, compiler?: SkillCompiler): IInitCompileStrategy {
    switch (mode) {
        case 'dedicated':
            return new DedicatedInitCompileStrategy(compiler)
        case 'advanced':
            return new AdvancedInitCompileStrategy(compiler)
        default:
            return new SimpleInitCompileStrategy(compiler)
    }
}
