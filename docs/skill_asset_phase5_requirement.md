# Skill Asset Support — Phase 5 Requirement

## Embedding-Based Node Retrieval and Node-First Runtime Architecture

**Depends on:** Phase 4 (completed) — SkillNode/SkillEdge/SkillCompileCache entities, node extraction pipeline, node-aware compilation, keyword-based node retrieval, compile cache.

---

## Guiding Principle

> **Replace keyword matching with semantic similarity; serve nodes — not compiled blobs — to the LLM.**

-   Embedding vectors replace lexical keyword overlap for retrieval scoring
-   Runtime sends selected nodes directly, not a pre-compiled monolithic prompt
-   The LLM receives only contextually relevant content, reducing token waste
-   Embedding infrastructure is reusable across future skill features (cross-skill search, dedup)

---

## Current State (Phase 1–4 Completed)

### Existing Retrieval Pipeline

| Layer           | Mechanism                                                                 | Limitation                                                        |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Node extraction | Deterministic 8-stage pipeline (parse → segment → classify → persist)     | ✅ Works well                                                     |
| Node retrieval  | Keyword overlap scoring: trigger match (2×) + content match (1×)          | Misses semantic similarity; fails on paraphrases and synonyms     |
| Edge expansion  | Follow `supports` edges from retrieved candidates                         | ✅ Works well                                                     |
| Compilation     | Nodes compiled into structured text blob; cached via `SkillCompileCache`  | Entire compiled prompt sent to LLM even when only subset relevant |
| `_call()` path  | `retrieveRelevantNodes()` → `compileFromNodes()` → return compiled string | Re-compiles on every call; compiled output is opaque to LLM       |

### What Works

-   `SkillNode.embeddingText` field exists (nullable, not yet populated)
-   `SkillNode.triggers` provides curated keyword lists for each node
-   `SkillNodeInput`, `SkillEdgeInput`, `NodeCompileConfig` types are defined in `compiler/types.ts`
-   `SkillCompileCache` stores hash-keyed compiled prompts
-   `SkillFolder.captionModelConfig` stores model configuration (usable for embedding model config)
-   Node priority + type ordering already implemented in `nodeCompiler.ts`

### What Needs to Change

-   **No embedding vectors** — `embeddingText` is never populated; no vectors stored
-   **No semantic scoring** — retrieval (`retriever.ts`) uses only keyword overlap
-   **Compiled blob at runtime** — `_call()` re-compiles all retrieved nodes into a single string, losing structure
-   **No embedding model configuration** — no UI or config to select/configure the embedding model
-   **No vector storage** — no table or in-memory index for embedding vectors
-   **No incremental embedding** — no pipeline to generate embeddings on node save/update

---

## Phase 5 Goals

1. **Embedding generation pipeline** — generate embedding vectors for every node on extraction
2. **SkillNodeEmbedding entity** — store vectors in a dedicated table (separate from the node entity)
3. **Semantic retrieval** — replace keyword scoring with cosine similarity on embedding vectors
4. **Hybrid scoring** — combine semantic similarity with keyword overlap and priority boosting
5. **Node-first runtime** — send structured node array to the LLM instead of a compiled text blob
6. **Embedding model configuration** — per-folder embedding model selection (reuse `captionModelConfig` pattern)
7. **Incremental embedding updates** — only re-embed nodes whose content changed

---

## WI-P5-1: SkillNodeEmbedding Entity + Migration (DONE)

### Problem

Embedding vectors need persistent storage. Storing them as a column on `SkillNode` would make the entity too wide and slow down node queries that don't need vectors. A separate entity keeps the node table lean and allows different vector dimensions per embedding model.

### Design

#### Entity Schema

```typescript
SkillNodeEmbedding {
  id: string              // UUID primary key
  nodeId: string           // FK → SkillNode.id (unique — one embedding per node)
  skillFileId: string      // FK → SkillFile.id (denormalized for bulk queries)
  folderId: string         // FK → SkillFolder.id (denormalized)
  embedding: string        // JSON-serialized float[] vector
  dimension: number        // vector dimension (e.g. 384, 768, 1536)
  modelId: string          // identifier of embedding model used (e.g. "text-embedding-3-small")
  contentHash: string      // SHA-256 of node content used to generate this embedding
  createdDate: Date
  workspaceId: string
}
```

#### Key Decisions

| Decision                       | Rationale                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Separate table (not column)    | Keeps `SkillNode` queries fast; vectors are large (KBs per row)                |
| JSON-serialized vector         | Portable across SQLite/MySQL/Postgres/MariaDB without pgvector dependency      |
| `contentHash` per embedding    | Enables incremental re-embedding: skip nodes whose content hasn't changed      |
| `modelId` stored per embedding | Allows model upgrades without losing track of which model produced each vector |
| `dimension` stored per row     | Self-documenting; allows validation on load                                    |

#### Why Not pgvector / Vector Database?

Phase 5 prioritizes portability across all 4 supported databases (SQLite, MySQL, PostgreSQL, MariaDB). Cosine similarity is computed in-process from JSON-deserialized arrays. This is efficient for the expected scale (hundreds to low thousands of nodes per skill folder). A dedicated vector database can be adopted in a future phase if scale demands it.

### Files to Create

| File                                                                                      | Purpose                   |
| ----------------------------------------------------------------------------------------- | ------------------------- |
| `packages/server/src/database/entities/SkillNodeEmbedding.ts`                             | TypeORM entity definition |
| `packages/server/src/database/migrations/sqlite/1770000000000-AddSkillNodeEmbedding.ts`   | SQLite migration          |
| `packages/server/src/database/migrations/mysql/1770000000000-AddSkillNodeEmbedding.ts`    | MySQL migration           |
| `packages/server/src/database/migrations/postgres/1770000000000-AddSkillNodeEmbedding.ts` | PostgreSQL migration      |
| `packages/server/src/database/migrations/mariadb/1770000000000-AddSkillNodeEmbedding.ts`  | MariaDB migration         |

### Files to Modify

| File                                             | Change                              |
| ------------------------------------------------ | ----------------------------------- |
| `packages/server/src/Interface.ts`               | Add `ISkillNodeEmbedding` interface |
| `packages/server/src/database/entities/index.ts` | Export `SkillNodeEmbedding` entity  |
| DataSource configs for all 4 DB types            | Register `SkillNodeEmbedding`       |
| `packages/server/src/utils/databaseEntities.ts`  | Add to entity map                   |

### Database Indexes

```sql
CREATE UNIQUE INDEX idx_embedding_node ON skill_node_embedding (nodeId);
CREATE INDEX idx_embedding_file ON skill_node_embedding (skillFileId);
CREATE INDEX idx_embedding_folder ON skill_node_embedding (folderId);
CREATE INDEX idx_embedding_model ON skill_node_embedding (modelId);
```

### Checklist

-   [ ] Define `ISkillNodeEmbedding` interface in `Interface.ts`
-   [ ] Create `SkillNodeEmbedding` entity
-   [ ] Create migrations for all 4 DB types (with indexes)
-   [ ] Register entity in DataSource configs and entity map
-   [ ] Verify migration runs cleanly on all DB types

---

## WI-P5-2: Embedding Model Configuration (DONE)

### Problem

Different users may prefer different embedding models (OpenAI `text-embedding-3-small`, local sentence-transformers, Cohere, etc.). The system needs a way to configure which model generates node embeddings for each skill folder.

### Design

Reuse the `captionModelConfig` pattern from Phase 2 (vision LLM config per folder). Add a new `embeddingModelConfig` column to `SkillFolder`.

#### Schema Change

```typescript
// Add to SkillFolder entity
@Column({ nullable: true, type: 'text' })
embeddingModelConfig?: string  // JSON: { provider, model, credentialId, dimensions? }
```

#### Configuration Structure

```typescript
interface EmbeddingModelConfig {
    provider: string // e.g. 'openai', 'cohere', 'huggingface', 'ollama'
    model: string // e.g. 'text-embedding-3-small', 'all-MiniLM-L6-v2'
    credentialId?: string // FK to stored credential (for API-based providers)
    dimensions?: number // optional: override default dimensions
    batchSize?: number // optional: batch size for bulk embedding (default 100)
}
```

#### Default Behavior

-   If `embeddingModelConfig` is null → embedding generation is **skipped** (system operates in Phase 4 keyword-only mode)
-   This ensures backward compatibility and opt-in semantics

#### UI Integration

Add an "Embedding Model" configuration section to the `SkillFolderEditorDialog`, similar to the existing "Caption Model" section. Reuse the `CaptionModelInputHandler` pattern to render provider/model/credential fields.

### Files to Create

| File                                                                                        | Purpose                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `packages/server/src/database/migrations/sqlite/1770100000000-AddEmbeddingModelConfig.ts`   | SQLite migration                        |
| `packages/server/src/database/migrations/mysql/1770100000000-AddEmbeddingModelConfig.ts`    | MySQL migration                         |
| `packages/server/src/database/migrations/postgres/1770100000000-AddEmbeddingModelConfig.ts` | PostgreSQL migration                    |
| `packages/server/src/database/migrations/mariadb/1770100000000-AddEmbeddingModelConfig.ts`  | MariaDB migration                       |
| `packages/ui/src/views/tools/EmbeddingModelInputHandler.jsx`                                | UI component for embedding model config |

### Files to Modify

| File                                                      | Change                                                |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `packages/server/src/database/entities/SkillFolder.ts`    | Add `embeddingModelConfig` column                     |
| `packages/server/src/Interface.ts`                        | Add `embeddingModelConfig?: string` to `ISkillFolder` |
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Add embedding model config section                    |

### Checklist

-   [ ] Add `embeddingModelConfig` column to `SkillFolder` entity
-   [ ] Update `ISkillFolder` interface
-   [ ] Create migrations for all 4 DB types
-   [ ] Create `EmbeddingModelInputHandler` UI component
-   [ ] Add embedding config section to `SkillFolderEditorDialog`
-   [ ] API: save `embeddingModelConfig` via `updateSkillFolder`
-   [ ] Verify existing folders are unaffected (nullable column)

---

## WI-P5-3: Embedding Generation Service (DONE)

### Problem

When nodes are extracted (Phase 4), their embedding vectors must be generated using the configured embedding model. This needs to be reliable, incremental, and resilient to API failures.

### Design

Create a `SkillEmbeddingService` that generates and persists embedding vectors.

#### Service API

```typescript
class SkillEmbeddingService {
    /**
     * Generate embeddings for all nodes in a skill file.
     * Skips nodes whose contentHash hasn't changed.
     */
    async embedNodesForFile(
        skillFileId: string,
        folderId: string,
        nodes: ISkillNode[],
        config: EmbeddingModelConfig,
        appDataSource: DataSource,
        workspaceId: string
    ): Promise<EmbedResult>

    /**
     * Re-embed all nodes in a folder (e.g. after model change).
     */
    async reembedFolder(
        folderId: string,
        config: EmbeddingModelConfig,
        appDataSource: DataSource,
        workspaceId: string
    ): Promise<EmbedResult>

    /**
     * Delete embeddings for a skill file (cleanup).
     */
    async deleteBySkillFileId(skillFileId: string, appDataSource: DataSource, workspaceId: string): Promise<void>
}
```

#### Embedding Text Preparation

Each node's embedding text is derived from its content with type-aware prefixing:

```typescript
function prepareEmbeddingText(node: ISkillNode): string {
    const prefix = EMBEDDING_PREFIXES[node.type] || ''
    const triggers = node.triggers ? ` [${JSON.parse(node.triggers).join(', ')}]` : ''
    return `${prefix}${node.content}${triggers}`
}

const EMBEDDING_PREFIXES: Record<string, string> = {
    role: 'Role: ',
    rule: 'Rule: ',
    behavior: 'Instruction: ',
    knowledge: 'Knowledge: ',
    asset: 'Asset: '
}
```

**Why prefix?** Prefixes improve embedding quality by providing the model with semantic context about the node's purpose. A rule and a knowledge fact with similar wording (e.g. "Use short sentences") should be distinguished in vector space.

**Why triggers?** Appending trigger keywords enriches the embedding with curated terms that may not appear in the content itself.

#### Incremental Embedding

For each node:

1. Compute `contentHash = SHA256(prepareEmbeddingText(node))`
2. Look up existing `SkillNodeEmbedding` by `nodeId`
3. If `contentHash` matches → skip (embedding is current)
4. If mismatch or missing → generate new embedding → upsert

#### Batching

-   Collect all nodes that need embedding
-   Call embedding API in batches (configurable `batchSize`, default 100)
-   Persist all results in a single transaction

#### Error Handling

-   If embedding API fails for a batch → log error, skip that batch
-   Partial success is acceptable — nodes without embeddings fall back to keyword scoring at retrieval time
-   Do NOT block node extraction if embedding fails

### Files to Create

| File                                                                 | Purpose                                     |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `packages/server/src/services/skill-embeddings/index.ts`             | `SkillEmbeddingService` main class          |
| `packages/server/src/services/skill-embeddings/embeddingProvider.ts` | Adapter to create embedding model instances |
| `packages/server/src/services/skill-embeddings/textPreparation.ts`   | `prepareEmbeddingText()` utility            |

### Files to Modify

| File                                                | Change                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| `packages/server/src/services/skill-nodes/index.ts` | Call embedding service after node extraction completes   |
| `packages/server/src/services/skill-files/index.ts` | Pass `embeddingModelConfig` to extraction/embedding flow |

### Checklist

-   [ ] Create `SkillEmbeddingService` class
-   [ ] Implement `prepareEmbeddingText()` with type-aware prefixes
-   [ ] Implement incremental embedding (contentHash comparison)
-   [ ] Implement batch embedding with configurable batch size
-   [ ] Create `embeddingProvider.ts` — adapter to instantiate embedding models from config
-   [ ] Wire embedding generation into `extractNodes()` (after node persist, before return)
-   [ ] Implement `reembedFolder()` for model config changes
-   [ ] Implement `deleteBySkillFileId()` for cleanup
-   [ ] Error handling: embedding failure does not block node extraction
-   [ ] Log embedding results (embedded count, skipped count, error count, time taken)
-   [ ] Unit tests: prepareEmbeddingText formatting
-   [ ] Unit tests: incremental skip logic (same hash → skip)
-   [ ] Unit tests: batch size splitting
-   [ ] Unit tests: partial failure handling

---

## WI-P5-4: Semantic Retrieval Engine

### Problem

The current `retrieveRelevantNodes()` in `compiler/retriever.ts` uses keyword overlap scoring. This fails for:

-   **Paraphrases**: "write concisely" vs. node with "keep brief" — zero keyword overlap
-   **Synonyms**: "social media" vs. node about "LinkedIn posts" — no match
-   **Intent**: "how should I format the output?" vs. node about "use markdown tables" — no direct keyword hit

Embedding-based cosine similarity captures these semantic relationships.

### Design

#### New Retrieval Algorithm

```typescript
function retrieveRelevantNodes(
    query: string,
    nodes: SkillNodeInput[],
    edges: SkillEdgeInput[],
    embeddings: NodeEmbeddingInput[],
    queryEmbedding: number[] | null,
    maxNodes: number = 20
): SkillNodeInput[] {
    // 1. Always include role + rule nodes (mandatory)
    const mandatory = nodes.filter((n) => n.type === 'role' || n.type === 'rule')

    // If total nodes ≤ maxNodes, return all
    if (nodes.length <= maxNodes) return nodes

    // 2. Score remaining nodes
    const optional = nodes.filter((n) => n.type !== 'role' && n.type !== 'rule')
    const scored = optional
        .map((n) => ({
            node: n,
            score: computeHybridScore(query, n, embeddings, queryEmbedding)
        }))
        .sort((a, b) => b.score - a.score)

    // 3. Take top candidates
    const budget = Math.max(0, maxNodes - mandatory.length)
    const candidates = scored.slice(0, budget).map((s) => s.node)

    // 4. Expand via edges
    const expanded = expandViaEdges(candidates, edges, nodes)

    // 5. Deduplicate and return
    return deduplicate([...mandatory, ...candidates, ...expanded])
}
```

#### Hybrid Scoring

Combine three signals with configurable weights:

```typescript
function computeHybridScore(
    query: string,
    node: SkillNodeInput,
    embeddings: NodeEmbeddingInput[],
    queryEmbedding: number[] | null
): number {
    // Signal 1: Semantic similarity (0–1)
    let semanticScore = 0
    if (queryEmbedding) {
        const nodeEmb = embeddings.find((e) => e.nodeId === node.id)
        if (nodeEmb) {
            semanticScore = cosineSimilarity(queryEmbedding, nodeEmb.embedding)
        }
    }

    // Signal 2: Keyword overlap (normalized 0–1)
    const keywordScore = computeKeywordScore(query, node)

    // Signal 3: Priority boost (normalized 0–1)
    const priorityBoost = node.priority / 100

    // Weighted combination
    return WEIGHTS.semantic * semanticScore + WEIGHTS.keyword * keywordScore + WEIGHTS.priority * priorityBoost
}

const WEIGHTS = {
    semantic: 0.6, // dominant signal when embeddings available
    keyword: 0.25, // fallback signal, still useful for exact matches
    priority: 0.15 // type-based importance boost
}
```

#### Graceful Degradation

| Scenario                             | Behavior                                            |
| ------------------------------------ | --------------------------------------------------- |
| Embeddings available + query embed   | Full hybrid scoring (semantic + keyword + priority) |
| No embeddings, query embed exists    | Keyword + priority scoring (Phase 4 behavior)       |
| Embeddings available, no query embed | Keyword + priority scoring (embedding API down)     |
| No embeddings, no query embed        | Keyword + priority scoring (full fallback)          |

The system never crashes due to missing embeddings. It degrades to Phase 4 keyword behavior.

#### Cosine Similarity (In-Process)

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0,
        magA = 0,
        magB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        magA += a[i] * a[i]
        magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
}
```

#### Query Embedding at Runtime

On each `_call()` invocation:

1. Check if folder has `embeddingModelConfig` → if not, skip semantic path
2. Generate embedding for the user query (single vector)
3. Pass to `retrieveRelevantNodes()` along with preloaded node embeddings

Query embedding is a single model call (~10ms for most APIs) and does not need caching.

### New Types

```typescript
interface NodeEmbeddingInput {
    nodeId: string
    embedding: number[] // deserialized vector
    dimension: number
}

interface RetrievalConfig {
    maxNodes: number // default 20
    semanticWeight: number // default 0.6
    keywordWeight: number // default 0.25
    priorityWeight: number // default 0.15
    minSemanticScore: number // default 0.3 — floor below which semantic results are discarded
}
```

### Files to Create

| File                                                                      | Purpose                   |
| ------------------------------------------------------------------------- | ------------------------- |
| `packages/components/nodes/tools/SkillTool/compiler/semanticRetriever.ts` | New hybrid retriever      |
| `packages/components/nodes/tools/SkillTool/compiler/cosineSimilarity.ts`  | Cosine similarity utility |

### Files to Modify

| File                                                              | Change                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/compiler/types.ts`     | Add `NodeEmbeddingInput`, `RetrievalConfig` types                             |
| `packages/components/nodes/tools/SkillTool/compiler/retriever.ts` | Replace with hybrid scoring (or deprecate in favor of `semanticRetriever.ts`) |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`          | Load embeddings; embed query at `_call()` time; wire semantic retriever       |

### Checklist

-   [ ] Implement `cosineSimilarity()` utility function
-   [ ] Implement `computeHybridScore()` with configurable weights
-   [ ] Implement new `retrieveRelevantNodes()` accepting embeddings + query embedding
-   [ ] Add `NodeEmbeddingInput` and `RetrievalConfig` types
-   [ ] Add `minSemanticScore` threshold to discard low-relevance semantic matches
-   [ ] Graceful degradation: fall back to keyword-only when embeddings unavailable
-   [ ] Wire into `SkillFileTool._call()` — embed query, pass to semantic retriever
-   [ ] Load node embeddings in `SkillTool.getTools()` (alongside nodes/edges)
-   [ ] Unit tests: cosine similarity correctness
-   [ ] Unit tests: hybrid scoring ranks semantically similar nodes higher
-   [ ] Unit tests: fallback to keyword-only when no embeddings
-   [ ] Unit tests: mandatory nodes always included regardless of score
-   [ ] Unit tests: minSemanticScore threshold filters low-relevance results
-   [ ] Unit tests: edge expansion still works with hybrid scoring

---

## WI-P5-5: Node-First Runtime Architecture

### Problem

Currently, after retrieval, all selected nodes are re-compiled into a single text blob (`compileFromNodes()` → `compiledPrompt`). This has several drawbacks:

1. **Token waste** — the compiled format adds section headers and formatting overhead
2. **Loss of structure** — the LLM receives an opaque string, losing node types and priorities
3. **Redundant computation** — re-compilation happens on every `_call()` even though the compilation logic is simple
4. **No per-node attribution** — the LLM cannot reference back to specific nodes

### Design

Replace the compiled-blob approach with a **node-first** runtime that sends structured nodes directly to the LLM context.

#### New `_call()` Flow

```
User query arrives
  → embed query (if embedding model configured)
  → retrieveRelevantNodes() with hybrid scoring
  → formatNodesForLLM(relevantNodes) — lightweight formatting, NOT full compilation
  → return formatted output
```

#### Node Formatting (Lightweight)

Instead of full compilation with section headers, format nodes minimally:

```typescript
function formatNodesForLLM(skillName: string, nodes: SkillNodeInput[], assets: SkillAssetInput[], config: NodeCompileConfig): string {
    const parts: string[] = [`[Skill: ${skillName}]`]

    // Group by type, render in priority order
    for (const type of TYPE_ORDER) {
        const typeNodes = nodes.filter((n) => n.type === type)
        if (!typeNodes.length) continue

        for (const node of typeNodes) {
            parts.push(formatSingleNode(node))
        }
    }

    // Append asset context if needed
    if (assets.length > 0) {
        parts.push(formatAssetContext(assets, config))
    }

    return parts.join('\n')
}

function formatSingleNode(node: SkillNodeInput): string {
    const tag = TYPE_TAGS[node.type]
    return `[${tag}] ${node.content.trim()}`
}

const TYPE_TAGS: Record<string, string> = {
    role: 'ROLE',
    rule: 'RULE',
    behavior: 'DO',
    knowledge: 'KNOW',
    asset: 'ASSET'
}
```

#### Example Output

**Before (Phase 4 — compiled blob):**

```text
Skill: LinkedIn Content Writer
Description: Expert at writing LinkedIn posts

Role:
You are a LinkedIn content writing expert with deep knowledge of the platform.

Rules:
- Never exceed 3000 characters per post
- Always include a call to action

Instructions:
- Use a conversational, professional tone
- Start with a hook that grabs attention

Knowledge:
- LinkedIn algorithm favors posts with 1200-1500 characters
```

**After (Phase 5 — node tags):**

```text
[Skill: LinkedIn Content Writer]
[ROLE] You are a LinkedIn content writing expert with deep knowledge of the platform.
[RULE] Never exceed 3000 characters per post.
[RULE] Always include a call to action.
[DO] Use a conversational, professional tone.
[DO] Start with a hook that grabs attention.
[KNOW] LinkedIn algorithm favors posts with 1200-1500 characters.
```

#### Benefits

1. **Compact** — fewer formatting characters, more content per token
2. **Structured** — LLM can distinguish rules from instructions from knowledge
3. **No re-compilation** — formatting is O(n) string concatenation, not a compile pipeline
4. **Attributable** — tags make it clear which type each instruction belongs to

#### Multimodal Path

The multimodal payload (`MultimodalContentPart[]`) is unchanged — it still sends images/documents alongside text. The text portion uses the new node-tagged format.

#### Backward Compatibility

-   If nodes exist → use node-first format
-   If no nodes → fall back to current compiled-blob format (unchanged Phase 4 behavior)
-   The `SkillCompileCache` is still used for `init()` time pre-compilation, but `_call()` now bypasses it in favor of on-demand formatting of retrieved nodes

### Files to Create

| File                                                                  | Purpose                           |
| --------------------------------------------------------------------- | --------------------------------- |
| `packages/components/nodes/tools/SkillTool/compiler/nodeFormatter.ts` | Lightweight node → text formatter |

### Files to Modify

| File                                                          | Change                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`      | Use `formatNodesForLLM()` instead of `compileFromNodes()` in `_call()` |
| `packages/components/nodes/tools/SkillTool/compiler/types.ts` | Add `TYPE_TAGS` constant                                               |

### Checklist

-   [ ] Implement `formatNodesForLLM()` function
-   [ ] Implement `formatSingleNode()` with type tags
-   [ ] Implement `formatAssetContext()` for asset inclusion
-   [ ] Replace `compileFromNodes()` call in `_call()` with `formatNodesForLLM()`
-   [ ] Keep `compileFromNodes()` for `init()` time cache population (unchanged)
-   [ ] Multimodal: use node-tagged text as the text portion of multimodal payload
-   [ ] Backward compatibility: fall back to compiled blob when no nodes
-   [ ] Unit tests: node-tagged output format correctness
-   [ ] Unit tests: type ordering (ROLE → RULE → DO → KNOW → ASSET)
-   [ ] Unit tests: empty node types omitted
-   [ ] Unit tests: multimodal payload uses node-tagged text
-   [ ] Unit tests: backward compat with raw content

---

## WI-P5-6: Embedding Lifecycle Management

### Problem

Embeddings must stay in sync with nodes across all mutation paths: file save, file delete, folder delete, model config change. Stale embeddings degrade retrieval quality.

### Design

#### Trigger Matrix

| Event                              | Action                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| Skill file saved (content changed) | Extract nodes → generate embeddings for new/changed nodes |
| Skill file saved (no change)       | Skip (compileHash check from Phase 4)                     |
| Skill file deleted                 | Delete nodes + edges + embeddings for that file           |
| Skill folder deleted               | Delete all nodes + edges + embeddings in folder           |
| Asset changed/deleted              | Re-extract asset nodes → re-embed affected nodes          |
| Embedding model config changed     | Re-embed ALL nodes in folder (model changed)              |
| Embedding model config removed     | Delete all embeddings in folder (opt out)                 |

#### Model Change Detection

When `SkillFolder.embeddingModelConfig` is updated:

1. Parse new config → extract `provider + model` identifier
2. Compare with `modelId` stored in existing embeddings
3. If different → trigger `reembedFolder()` (async, non-blocking)
4. If same → no action

#### Orphan Cleanup

On node extraction re-run:

1. New nodes are persisted (Phase 4)
2. Old nodes deleted (Phase 4)
3. Embeddings for deleted nodes are cascade-cleaned (by `nodeId` FK or explicit delete)
4. New nodes get embeddings generated

### Files to Modify

| File                                                  | Change                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/server/src/services/skill-files/index.ts`   | Delete embeddings on file delete; trigger re-embed on model change |
| `packages/server/src/services/skill-folders/index.ts` | Delete embeddings on folder delete; detect model config change     |
| `packages/server/src/services/skill-nodes/index.ts`   | Clean up embeddings during node re-extraction                      |
| `packages/server/src/services/skill-assets/index.ts`  | Trigger re-embed when asset captions change                        |

### Checklist

-   [ ] Delete embeddings when skill file is deleted
-   [ ] Delete embeddings when skill folder is deleted
-   [ ] Clean up orphan embeddings during node re-extraction
-   [ ] Detect embedding model config change on folder update
-   [ ] Trigger `reembedFolder()` on model change (async)
-   [ ] Delete all embeddings on model config removal
-   [ ] Trigger re-embed on asset caption change
-   [ ] Unit tests: file delete cleans up embeddings
-   [ ] Unit tests: folder delete cleans up all embeddings
-   [ ] Unit tests: model change triggers re-embed
-   [ ] Unit tests: model removal deletes embeddings

---

## WI-P5-7: SkillTool Integration

### Problem

The `SkillTool` class needs to be updated to:

1. Load embeddings alongside nodes/edges in `getTools()`
2. Generate query embedding on each `_call()` invocation
3. Use the semantic retriever instead of the keyword retriever

### Design

#### `getTools()` Changes

```typescript
// Add: load embeddings for all files in folder
let embeddingsByFileId: Record<string, NodeEmbeddingInput[]> = {}
if (databaseEntities?.['SkillNodeEmbedding']) {
    try {
        const allEmbeddings = await appDataSource
            .getRepository(databaseEntities['SkillNodeEmbedding'])
            .find({ where: { ...searchOptions, folderId } })
        for (const emb of allEmbeddings) {
            const fileId = emb.skillFileId || nodeToFileMap.get(emb.nodeId) || ''
            if (!embeddingsByFileId[fileId]) embeddingsByFileId[fileId] = []
            embeddingsByFileId[fileId].push({
                nodeId: emb.nodeId,
                embedding: JSON.parse(emb.embedding),
                dimension: emb.dimension
            })
        }
    } catch {
        // Table may not exist yet
    }
}

// Pass embeddings to SkillFileTool constructor
```

#### `SkillFileTool` Changes

```typescript
class SkillFileTool extends Tool {
    // Add fields
    private embeddings: NodeEmbeddingInput[] | null
    private embeddingModelConfig: EmbeddingModelConfig | null

    async _call(input: string): Promise<string> {
        if (this.nodes && this.nodes.length > 0) {
            // Generate query embedding (if model config available)
            let queryEmbedding: number[] | null = null
            if (this.embeddingModelConfig && this.embeddings?.length) {
                try {
                    queryEmbedding = await generateQueryEmbedding(input, this.embeddingModelConfig)
                } catch {
                    // Fall back to keyword-only
                }
            }

            // Semantic retrieval
            const relevantNodes = retrieveRelevantNodes(
                input,
                this.nodes,
                this.edges || [],
                this.embeddings || [],
                queryEmbedding,
                this.maxRetrievedNodes
            )

            // Node-first formatting
            const formatted = formatNodesForLLM(this.skillName, relevantNodes, this.fileAssets, this.nodeCompileConfig!)

            if (this.nodeCompileConfig!.executionMode === 'multimodal') {
                return JSON.stringify({
                    [MULTIMODAL_CONTENT_KEY]: true,
                    content: buildMultimodalPayload(formatted, this.fileAssets, this.nodeCompileConfig!)
                })
            }
            return formatted
        }

        // Backward compat
        if (this.multimodalContent) {
            return JSON.stringify({ [MULTIMODAL_CONTENT_KEY]: true, content: this.multimodalContent })
        }
        return this.content
    }
}
```

#### Query Embedding Generation

```typescript
async function generateQueryEmbedding(query: string, config: EmbeddingModelConfig): Promise<number[]> {
    const provider = createEmbeddingProvider(config)
    const result = await provider.embedQuery(query)
    return result
}
```

This creates a single embedding model call per `_call()`. The model instance can be cached on the `SkillFileTool` to avoid re-initialization.

### Files to Modify

| File                                                          | Change                                                |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`      | Load embeddings; embed query; wire semantic retriever |
| `packages/components/nodes/tools/SkillTool/compiler/types.ts` | Add embedding-related types                           |

### Checklist

-   [ ] Load `SkillNodeEmbedding` records in `getTools()`
-   [ ] Parse embedding JSON vectors on load
-   [ ] Pass embeddings + `embeddingModelConfig` to `SkillFileTool` constructor
-   [ ] Generate query embedding in `_call()` with error handling
-   [ ] Cache embedding model instance on `SkillFileTool` to avoid re-init
-   [ ] Wire `semanticRetriever.retrieveRelevantNodes()` in `_call()`
-   [ ] Replace `compileFromNodes()` with `formatNodesForLLM()` in `_call()`
-   [ ] Keep `init()` time caching unchanged (still uses `compileFromNodes()`)
-   [ ] Unit tests: embeddings loaded and passed to retriever
-   [ ] Unit tests: query embedding failure gracefully degrades
-   [ ] Unit tests: node-first format returned to LLM

---

## WI-P5-8: Populate `embeddingText` on SkillNode

### Problem

The `SkillNode.embeddingText` column exists (added in Phase 4) but is never populated. This field should store the prepared text that was used to generate the embedding, enabling debugging and future re-embedding without re-running the full extraction pipeline.

### Design

During embedding generation, persist the prepared text to `SkillNode.embeddingText`:

```typescript
// In embedding pipeline, after preparing text
node.embeddingText = prepareEmbeddingText(node)
await nodeRepository.update(node.id, { embeddingText: node.embeddingText })
```

#### Uses

-   **Debugging** — inspect what text was embedded for each node
-   **Re-embedding** — use `embeddingText` directly instead of re-running `prepareEmbeddingText()`
-   **Future UI** — display in node visualization (Phase 4 UI deferred feature)

### Files to Modify

| File                                                     | Change                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `packages/server/src/services/skill-embeddings/index.ts` | Update `embeddingText` on SkillNode during embedding |
| `packages/server/src/services/skill-nodes/extractor.ts`  | Optionally set `embeddingText` during extraction     |

### Checklist

-   [ ] Populate `embeddingText` on `SkillNode` during embedding generation
-   [ ] Use `embeddingText` for re-embedding when available
-   [ ] Unit tests: embeddingText is persisted correctly
-   [ ] Unit tests: re-embedding uses stored embeddingText when content unchanged

---

## WI-P5-9: Performance Optimizations

### Problem

Embedding operations and vector comparisons add latency. The system must remain fast for typical skill sizes.

### Design

#### Embedding Cache in Memory

At `getTools()` time, all embeddings for a folder are loaded from DB and deserialized. This is cached in-memory for the duration of the tool's lifecycle.

```typescript
// Deserialize once, store as typed arrays for fast cosine similarity
const embeddingCache = new Map<string, Float32Array>()
for (const emb of rawEmbeddings) {
    embeddingCache.set(emb.nodeId, new Float32Array(JSON.parse(emb.embedding)))
}
```

Using `Float32Array` instead of `number[]` for ~2× faster cosine similarity computation.

#### Query Embedding Caching

Cache query embeddings with a short TTL to avoid re-embedding identical queries in rapid succession (e.g. retry scenarios):

```typescript
const queryEmbeddingCache = new LRUCache<string, number[]>({
    max: 100, // max cached queries
    ttl: 60_000 // 1 minute TTL
})
```

#### Parallelized Embedding Generation

When embedding multiple nodes (e.g. after extraction), batch them in parallel up to the provider's rate limit:

```typescript
const batches = chunk(nodesToEmbed, config.batchSize || 100)
for (const batch of batches) {
    const texts = batch.map((n) => prepareEmbeddingText(n))
    const vectors = await provider.embedDocuments(texts) // single API call per batch
    // ... persist
}
```

#### Database Index for Embeddings

Already specified in WI-P5-1:

```sql
CREATE UNIQUE INDEX idx_embedding_node ON skill_node_embedding (nodeId);
CREATE INDEX idx_embedding_file ON skill_node_embedding (skillFileId);
```

### Checklist

-   [ ] Use `Float32Array` for in-memory embedding storage
-   [ ] Implement LRU cache for query embeddings (max 100, 1 min TTL)
-   [ ] Batch embedding generation using `embedDocuments()` API
-   [ ] Verify cosine similarity performance for 1000+ nodes (target < 5ms)
-   [ ] Verify query embedding latency (target < 100ms for API models)
-   [ ] Profile memory usage for large folders (1000 nodes × 1536-dim = ~6MB)

---

## Implementation Order

```
WI-P5-1 (SkillNodeEmbedding Entity)
    ↓
WI-P5-2 (Embedding Model Config)
    ↓
WI-P5-3 (Embedding Generation Service)
    ↓
WI-P5-8 (Populate embeddingText)
    ↓
WI-P5-4 (Semantic Retrieval Engine)    ←→  WI-P5-5 (Node-First Runtime)     [parallel]
    ↓                                          ↓
WI-P5-7 (SkillTool Integration)        ←  Combines retrieval + runtime
    ↓
WI-P5-6 (Embedding Lifecycle)          ←  Lifecycle management
    ↓
WI-P5-9 (Performance Optimizations)    ←  Tuning after data exists
```

### Rationale

-   **WI-P5-1** is the data foundation — all embedding work needs this table
-   **WI-P5-2** provides the config needed to know which model to use
-   **WI-P5-3** generates the embeddings — core engine
-   **WI-P5-8** is a small addition during embedding generation
-   **WI-P5-4 + WI-P5-5** are independent consumers — retrieval uses embeddings, runtime uses nodes directly
-   **WI-P5-7** wires everything together into the SkillTool
-   **WI-P5-6** handles lifecycle across all mutation paths
-   **WI-P5-9** is performance tuning, best done after the system is functional

---

## Priority Ranking

| Priority | Work Item                             | Impact                                           | Effort |
| -------- | ------------------------------------- | ------------------------------------------------ | ------ |
| **P0**   | WI-P5-1: SkillNodeEmbedding Entity    | Critical — data storage for vectors              | Low    |
| **P0**   | WI-P5-3: Embedding Generation Service | Critical — produces the vectors                  | High   |
| **P0**   | WI-P5-4: Semantic Retrieval Engine    | Critical — the core value proposition of Phase 5 | High   |
| **P0**   | WI-P5-7: SkillTool Integration        | Critical — connects everything to runtime        | Medium |
| **P1**   | WI-P5-2: Embedding Model Config       | High — required for embedding generation         | Low    |
| **P1**   | WI-P5-5: Node-First Runtime           | High — better token efficiency and structure     | Medium |
| **P1**   | WI-P5-6: Embedding Lifecycle          | High — keeps embeddings in sync                  | Medium |
| **P2**   | WI-P5-8: Populate embeddingText       | Medium — debugging and re-embedding utility      | Low    |
| **P2**   | WI-P5-9: Performance Optimizations    | Medium — important at scale                      | Low    |

---

## Dependencies

| Item                  | External Dependency                                            |
| --------------------- | -------------------------------------------------------------- |
| Embedding Generation  | Embedding model API (OpenAI, Cohere, etc.) OR local model      |
| Semantic Retrieval    | WI-P5-1 (Entity) + WI-P5-3 (Generation)                        |
| Node-First Runtime    | None — pure formatting refactor                                |
| Embedding Lifecycle   | WI-P5-1 (Entity) + WI-P5-3 (Generation)                        |
| SkillTool Integration | WI-P5-4 (Retrieval) + WI-P5-5 (Runtime) + WI-P5-3 (Generation) |

---

## Migration Notes

-   **Backward compatibility** — if no `embeddingModelConfig`, system operates in Phase 4 keyword-only mode
-   **No breaking changes** — existing skills work identically without embedding configuration
-   **Opt-in semantics** — embedding generation only runs when a model is configured on the folder
-   **Progressive adoption** — folders can be upgraded to embedding-based retrieval individually
-   **DB migrations** — all new columns and tables use nullable fields; existing rows unaffected
-   **Portable vectors** — JSON-serialized embeddings work across all 4 DB types without extensions

---

## Future Considerations (Not in Phase 5 Scope)

| Topic                                         | Why Deferred                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| pgvector / dedicated vector DB                | JSON vectors sufficient for expected scale; revisit if >10K nodes            |
| Cross-skill semantic search                   | Start intra-skill; cross-skill adds complexity around shared embedding space |
| Embedding-based node deduplication            | Needs semantic merge logic (Phase 6 candidate with LLM-assisted merging)     |
| Fine-tuned embedding models for skill content | Generic models sufficient initially; fine-tuning needs training data         |
| Real-time embedding streaming                 | Batch generation sufficient; streaming needed only for very large skills     |
| UI for embedding quality visualization        | Internal system; expose only when debugging UX demands it                    |
| Hybrid retrieval with BM25 scoring            | Simple keyword overlap sufficient as fallback; BM25 is optimization          |
| Automatic weight tuning for hybrid scoring    | Fixed weights work for initial release; tune with usage data later           |

---

## Full Checklist Summary

### WI-P5-1: SkillNodeEmbedding Entity + Migration

-   [ ] Define `ISkillNodeEmbedding` interface in `Interface.ts`
-   [ ] Create `SkillNodeEmbedding` entity
-   [ ] Create migrations for all 4 DB types (with indexes)
-   [ ] Register entity in DataSource configs and entity map
-   [ ] Verify migration runs cleanly

### WI-P5-2: Embedding Model Configuration

-   [ ] Add `embeddingModelConfig` column to `SkillFolder` entity
-   [ ] Update `ISkillFolder` interface
-   [ ] Create migrations for all 4 DB types
-   [ ] Create `EmbeddingModelInputHandler` UI component
-   [ ] Add embedding config section to editor dialog
-   [ ] Verify backward compatibility

### WI-P5-3: Embedding Generation Service

-   [ ] Create `SkillEmbeddingService` class
-   [ ] Implement `prepareEmbeddingText()` with type-aware prefixes
-   [ ] Implement incremental embedding (contentHash check)
-   [ ] Implement batch embedding
-   [ ] Create embedding provider adapter
-   [ ] Wire into node extraction flow
-   [ ] Implement `reembedFolder()`
-   [ ] Implement `deleteBySkillFileId()`
-   [ ] Error handling: embedding failure does not block extraction
-   [ ] Unit tests

### WI-P5-4: Semantic Retrieval Engine

-   [ ] Implement `cosineSimilarity()` utility
-   [ ] Implement `computeHybridScore()` with weights
-   [ ] Implement new `retrieveRelevantNodes()` with embedding support
-   [ ] Add types (`NodeEmbeddingInput`, `RetrievalConfig`)
-   [ ] Add `minSemanticScore` threshold
-   [ ] Graceful degradation to keyword-only
-   [ ] Unit tests

### WI-P5-5: Node-First Runtime Architecture

-   [ ] Implement `formatNodesForLLM()` with type tags
-   [ ] Implement `formatSingleNode()` and `formatAssetContext()`
-   [ ] Replace `compileFromNodes()` in `_call()` with `formatNodesForLLM()`
-   [ ] Backward compatibility fallback
-   [ ] Multimodal integration
-   [ ] Unit tests

### WI-P5-6: Embedding Lifecycle Management

-   [ ] Delete embeddings on file delete
-   [ ] Delete embeddings on folder delete
-   [ ] Clean up orphans during re-extraction
-   [ ] Detect model config change → trigger re-embed
-   [ ] Handle model config removal → delete embeddings
-   [ ] Re-embed on asset caption change
-   [ ] Unit tests

### WI-P5-7: SkillTool Integration

-   [ ] Load embeddings in `getTools()`
-   [ ] Pass embeddings and config to `SkillFileTool`
-   [ ] Generate query embedding in `_call()`
-   [ ] Cache embedding model instance
-   [ ] Wire semantic retriever
-   [ ] Use node-first formatting
-   [ ] Unit tests

### WI-P5-8: Populate embeddingText

-   [ ] Populate `embeddingText` on `SkillNode` during embedding
-   [ ] Use `embeddingText` for re-embedding
-   [ ] Unit tests

### WI-P5-9: Performance Optimizations

-   [ ] Use `Float32Array` for in-memory embeddings
-   [ ] LRU cache for query embeddings
-   [ ] Batch embedding generation
-   [ ] Performance benchmarks (cosine similarity, query latency, memory)
