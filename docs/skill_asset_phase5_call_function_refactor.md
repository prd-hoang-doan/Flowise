Let me explore the current codebase to understand the compiler infrastructure and frontend modes before writing the plan.

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/SkillTool.ts#1-1), lines 1 to 130

Searched for files matching `**/SkillTool/compiler/**`, 14 matches

Searched for regex `simple|advanced|dedicated` (`**/packages/ui/src/**/*.{jsx,tsx,js,ts}`), 30 results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/types.ts#1-1), lines 1 to 100

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/nodeCompiler.ts#1-1), lines 1 to 100

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/SkillCompiler.ts#1-1), lines 1 to 80

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/semanticRetriever.ts#1-1), lines 1 to 80

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/types.ts#100-100), lines 100 to 170

Searched for regex `mode.*simple.*advanced.*dedicated` (`**/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx`), no results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#240-240), lines 240 to 270

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#1230-1230), lines 1230 to 1270

Searched for text `mode` (`**/packages/server/src/database/entities/SkillFolder.ts`), 3 results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/SkillTool.ts#125-125), lines 125 to 510

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/server/src/database/entities/SkillFolder.ts#1-1), lines 1 to 40

Now I have a full picture. Let me also check if the folder `mode` is currently passed through to `SkillFileTool` at all:

Searched for text `mode` (`**/packages/components/nodes/tools/SkillTool/SkillTool.ts`), 20 results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/components/nodes/tools/SkillTool/compiler/nodeCompiler.ts#100-100), lines 100 to 200

Now I have full context. Here's the refactoring plan:

---

## Refactoring Plan: Mode-Driven `_call()` Strategy

### Problem

The current `_call()` in `SkillFileTool` uses **implicit mode detection** — it checks `if (this.nodes && this.nodes.length > 0)` to decide the compilation path. The folder's `mode` field (`simple | advanced | dedicated`) is never read. This causes:

1. **No clear mapping** between UI modes and runtime behavior
2. **`getTools()` loads everything** (nodes, edges, embeddings, cache) even for `simple` mode folders
3. **`simple` and `advanced` are conflated** in the same fallback `else` branch
4. **Hard to maintain** — adding mode-specific behavior requires touching the monolithic `_call()` conditional chain

### Current `_call()` Flow

```
_call(input)
├── if (nodes + nodeCompileConfig)    ← implicitly "dedicated"
│   ├── generateQueryEmbedding()
│   ├── retrieveRelevantNodes()
│   ├── compileFromNodes()
│   └── return compiledPrompt / multimodal
├── else if (multimodalContent)       ← implicitly "advanced" multimodal
│   └── return multimodal JSON
└── else                              ← implicitly "simple" or "advanced" summary
    └── return this.content
```

### Target Architecture

Introduce an explicit **`folderMode`** field on `SkillFileTool` and a **`CallStrategy`** interface. Each mode gets its own strategy class, cleanly separating concerns.

```
_call(input)
└── this.strategy.execute(input, this)
    ├── SimpleCallStrategy       → return pre-compiled content
    ├── AdvancedCallStrategy     → return content + asset-aware compilation
    └── DedicatedCallStrategy    → semantic retrieval + node compilation
```

### Mode Definitions

| Mode          | Folder Features                     | `_call()` Behavior                                                                       | Data Loaded                                         |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **simple**    | Source + Preview only               | Return pre-compiled markdown content directly. No retrieval, no assets.                  | Files only                                          |
| **advanced**  | Source + Preview + Assets + Summary | Return compiled content with asset context (summary or multimodal). No node retrieval.   | Files + Assets                                      |
| **dedicated** | All tabs (incl. Nodes)              | Semantic retrieval → node-aware compilation → structured prompt. Full embedding support. | Files + Assets + Nodes + Edges + Embeddings + Cache |

---

### Work Items

#### WI-1: Add `CallStrategy` interface and three implementations

**New file**: `compiler/callStrategy.ts`

```typescript
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

export interface ICallStrategy {
    execute(input: string, ctx: CallStrategyContext): Promise<string>
}
```

Three implementations in the same file:

-   **`SimpleCallStrategy`**: Returns `ctx.content` directly. No processing.
-   **`AdvancedCallStrategy`**: Returns `ctx.content` or multimodal payload if available. Mirrors the current fallback path.
-   **`DedicatedCallStrategy`**: Embeds query → retrieves relevant nodes → compiles from nodes → returns compiled prompt or multimodal payload. Encapsulates the current node-aware path.

**Factory function**:

```typescript
export function createCallStrategy(mode: string): ICallStrategy
```

#### WI-2: Add `folderMode` field to `SkillFileTool`

-   Add `private folderMode: string` field (default: `'simple'`)
-   Add `private strategy: ICallStrategy` field
-   In constructor: `this.strategy = createCallStrategy(fields.folderMode ?? 'simple')`
-   Move `generateQueryEmbedding()` into `DedicatedCallStrategy` (only mode that needs it)

#### WI-3: Refactor `_call()` to delegate

Replace the entire `_call()` body with:

```typescript
async _call(input: string): Promise<string> {
    return this.strategy.execute(input, {
        content: this.content,
        multimodalContent: this.multimodalContent,
        nodes: this.nodes,
        edges: this.edges,
        skillName: this.skillName,
        skillDescription: this.skillDescription,
        fileAssets: this.fileAssets,
        nodeCompileConfig: this.nodeCompileConfig,
        maxRetrievedNodes: this.maxRetrievedNodes,
        embeddings: this.embeddings,
        embeddingModelConfig: this.embeddingModelConfig,
        embeddingModelInstance: this.embeddingModelInstance
    })
}
```

#### WI-4: Optimize `getTools()` data loading by mode

Read `folder.mode` early and skip unnecessary DB queries:

| Query                       | simple | advanced | dedicated |
| --------------------------- | ------ | -------- | --------- |
| `SkillFile.find()`          | Yes    | Yes      | Yes       |
| `SkillAsset.find()`         | Skip   | Yes      | Yes       |
| `SkillNode.find()`          | Skip   | Skip     | Yes       |
| `SkillEdge.find()`          | Skip   | Skip     | Yes       |
| `SkillCompileCache.find()`  | Skip   | Skip     | Yes       |
| `SkillNodeEmbedding.find()` | Skip   | Skip     | Yes       |
| `createEmbeddingInstance()` | Skip   | Skip     | Yes       |

This reduces DB queries and memory usage for `simple` and `advanced` folders.

#### WI-5: Pass `folderMode` through to `SkillFileTool` constructor

In the `files.map(...)` block inside `getTools()`, pass `folderMode: folder.mode || 'simple'` to the `SkillFileTool` constructor.

#### WI-6: Backward compatibility guard

If `folder.mode` is null/undefined (pre-migration folders), infer the mode:

-   If nodes exist → `'dedicated'`
-   If assets exist → `'advanced'`
-   Otherwise → `'simple'`

This ensures existing folders behave identically without requiring a data migration of the `mode` column.

---

### Files to Create

| File                                                                 | Purpose                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/compiler/callStrategy.ts` | `ICallStrategy` interface + `SimpleCallStrategy`, `AdvancedCallStrategy`, `DedicatedCallStrategy` + factory |

### Files to Modify

| File         | Change                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| SkillTool.ts | Add `folderMode` + `strategy` fields; refactor `_call()`; optimize `getTools()` loading by mode; pass mode to constructor |
| types.ts     | Add `CallStrategyContext` type (optional — can live in `callStrategy.ts`)                                                 |

### Files Unchanged

-   `compiler/nodeCompiler.ts` — pure function, called by `DedicatedCallStrategy`
-   `compiler/semanticRetriever.ts` — pure function, called by `DedicatedCallStrategy`
-   `compiler/SkillCompiler.ts` — used by `getTools()` for init-time compilation, unchanged
-   All server-side files — no DB schema changes needed

### Migration Risk

**Zero** — this is a pure refactor of runtime behavior. The `mode` column already exists on `SkillFolder`. No new migrations, no API changes, no UI changes.

---
