# Skill Compiler Refactor — Mode-Driven Init Compilation

**Depends on:** Phase 5 `_call()` refactor (completed) — `callStrategy.ts` strategy pattern, mode-gated data loading in `getTools()`.

---

## Problem

The `SkillCompiler` class has two compilation methods that implicitly map to folder modes:

-   `compileForTool()` — used for **simple** and **advanced** modes (raw content → normalize → render)
-   `compileForToolFromNodes()` — used for **dedicated** mode (nodes → nodeCompiler → structured prompt)

The caller (`getTools()` in `SkillTool.ts`) still has a `if (fileNodes.length > 0) { ... } else { ... }` branch to choose between them. This is the **init-time** equivalent of the same monolithic-branch problem we fixed in `_call()` with `callStrategy.ts`.

### Current Init Compilation Flow

```
getTools() → files.map(file => {
├── if (fileNodes.length > 0)
│   ├── computeCompileHash()
│   ├── check cache
│   ├── compiler.compileForToolFromNodes()   ← dedicated
│   └── save cache (fire-and-forget)
└── else
    └── compiler.compileForTool()            ← simple/advanced
})
```

### Issues

1. **Mode not explicit** — the branch checks `fileNodes.length` instead of `folderMode`, duplicating the same pattern we eliminated in `_call()`.
2. **Cache logic entangled** — compile cache read/write is mixed into `getTools()` instead of encapsulated in the compiler.
3. **`SkillCompiler` has two unrelated APIs** — `compileForTool()` and `compileForToolFromNodes()` follow different pipelines (normalize+render vs. nodeCompiler) but share no common abstraction.
4. **Adding mode-specific compile behavior** requires editing both `SkillCompiler` and `getTools()`.

---

## Target Architecture

Introduce an `IInitCompileStrategy` interface (parallel to `ICallStrategy` for `_call()`). Each mode gets its own strategy that encapsulates:

1. **What data it needs** (so `getTools()` can skip loading)
2. **How to compile** (which compiler pipeline to use)
3. **Cache management** (only dedicated mode uses compile cache)

```
getTools() → files.map(file => {
    const { summaryContent, multimodalContent } = initStrategy.compile(file, context)
    return new SkillFileTool({ content: summaryContent, ... })
})
```

---

## Mode Compilation Definitions

| Mode          | Pipeline                                                                        | Input                        | Cache               | Output                                                       |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------- | ------------------- | ------------------------------------------------------------ |
| **simple**    | `SkillCompiler.compile()` → raw content → normalize → render                    | File content only, no assets | None                | `{ summaryContent }` — plain text prompt                     |
| **advanced**  | `SkillCompiler.compileForTool()` → raw content → normalize → render with assets | File content + assets        | None                | `{ summaryContent, multimodalContent }`                      |
| **dedicated** | `SkillCompiler.compileForToolFromNodes()` → nodes → nodeCompiler                | Nodes + assets + cache       | `SkillCompileCache` | `{ summaryContent, multimodalContent, hash, tokenEstimate }` |

---

## Work Items

### WI-1: Define `IInitCompileStrategy` interface

**New file**: `compiler/initCompileStrategy.ts`

```typescript
export interface InitCompileContext {
    folder: { id: string; name: string; description?: string }
    file: { id: string; name: string; description?: string; content?: string }
    assets: SkillAssetInput[]
    nodes: SkillNodeInput[]
    compileConfig: CompileConfig
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

export interface IInitCompileStrategy {
    compile(ctx: InitCompileContext): InitCompileResult
}
```

### WI-2: Implement `SimpleInitCompileStrategy`

```typescript
export class SimpleInitCompileStrategy implements IInitCompileStrategy {
    private compiler: SkillCompiler

    constructor(compiler?: SkillCompiler) {
        this.compiler = compiler ?? new SkillCompiler()
    }

    compile(ctx: InitCompileContext): InitCompileResult {
        // Simple mode: compile raw content without assets
        const output = this.compiler.compile(ctx.folder, ctx.file, [], ctx.compileConfig, ctx.totalFileCount)
        return {
            summaryContent: output.compiledPrompt,
            multimodalContent: null
        }
    }
}
```

**Key behavior**: passes empty `[]` for assets — simple mode has no asset awareness.

### WI-3: Implement `AdvancedInitCompileStrategy`

```typescript
export class AdvancedInitCompileStrategy implements IInitCompileStrategy {
    private compiler: SkillCompiler

    constructor(compiler?: SkillCompiler) {
        this.compiler = compiler ?? new SkillCompiler()
    }

    compile(ctx: InitCompileContext): InitCompileResult {
        // Advanced mode: compile raw content WITH asset context
        const result = this.compiler.compileForTool(ctx.folder, ctx.file, ctx.assets, ctx.compileConfig, ctx.totalFileCount)
        return {
            summaryContent: result.summaryContent,
            multimodalContent: result.multimodalContent
        }
    }
}
```

### WI-4: Implement `DedicatedInitCompileStrategy`

```typescript
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
        const cacheHash = computeCompileHash(ctx.nodes, ctx.assets, ctx.compileConfig.executionMode, ctx.compileConfig.maxAssetContext)
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
```

**Key behavior**: encapsulates cache read/write, hash computation, and the fallback to advanced when no nodes exist.

### WI-5: Factory function

```typescript
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
```

### WI-6: Simplify `getTools()` compilation block

Replace the `if/else` branch in `files.map(...)` with a single strategy call:

**Before** (~50 lines):

```typescript
if (fileNodes.length > 0) {
    const cacheHash = computeCompileHash(...)
    const cached = cacheByFileKey[...]
    if (cached) { ... } else {
        const result = compiler.compileForToolFromNodes(...)
        // save cache ...
    }
} else {
    const result = compiler.compileForTool(...)
}
```

**After** (~10 lines):

```typescript
const initStrategy = createInitCompileStrategy(folderMode, compiler)

return files.map((file: any) => {
    const { summaryContent, multimodalContent } = initStrategy.compile({
        folder: { id: folder.id, name: folder.name, description: folder.description },
        file: { id: file.id, name: file.name, description: file.description, content: file.content },
        assets: fileAssets,
        nodes: fileNodes,
        compileConfig,
        totalFileCount: files.length,
        cacheByFileKey,
        cacheRepo: isDedicated ? appDataSource.getRepository(databaseEntities['SkillCompileCache']) : undefined,
        searchOptions,
        folderId,
        executionMode
    })
    // ... construct SkillFileTool
})
```

### WI-7: Remove `computeCompileHash` import from `SkillTool.ts`

After WI-6, `SkillTool.ts` no longer calls `computeCompileHash` directly — it's encapsulated in `DedicatedInitCompileStrategy`. Remove the import.

---

## Files to Create

| File                                                                        | Purpose                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/compiler/initCompileStrategy.ts` | `IInitCompileStrategy` interface + 3 strategy implementations + factory |

## Files to Modify

| File                                                     | Change                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts` | Replace `if/else` compile branch in `files.map()` with `initStrategy.compile()`; remove `computeCompileHash` import |

## Files Unchanged

| File                            | Reason                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `compiler/SkillCompiler.ts`     | `compileForTool()` and `compileForToolFromNodes()` remain — strategies delegate to them |
| `compiler/nodeCompiler.ts`      | Pure function called by `SkillCompiler`, unchanged                                      |
| `compiler/callStrategy.ts`      | Runtime strategy, orthogonal to init-time strategy                                      |
| `compiler/semanticRetriever.ts` | Used by `DedicatedCallStrategy` at runtime, not at init                                 |
| `compiler/types.ts`             | No new types needed (context interface lives in `initCompileStrategy.ts`)               |

---

## Relationship to `callStrategy.ts`

| Concern   | `callStrategy.ts` (runtime)            | `initCompileStrategy.ts` (init-time)         |
| --------- | -------------------------------------- | -------------------------------------------- |
| When      | `_call()` — every LLM tool invocation  | `getTools()` — chatflow initialization       |
| Purpose   | Retrieve relevant content for a query  | Pre-compile content for the tool description |
| Simple    | Return `content` directly              | Compile raw markdown, no assets              |
| Advanced  | Return `content` or multimodal payload | Compile markdown + asset context             |
| Dedicated | Semantic retrieval → node compile      | Cache-aware node compilation                 |

Both strategy families are driven by `folderMode` and eliminate mode-specific `if/else` branches from their respective call sites.

---

## Migration Risk

**Zero** — pure refactor. No DB changes, no API changes, no UI changes. Strategies delegate to the same `SkillCompiler` methods that exist today.

---

## Validation

-   [ ] TypeScript compilation passes
-   [ ] Simple folder: same compiled output as before
-   [ ] Advanced folder: same compiled output + multimodal as before
-   [ ] Dedicated folder: same cache behavior, same node compilation output
-   [ ] Dedicated folder with no nodes: falls back to advanced compilation
-   [ ] Pre-migration folder (no `mode` column): `inferFolderMode()` picks correct strategy
