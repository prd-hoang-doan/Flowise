# Skill Asset Support — Phase 4 Requirement

## Graphify: Node Decomposition, Edge Linking, and Compile Cache

**Depends on:** Phase 1 (completed) — image upload, fallback captions, compilation pipeline, UI asset panel.
**Depends on:** Phase 2 (completed) — vision LLM captioning, front matter sync, multi-format assets.
**Depends on:** Phase 3 (completed) — two execution modes, asset preprocessing, dynamic retrieval.

---

## Guiding Principle

> **Store normalized data for editing, but compile graph-ready data for runtime.**

-   Database supports CRUD cleanly (editable truth)
-   Runtime supports retrieval efficiently (runtime truth)
-   Compiled output is always derived, never primary (cached truth)
-   Future graph expansion remains possible without schema rewrites

---

## Current State (Phase 1 + Phase 2 + Phase 3 Completed)

### Existing Data Model

| Entity        | Key Fields                                                                               | Purpose                                          |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `SkillFolder` | `id`, `name`, `color`, `iconSrc`, `description`, `captionModelConfig`, `executionConfig` | Organizes skills into folders; stores config     |
| `SkillFile`   | `id`, `folderId`, `name`, `description`, `filename`, `content`                           | Markdown skill file with instructions            |
| `SkillAsset`  | `id`, `folderId`, `fileId`, `filename`, `mimeType`, `storagePath`, `caption`             | Uploaded file (image/PDF/etc.) with text caption |

### What is NOT yet done

-   No **node decomposition** — skill content is stored as monolithic markdown text in `SkillFile.content`
-   No **graph layer** — no edges or relationships between content segments
-   No **compile cache** — skill content is recompiled from scratch on every runtime invocation
-   No **node-level retrieval** — retrieval operates on whole files, not granular semantic units
-   No **node-level priority/trimming** — cannot selectively drop low-priority content under token pressure
-   No **deterministic node extraction** — no pipeline to reliably break skill files into typed nodes

---

## Phase 4 Goals

1. **SkillNode decomposition** — break monolithic skill files into typed, prioritized, retrievable nodes
2. **SkillEdge linking** — establish lightweight relationships between nodes for smarter retrieval
3. **SkillCompileCache** — avoid redundant recompilation when skill content hasn't changed
4. **Node Extraction Pipeline** — deterministic pipeline to transform raw skill markdown into structured nodes
5. **Node-aware compilation** — compile from nodes instead of raw text, enabling selective inclusion
6. **Node-aware retrieval** — retrieve relevant nodes (not entire files) based on user query

---

## WI-P4-1: SkillNode Entity + Migration

### Problem

Skill content today lives as a single `content` text blob in `SkillFile`. This prevents granular retrieval, priority-based trimming, and type-aware compilation. The system cannot distinguish a role definition from a behavioral rule from a knowledge fact.

### Design

Introduce a `SkillNode` entity that represents the smallest meaningful unit of skill content. Each node is typed, prioritized, and independently retrievable.

#### Entity Schema

```typescript
SkillNode {
  id: string              // UUID primary key
  skillFileId: string     // FK → SkillFile.id
  folderId: string        // FK → SkillFolder.id (denormalized for query convenience)
  type: string            // enum: 'role' | 'behavior' | 'knowledge' | 'asset' | 'rule'
  title: string           // human-readable label for debugging (e.g. "LinkedIn tone rule")
  content: string         // actual node text
  priority: number        // weight for trimming/ordering (role=100, rule=95, behavior=80, knowledge=70, asset=60)
  triggers: string        // JSON array of keywords for retrieval (e.g. '["linkedin", "tone"]')
  cluster: string         // grouping label (e.g. "tone", "platform", "asset", "constraint", "output")
  embeddingText: string   // (nullable) future semantic retrieval text, may differ from content
  orderIndex: number      // deterministic rendering order within the skill file
  createdDate: Date
  updatedDate: Date
  workspaceId: string
}
```

#### Node Type Enum

| Type        | Priority Default | Description                   | Detection Pattern                                   |
| ----------- | ---------------- | ----------------------------- | --------------------------------------------------- |
| `role`      | 100              | Identity/persona definition   | Contains "You are", "Act as", "Serve as"            |
| `rule`      | 95               | Hard constraints              | Contains "Do not", "Always", "Never", "Must"        |
| `behavior`  | 80               | Action instructions           | Starts with imperative verbs: Keep, Adapt, Generate |
| `knowledge` | 70               | Domain facts                  | Declarative statements about the domain             |
| `asset`     | 60               | References to uploaded assets | Derived from SkillAsset summary/caption             |

#### Cluster Labels (Initial Set)

```
tone | platform | asset | constraint | output | identity | process
```

Clusters enable grouped retrieval without full graph traversal.

### Files to Create

| File                                                                             | Purpose                   |
| -------------------------------------------------------------------------------- | ------------------------- |
| `packages/server/src/database/entities/SkillNode.ts`                             | TypeORM entity definition |
| `packages/server/src/database/migrations/sqlite/1769000000000-AddSkillNode.ts`   | SQLite migration          |
| `packages/server/src/database/migrations/mysql/1769000000000-AddSkillNode.ts`    | MySQL migration           |
| `packages/server/src/database/migrations/postgres/1769000000000-AddSkillNode.ts` | PostgreSQL migration      |
| `packages/server/src/database/migrations/mariadb/1769000000000-AddSkillNode.ts`  | MariaDB migration         |

### Files to Modify

| File                                             | Change                        |
| ------------------------------------------------ | ----------------------------- |
| `packages/server/src/Interface.ts`               | Add `ISkillNode` interface    |
| `packages/server/src/database/entities/index.ts` | Export `SkillNode` entity     |
| DataSource configs for all 4 DB types            | Register `SkillNode` entity   |
| `packages/server/src/utils/databaseEntities.ts`  | Add `SkillNode` to entity map |

### Checklist

-   [ ] Define `ISkillNode` interface in `Interface.ts`
-   [ ] Create `SkillNode` entity in `packages/server/src/database/entities/SkillNode.ts`
-   [ ] Create migration `1769000000000-AddSkillNode` for SQLite
-   [ ] Create migration `1769000000000-AddSkillNode` for MySQL
-   [ ] Create migration `1769000000000-AddSkillNode` for PostgreSQL
-   [ ] Create migration `1769000000000-AddSkillNode` for MariaDB
-   [ ] Register entity in all TypeORM DataSource configs
-   [ ] Register entity in `databaseEntities` map
-   [ ] Verify migration runs cleanly on all DB types
-   [ ] Verify existing skill data is unaffected (no breaking changes)

---

## WI-P4-2: SkillEdge Entity + Migration

### Problem

Nodes in isolation lose contextual relationships. A knowledge fact like "LinkedIn prefers short openings" _supports_ the behavior rule "Use concise tone." Without edges, the compiler cannot group related nodes or perform dependency-aware retrieval.

### Design

Introduce a lightweight `SkillEdge` entity that creates simple directional relationships between nodes. This is NOT a full graph database — it is a minimal relational layer that enables smarter retrieval and compilation grouping.

#### Entity Schema

```typescript
SkillEdge {
  id: string              // UUID primary key
  skillFileId: string     // FK → SkillFile.id
  folderId: string        // FK → SkillFolder.id (denormalized)
  fromNodeId: string      // FK → SkillNode.id (source)
  toNodeId: string        // FK → SkillNode.id (target)
  relation: string        // enum: 'supports' | 'depends_on' | 'extends'
  createdDate: Date
  workspaceId: string
}
```

#### Relation Types

| Relation     | Meaning                                     | Example                                                                   |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| `supports`   | Source provides evidence/context for target | Knowledge "LinkedIn prefers short openings" → Behavior "Use concise tone" |
| `depends_on` | Source requires target to be present        | Behavior "Generate SEO content" → Knowledge "SEO best practices"          |
| `extends`    | Source adds detail/specificity to target    | Rule "Never exceed 280 chars" → Behavior "Write social posts"             |

#### Edge Creation Heuristic

Edges are created automatically during node extraction using simple rules:

1. **Same cluster + keyword overlap** → `supports`
2. **Rule referencing behavior topic** → `extends`
3. **Asset summary matching node topic** → `supports`

No LLM required for edge creation in Phase 4.

### Files to Create

| File                                                                             | Purpose                   |
| -------------------------------------------------------------------------------- | ------------------------- |
| `packages/server/src/database/entities/SkillEdge.ts`                             | TypeORM entity definition |
| `packages/server/src/database/migrations/sqlite/1769100000000-AddSkillEdge.ts`   | SQLite migration          |
| `packages/server/src/database/migrations/mysql/1769100000000-AddSkillEdge.ts`    | MySQL migration           |
| `packages/server/src/database/migrations/postgres/1769100000000-AddSkillEdge.ts` | PostgreSQL migration      |
| `packages/server/src/database/migrations/mariadb/1769100000000-AddSkillEdge.ts`  | MariaDB migration         |

### Files to Modify

| File                                             | Change                        |
| ------------------------------------------------ | ----------------------------- |
| `packages/server/src/Interface.ts`               | Add `ISkillEdge` interface    |
| `packages/server/src/database/entities/index.ts` | Export `SkillEdge` entity     |
| DataSource configs for all 4 DB types            | Register `SkillEdge` entity   |
| `packages/server/src/utils/databaseEntities.ts`  | Add `SkillEdge` to entity map |

### Checklist

-   [ ] Define `ISkillEdge` interface in `Interface.ts`
-   [ ] Create `SkillEdge` entity in `packages/server/src/database/entities/SkillEdge.ts`
-   [ ] Create migration `1769100000000-AddSkillEdge` for SQLite
-   [ ] Create migration `1769100000000-AddSkillEdge` for MySQL
-   [ ] Create migration `1769100000000-AddSkillEdge` for PostgreSQL
-   [ ] Create migration `1769100000000-AddSkillEdge` for MariaDB
-   [ ] Register entity in all TypeORM DataSource configs
-   [ ] Register entity in `databaseEntities` map
-   [ ] Verify migration runs cleanly on all DB types

---

## WI-P4-3: SkillCompileCache Entity + Migration

### Problem

Every runtime invocation of a SkillTool recompiles the full skill content from scratch. When skill content hasn't changed, this is wasted compute. For skills with many nodes and assets, compilation latency adds up.

### Design

Introduce a `SkillCompileCache` entity that stores compiled prompt output keyed by a content hash. If the hash matches on the next invocation, skip recompilation and return the cached result.

#### Entity Schema

```typescript
SkillCompileCache {
  id: string              // UUID primary key
  skillFileId: string     // FK → SkillFile.id
  folderId: string        // FK → SkillFolder.id (denormalized)
  hash: string            // SHA-256 hash of (nodes + edges + assets + config) used for cache invalidation
  compiledPrompt: string  // the full compiled prompt text
  tokenCount: number      // estimated token count of compiled output
  executionMode: string   // 'summary' | 'multimodal' — cache per mode
  createdDate: Date
  workspaceId: string
}
```

#### Cache Invalidation Strategy

The `hash` is computed from:

```
hash = SHA256(
  sorted(node.content for all nodes) +
  sorted(edge relationships) +
  sorted(asset.caption for all assets) +
  executionMode +
  maxAssetContext
)
```

When any of these inputs change, the hash changes, and recompilation is triggered.

#### Cache Lifecycle

1. **On skill save** → node extraction runs → compute hash → compile → cache
2. **On runtime invocation** → compute hash → if cache hit, return cached → else recompile and cache
3. **On skill file edit** → invalidate cache for that file (delete cache row)
4. **On asset change** → invalidate cache for affected file

### Files to Create

| File                                                                                     | Purpose                   |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| `packages/server/src/database/entities/SkillCompileCache.ts`                             | TypeORM entity definition |
| `packages/server/src/database/migrations/sqlite/1769200000000-AddSkillCompileCache.ts`   | SQLite migration          |
| `packages/server/src/database/migrations/mysql/1769200000000-AddSkillCompileCache.ts`    | MySQL migration           |
| `packages/server/src/database/migrations/postgres/1769200000000-AddSkillCompileCache.ts` | PostgreSQL migration      |
| `packages/server/src/database/migrations/mariadb/1769200000000-AddSkillCompileCache.ts`  | MariaDB migration         |

### Files to Modify

| File                                             | Change                                |
| ------------------------------------------------ | ------------------------------------- |
| `packages/server/src/Interface.ts`               | Add `ISkillCompileCache` interface    |
| `packages/server/src/database/entities/index.ts` | Export `SkillCompileCache` entity     |
| DataSource configs for all 4 DB types            | Register `SkillCompileCache` entity   |
| `packages/server/src/utils/databaseEntities.ts`  | Add `SkillCompileCache` to entity map |

### Checklist

-   [ ] Define `ISkillCompileCache` interface in `Interface.ts`
-   [ ] Create `SkillCompileCache` entity in `packages/server/src/database/entities/SkillCompileCache.ts`
-   [ ] Create migration `1769200000000-AddSkillCompileCache` for SQLite
-   [ ] Create migration `1769200000000-AddSkillCompileCache` for MySQL
-   [ ] Create migration `1769200000000-AddSkillCompileCache` for PostgreSQL
-   [ ] Create migration `1769200000000-AddSkillCompileCache` for MariaDB
-   [ ] Register entity in all TypeORM DataSource configs
-   [ ] Register entity in `databaseEntities` map
-   [ ] Verify migration runs cleanly on all DB types

---

## WI-P4-4: Skill `compileHash` Field on SkillFile

### Problem

The `SkillFile` entity has no way to know whether its content has changed since the last node extraction. Without a hash, every save would require full re-extraction even when nothing changed.

### Design

Add a `compileHash` column to `SkillFile` that stores the hash of the content at the time of last successful node extraction.

#### Schema Change

```typescript
// Add to SkillFile entity
@Column({ nullable: true, type: 'text' })
compileHash?: string  // SHA-256 of content at last extraction
```

#### Logic

1. On skill file save → compute `SHA256(content)` → compare with stored `compileHash`
2. If same → skip node extraction
3. If different → run extraction pipeline → update `compileHash`

### Files to Modify

| File                                                 | Change                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `packages/server/src/database/entities/SkillFile.ts` | Add `compileHash` column                   |
| `packages/server/src/Interface.ts`                   | Add `compileHash?: string` to `ISkillFile` |
| DB migrations (all 4 types)                          | New migration for `compileHash` column     |

### Checklist

-   [ ] Add `compileHash` column (`text`, nullable) to `SkillFile` entity
-   [ ] Update `ISkillFile` interface with `compileHash?: string`
-   [ ] Create migration `1769300000000-AddSkillFileCompileHash` for SQLite
-   [ ] Create migration `1769300000000-AddSkillFileCompileHash` for MySQL
-   [ ] Create migration `1769300000000-AddSkillFileCompileHash` for PostgreSQL
-   [ ] Create migration `1769300000000-AddSkillFileCompileHash` for MariaDB
-   [ ] Verify existing skill files are unaffected (nullable column)

---

## WI-P4-5: Node Extraction Pipeline (Core Engine)

### Problem

Users write messy, unstructured skill files. The system needs a reliable, deterministic pipeline to transform raw markdown into clean, typed, prioritized nodes. This is the most critical component of Phase 4 — it bridges the gap between human-authored content and the graph-based runtime.

### Design

Create a `SkillNodeExtractor` class that implements an 8-stage pipeline:

```
Load → Parse → Normalize → Segment → Classify → Prioritize → Link → Persist
```

All stages are deterministic (no LLM dependency). Same input always produces same nodes.

#### Stage 1 — Load

Collect raw inputs:

```typescript
type RawSkillInput = {
    skillFileId: string
    name: string
    description: string
    content: string // raw markdown from SkillFile.content
    assets: ISkillAsset[] // associated assets
}
```

Rule: never mutate the raw source.

#### Stage 2 — Parse

Detect explicit structure from markdown headings:

```typescript
type ParsedBlock = {
    heading: string | null // e.g. "Role", "Instructions", "SEO Notes"
    content: string // text under that heading
    level: number // heading level (1-6)
}
```

Headings provide strong classification hints. Parse them before any semantic analysis.

#### Stage 3 — Normalize

Clean the parsed content:

-   Remove extra blank lines and duplicate whitespace
-   Normalize bullet formats (•, \*, -) to a single format (-)
-   Remove formatting artifacts
-   Trim trailing whitespace

#### Stage 4 — Segment

Break large blocks into smallest meaningful pieces using this priority:

1. **Bullet split** — each bullet point becomes a candidate unit
2. **Sentence split** — if no bullets, split by sentences
3. **Paragraph split** — if single long paragraph, split by paragraph breaks

Each segment becomes a candidate node.

#### Stage 5 — Classify

Assign a node type to each segment using deterministic pattern matching:

| Type        | Detection Patterns                                                     |
| ----------- | ---------------------------------------------------------------------- |
| `role`      | Contains: "You are", "Act as", "Serve as", "Your role"                 |
| `rule`      | Contains: "Do not", "Never", "Always", "Must", "Avoid"                 |
| `behavior`  | Starts with imperative verb: Keep, Adapt, Generate, Use, Create, Write |
| `knowledge` | Declarative fact, no imperative verb, no constraint markers            |
| `asset`     | Generated from asset summary/caption                                   |

Classification priority order: `role → rule → behavior → knowledge → asset`

Higher-priority types are checked first to prevent misclassification (e.g. "Always act as an expert" is `rule`, not `role`).

#### Stage 6 — Prioritize

Assign default priority weights:

```typescript
const DEFAULT_PRIORITIES: Record<string, number> = {
    role: 100,
    rule: 95,
    behavior: 80,
    knowledge: 70,
    asset: 60
}
```

#### Stage 7 — Link (Edge Creation)

Create edges using simple heuristics:

1. Extract keywords from each node (simple tokenization + stop-word removal)
2. If two nodes share keywords AND are in the same cluster → create `supports` edge
3. If a rule node references a behavior node's topic → create `extends` edge
4. If an asset node's caption matches a behavior/knowledge node → create `supports` edge

#### Stage 8 — Persist

Save extracted nodes, edges, and update `compileHash` in a single transaction:

1. Delete existing nodes and edges for this `skillFileId`
2. Insert new nodes with `orderIndex`
3. Insert new edges
4. Update `SkillFile.compileHash`

### Files to Create

| File                                                     | Purpose                          |
| -------------------------------------------------------- | -------------------------------- |
| `packages/server/src/services/skill-nodes/index.ts`      | SkillNode CRUD service           |
| `packages/server/src/services/skill-nodes/extractor.ts`  | `SkillNodeExtractor` class       |
| `packages/server/src/services/skill-nodes/classifier.ts` | Node type classification logic   |
| `packages/server/src/services/skill-nodes/normalizer.ts` | Text normalization utilities     |
| `packages/server/src/services/skill-nodes/segmenter.ts`  | Content segmentation logic       |
| `packages/server/src/services/skill-nodes/linker.ts`     | Edge creation heuristics         |
| `packages/server/src/controllers/skill-nodes/index.ts`   | Controller (optional, for debug) |
| `packages/server/src/routes/skill-nodes/index.ts`        | Routes (optional, for debug)     |

### Files to Modify

| File                                                | Change                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `packages/server/src/services/skill-files/index.ts` | Call extraction pipeline on skill file save (create/update) |

### Checklist

-   [ ] Create `SkillNodeExtractor` class with 8-stage pipeline
-   [ ] Implement Stage 1 (Load): collect `RawSkillInput` from SkillFile + SkillAssets
-   [ ] Implement Stage 2 (Parse): markdown heading detection, block splitting
-   [ ] Implement Stage 3 (Normalize): bullet normalization, whitespace cleanup
-   [ ] Implement Stage 4 (Segment): bullet → sentence → paragraph splitting
-   [ ] Implement Stage 5 (Classify): deterministic pattern-based type assignment
-   [ ] Implement Stage 6 (Prioritize): default priority weight assignment by type
-   [ ] Implement Stage 7 (Link): keyword-overlap edge creation heuristic
-   [ ] Implement Stage 8 (Persist): transactional save of nodes + edges + compileHash
-   [ ] Wire extraction into `createSkillFile()` and `updateSkillFile()` in skill-files service
-   [ ] Ensure extraction is idempotent (re-running produces identical results)
-   [ ] Ensure old nodes/edges are cleaned up before re-extraction
-   [ ] Add cluster assignment logic (tone, platform, asset, constraint, output, identity, process)
-   [ ] Add trigger keyword extraction from node content
-   [ ] Unit tests: parsing heading blocks from markdown
-   [ ] Unit tests: normalization (bullets, whitespace)
-   [ ] Unit tests: segmentation (bullet split, sentence split, paragraph split)
-   [ ] Unit tests: classification (role, rule, behavior, knowledge, asset detection)
-   [ ] Unit tests: priority assignment
-   [ ] Unit tests: edge creation heuristics
-   [ ] Unit tests: full pipeline end-to-end (markdown input → nodes + edges output)
-   [ ] Unit tests: idempotency (same input → same output)
-   [ ] Unit tests: compileHash skip logic (unchanged content skips extraction)

---

## WI-P4-6: Node-Aware Compilation

### Problem

The current `SkillCompiler` compiles from raw `SkillFile.content` text. Phase 4 needs compilation from structured nodes, enabling selective inclusion, priority-based ordering, and token-aware trimming.

### Design

Modify the compilation pipeline to:

1. **Load nodes** instead of raw content
2. **Order by priority** (descending) then `orderIndex`
3. **Group by type** for structured output sections
4. **Trim by token budget** — drop lowest-priority nodes first when exceeding limit
5. **Cache the result** using `SkillCompileCache`

#### Compiled Output Structure

```text
Skill: {name}
Description: {description}

Role:
{role node content}

Rules:
- {rule node 1}
- {rule node 2}

Instructions:
- {behavior node 1}
- {behavior node 2}

Knowledge:
- {knowledge node 1}

Assets:
Images:
- {asset filename} → {caption}
Documents:
- {asset filename} → {caption}
```

#### Cache Integration

```typescript
async compile(skillFileId: string, mode: string, config: CompileConfig): Promise<string> {
  const hash = computeHash(nodes, edges, assets, mode, config)

  // Check cache
  const cached = await findCache(skillFileId, hash, mode)
  if (cached) return cached.compiledPrompt

  // Compile from nodes
  const compiled = compileFromNodes(nodes, assets, mode, config)

  // Save cache
  await saveCache(skillFileId, hash, compiled, mode)

  return compiled
}
```

#### Backward Compatibility

If a skill file has no extracted nodes (e.g. older skills not yet processed):

-   Fall back to current raw content compilation
-   Log a warning suggesting re-save to trigger extraction

### Files to Modify

| File                                                                         | Change                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`                     | Load nodes + edges alongside files; use node-aware compiler |
| `packages/components/nodes/tools/SkillTool/SkillCompiler.ts` (or equivalent) | Refactor to compile from nodes with cache support           |

### Files to Create

| File                                                        | Purpose            |
| ----------------------------------------------------------- | ------------------ |
| `packages/server/src/services/skill-compile-cache/index.ts` | Cache CRUD service |

### Checklist

-   [ ] Refactor `SkillCompiler` to accept `SkillNode[]` instead of raw content string
-   [ ] Implement node ordering: sort by priority (desc) then orderIndex (asc)
-   [ ] Implement type-grouped output format (Role → Rules → Instructions → Knowledge → Assets)
-   [ ] Implement token budget trimming: drop low-priority nodes when exceeding limit
-   [ ] Implement hash computation from nodes + edges + assets + config
-   [ ] Implement cache lookup before compilation
-   [ ] Implement cache save after compilation
-   [ ] Add cache invalidation on skill file save
-   [ ] Add cache invalidation on asset change
-   [ ] Backward compatibility: fall back to raw content if no nodes exist
-   [ ] Load nodes from DB in `SkillTool.init()`
-   [ ] Unit tests: node-ordered compilation output
-   [ ] Unit tests: type-grouped formatting
-   [ ] Unit tests: token trimming drops lowest priority
-   [ ] Unit tests: cache hit returns cached prompt
-   [ ] Unit tests: cache miss triggers recompilation
-   [ ] Unit tests: backward compatibility with raw content

---

## WI-P4-7: Node-Aware Retrieval

### Problem

Phase 3 introduced dynamic retrieval at the file/asset level. With nodes, retrieval can now operate at a much finer granularity — selecting individual content segments based on their triggers, cluster, and type rather than entire files.

### Design

Enhance the runtime retrieval to work at the node level:

1. **Extract intent keywords** from user query
2. **Match against node triggers** — lexical overlap scoring
3. **Boost by node type** — role and rule nodes always included; behavior/knowledge filtered by relevance
4. **Include edge-connected nodes** — if a node is retrieved, pull nodes connected via `supports` edges
5. **Return top-N nodes** ordered by combined score (relevance + priority)

#### Retrieval Algorithm

```typescript
function retrieveRelevantNodes(query: string, nodes: SkillNode[], edges: SkillEdge[], maxNodes: number = 20): SkillNode[] {
    // 1. Always include role + rule nodes
    const mandatory = nodes.filter((n) => n.type === 'role' || n.type === 'rule')

    // 2. Score remaining nodes by keyword overlap with query
    const scored = nodes
        .filter((n) => n.type !== 'role' && n.type !== 'rule')
        .map((n) => ({ node: n, score: computeRelevance(query, n.triggers, n.content) }))
        .sort((a, b) => b.score - a.score)

    // 3. Take top candidates
    const candidates = scored.slice(0, maxNodes - mandatory.length)

    // 4. Expand via edges — add supporting nodes
    const expanded = expandViaEdges(
        candidates.map((c) => c.node),
        edges,
        nodes
    )

    // 5. Deduplicate and return
    return deduplicate([...mandatory, ...candidates.map((c) => c.node), ...expanded])
}
```

#### Integration

This replaces the file-level `retrieveRelevantAssets()` from Phase 3 when nodes are available. When nodes don't exist (backward compat), fall back to file-level retrieval.

### Files to Modify

| File                                                     | Change                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts` | Replace file-level retrieval with node-level when nodes exist |

### Files to Create

| File                                                    | Purpose                            |
| ------------------------------------------------------- | ---------------------------------- |
| `packages/server/src/services/skill-nodes/retriever.ts` | Node retrieval scoring + expansion |

### Checklist

-   [ ] Implement `retrieveRelevantNodes()` function
-   [ ] Always include role + rule nodes regardless of query
-   [ ] Score behavior/knowledge/asset nodes by keyword overlap with query
-   [ ] Implement edge expansion: if node retrieved, include `supports` connected nodes
-   [ ] Add `maxRetrievedNodes` parameter to SkillTool (default 20)
-   [ ] Integrate into `SkillFileTool._call()` — use node retrieval when nodes exist
-   [ ] Backward compatibility: fall back to file-level retrieval when no nodes
-   [ ] Unit tests: mandatory nodes always included
-   [ ] Unit tests: keyword scoring ranks relevant nodes higher
-   [ ] Unit tests: edge expansion pulls connected nodes
-   [ ] Unit tests: maxRetrievedNodes limits output

---

## WI-P4-8: Skill File Save Triggers Extraction

### Problem

Node extraction must run automatically when users save skill files. It should not require manual triggering or a separate background job.

### Design

Wire the extraction pipeline into the existing skill file create/update flow:

```
User saves skill file
  → validate content
  → save SkillFile to DB
  → compute SHA256(content)
  → compare with SkillFile.compileHash
  → if changed:
      → run SkillNodeExtractor.extract()
      → persist nodes + edges
      → update compileHash
      → invalidate SkillCompileCache
  → if unchanged:
      → skip extraction
```

This ensures nodes are always up-to-date without user intervention.

### Files to Modify

| File                                                | Change                                                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `packages/server/src/services/skill-files/index.ts` | Add extraction call after save; add hash comparison logic    |
| `packages/server/src/services/skill-nodes/index.ts` | Add `deleteBySkillFileId()` for cleanup before re-extraction |

### Checklist

-   [ ] Add hash comparison logic in `createSkillFile()` — extract on first save
-   [ ] Add hash comparison logic in `updateSkillFile()` — extract only if content changed
-   [ ] Invalidate compile cache when extraction runs
-   [ ] Handle extraction errors gracefully — save the file even if extraction fails
-   [ ] Log extraction results (node count, edge count, time taken)
-   [ ] Unit tests: save triggers extraction
-   [ ] Unit tests: unchanged content skips extraction
-   [ ] Unit tests: extraction failure does not block file save

---

## WI-P4-9: Database Index Strategy

### Problem

As skills grow, queries against nodes and edges need efficient indexing to maintain performance.

### Design

Add database indexes for common query patterns:

#### SkillNode Indexes

```sql
CREATE INDEX idx_skill_node_file ON skill_node (skillFileId);
CREATE INDEX idx_skill_node_folder ON skill_node (folderId);
CREATE INDEX idx_skill_node_type ON skill_node (type);
CREATE INDEX idx_skill_node_priority ON skill_node (priority);
CREATE INDEX idx_skill_node_cluster ON skill_node (cluster);
CREATE INDEX idx_skill_node_file_type ON skill_node (skillFileId, type);
CREATE INDEX idx_skill_node_file_priority ON skill_node (skillFileId, priority DESC);
```

#### SkillEdge Indexes

```sql
CREATE INDEX idx_skill_edge_file ON skill_edge (skillFileId);
CREATE INDEX idx_skill_edge_from ON skill_edge (fromNodeId);
CREATE INDEX idx_skill_edge_to ON skill_edge (toNodeId);
```

#### SkillCompileCache Indexes

```sql
CREATE INDEX idx_skill_cache_file ON skill_compile_cache (skillFileId);
CREATE INDEX idx_skill_cache_hash ON skill_compile_cache (skillFileId, hash);
```

### Checklist

-   [ ] Add indexes to SkillNode migration
-   [ ] Add indexes to SkillEdge migration
-   [ ] Add indexes to SkillCompileCache migration
-   [ ] Verify index performance with sample data

---

## Implementation Order

```
WI-P4-1 (SkillNode Entity)
    ↓
WI-P4-2 (SkillEdge Entity)          ←→  WI-P4-3 (SkillCompileCache Entity)   [parallel]
    ↓                                        ↓
WI-P4-4 (compileHash on SkillFile)
    ↓
WI-P4-5 (Node Extraction Pipeline)  ←  Foundation for everything below
    ↓
WI-P4-8 (Save Triggers Extraction)
    ↓
WI-P4-6 (Node-Aware Compilation)    ←→  WI-P4-7 (Node-Aware Retrieval)       [parallel]
    ↓
WI-P4-9 (Database Indexes)          ←  Performance pass after data exists
```

### Rationale

-   **WI-P4-1** must come first — all other work items reference `SkillNode`
-   **WI-P4-2 + WI-P4-3** are independent entity definitions, can be done in parallel
-   **WI-P4-4** is a small schema change, needed before the extraction pipeline
-   **WI-P4-5** is the core engine — everything after this depends on it
-   **WI-P4-8** wires the pipeline into the user flow
-   **WI-P4-6 + WI-P4-7** are the runtime consumers of nodes, can be developed in parallel
-   **WI-P4-9** is a performance optimization, best done after data patterns are established

---

## Priority Ranking

| Priority | Work Item                         | Impact                                          | Effort |
| -------- | --------------------------------- | ----------------------------------------------- | ------ |
| **P0**   | WI-P4-1: SkillNode Entity         | Critical — foundation for all Phase 4 work      | Low    |
| **P0**   | WI-P4-2: SkillEdge Entity         | Critical — enables relationship-aware retrieval | Low    |
| **P0**   | WI-P4-5: Node Extraction Pipeline | Critical — the core engine of Phase 4           | High   |
| **P0**   | WI-P4-8: Save Triggers Extraction | Critical — ensures nodes stay current           | Low    |
| **P1**   | WI-P4-4: compileHash on SkillFile | High — prevents unnecessary re-extraction       | Low    |
| **P1**   | WI-P4-6: Node-Aware Compilation   | High — structured output from nodes             | Medium |
| **P1**   | WI-P4-7: Node-Aware Retrieval     | High — granular retrieval at node level         | Medium |
| **P2**   | WI-P4-3: SkillCompileCache Entity | Medium — performance optimization               | Low    |
| **P2**   | WI-P4-9: Database Indexes         | Medium — important at scale                     | Low    |

---

## Dependencies

| Item                     | External Dependency                                              |
| ------------------------ | ---------------------------------------------------------------- |
| Node Extraction Pipeline | None — fully deterministic, no LLM required                      |
| Edge Linking             | None — keyword-based heuristics only                             |
| Compile Cache            | None — pure server-side caching                                  |
| Node-Aware Compilation   | WI-P4-1 (SkillNode) + WI-P4-5 (Extraction)                       |
| Node-Aware Retrieval     | WI-P4-1 (SkillNode) + WI-P4-2 (SkillEdge) + WI-P4-5 (Extraction) |

---

## Migration Notes

-   **Backward compatibility** — all new features default to current behavior when nodes don't exist
-   **No breaking changes** — existing skills continue to work identically without re-save
-   **Progressive adoption** — nodes are generated on next save; old skills work via raw content fallback
-   **DB migrations** — all new columns and tables use nullable fields; existing rows unaffected
-   **Deterministic extraction** — same content always produces identical nodes (no LLM variance)

---

## Future Considerations (Not in Phase 4 Scope)

These are acknowledged for awareness but explicitly deferred:

| Topic                                                 | Why Deferred                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| LLM-assisted node extraction                          | Start deterministic first; LLM can assist later for ambiguity |
| Embedding-based node retrieval                        | Keyword matching sufficient for initial node retrieval        |
| Node type extensions (tool_hint, mcp_hint, guardrail) | Keep type enum small; extend when concrete use cases emerge   |
| UI for node visualization                             | Nodes are internal; expose only when debugging UX demands it  |
| Cross-skill edge linking                              | Inter-skill relationships add complexity; start intra-skill   |
| Semantic node merging                                 | Dedup redundant nodes via LLM — Phase 5 candidate             |

---

## Full Checklist Summary

### WI-P4-1: SkillNode Entity + Migration

-   [ ] Define `ISkillNode` interface in `Interface.ts`
-   [ ] Create `SkillNode` entity
-   [ ] Create migrations for all 4 DB types
-   [ ] Register entity in DataSource configs and entity map
-   [ ] Verify migration runs cleanly

### WI-P4-2: SkillEdge Entity + Migration

-   [ ] Define `ISkillEdge` interface in `Interface.ts`
-   [ ] Create `SkillEdge` entity
-   [ ] Create migrations for all 4 DB types
-   [ ] Register entity in DataSource configs and entity map
-   [ ] Verify migration runs cleanly

### WI-P4-3: SkillCompileCache Entity + Migration

-   [ ] Define `ISkillCompileCache` interface in `Interface.ts`
-   [ ] Create `SkillCompileCache` entity
-   [ ] Create migrations for all 4 DB types
-   [ ] Register entity in DataSource configs and entity map
-   [ ] Verify migration runs cleanly

### WI-P4-4: compileHash on SkillFile

-   [ ] Add `compileHash` column to `SkillFile` entity
-   [ ] Update `ISkillFile` interface
-   [ ] Create migrations for all 4 DB types

### WI-P4-5: Node Extraction Pipeline

-   [ ] Create `SkillNodeExtractor` class with 8-stage pipeline
-   [ ] Stage 1 (Load): collect RawSkillInput
-   [ ] Stage 2 (Parse): markdown heading detection
-   [ ] Stage 3 (Normalize): bullet + whitespace cleanup
-   [ ] Stage 4 (Segment): bullet → sentence → paragraph splitting
-   [ ] Stage 5 (Classify): pattern-based type assignment
-   [ ] Stage 6 (Prioritize): default weight assignment
-   [ ] Stage 7 (Link): keyword-overlap edge creation
-   [ ] Stage 8 (Persist): transactional save
-   [ ] Wire into skill file create/update
-   [ ] Cluster assignment logic
-   [ ] Trigger keyword extraction
-   [ ] Full unit test suite (parsing, normalization, segmentation, classification, edge creation, idempotency)

### WI-P4-6: Node-Aware Compilation

-   [ ] Refactor compiler to accept `SkillNode[]`
-   [ ] Node ordering by priority + orderIndex
-   [ ] Type-grouped output format
-   [ ] Token budget trimming
-   [ ] Cache integration (lookup + save)
-   [ ] Cache invalidation
-   [ ] Backward compatibility fallback
-   [ ] Unit tests

### WI-P4-7: Node-Aware Retrieval

-   [ ] Implement `retrieveRelevantNodes()`
-   [ ] Mandatory role + rule inclusion
-   [ ] Keyword scoring for other types
-   [ ] Edge expansion for connected nodes
-   [ ] Integration into `SkillFileTool._call()`
-   [ ] Backward compatibility fallback
-   [ ] Unit tests

### WI-P4-8: Save Triggers Extraction

-   [ ] Hash comparison in createSkillFile()
-   [ ] Hash comparison in updateSkillFile()
-   [ ] Cache invalidation on extraction
-   [ ] Graceful error handling
-   [ ] Logging
-   [ ] Unit tests

### WI-P4-9: Database Indexes

-   [ ] SkillNode indexes (file, folder, type, priority, cluster, composites)
-   [ ] SkillEdge indexes (file, fromNode, toNode)
-   [ ] SkillCompileCache indexes (file, file+hash)
-   [ ] Performance verification
