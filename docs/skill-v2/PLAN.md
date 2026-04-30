# Skill v2 — Implementation Plan (Dify-Style, JSON-First)

> Target: rebuild the Flowise Skill feature from scratch based on the Dify skill architecture
> documented in `docs/dify_project/dify_skill_ARCHITECTURE.md` and the runtime walkthrough in
> `docs/dify_project/skill_invocation.md`.
>
> **Hard constraints (user-supplied)**
>
> 1. Only **one database entity** is allowed: `Skill`.
> 2. All skill content and metadata are stored as **JSON files** in object storage (the same
>    `IStorageProvider` stack Flowise already uses).
> 3. **Do not reuse** the legacy v1 code (`SkillFolder`, `SkillFile`, `SkillAsset`,
>    `SkillNode`, `SkillEdge`, `SkillNodeEmbedding`, `SkillCompileCache`, the whole
>    `SkillTool/compiler/**` tree, `SkillFolderDialog`, etc.). v2 is a parallel,
>    greenfield implementation under new paths.
>
> Legacy v1 (documented in `docs/skill_architecture.md`) stays in place untouched. v2 ships
> behind a new node (`SkillV2Tool`) and new REST surface (`/api/v1/skills-v2/**`). Migration
> is opt-in.

---

## Table of Contents

1. [Design Goals](#1-design-goals)
2. [Concept Mapping: Dify → Flowise](#2-concept-mapping-dify--flowise)
3. [Data Model — The Single `Skill` Entity](#3-data-model--the-single-skill-entity)
4. [Storage Layout](#4-storage-layout)
5. [Placeholder Syntax](#5-placeholder-syntax)
6. [Compilation Pipeline](#6-compilation-pipeline)
7. [Skill Bundle](#7-skill-bundle)
8. [Runtime Invocation Inside Flowise](#8-runtime-invocation-inside-flowise)
9. [REST API](#9-rest-api)
10. [Directory Layout & New Files](#10-directory-layout--new-files)
11. [UI](#11-ui)
12. [Security](#12-security)
13. [Phased Rollout](#13-phased-rollout)
14. [Testing Strategy](#14-testing-strategy)
15. [Open Questions / Design Decisions](#15-open-questions--design-decisions)

---

## 1. Design Goals

| Goal                              | How v2 achieves it                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dify-style composability**      | Skills are Markdown assets that reference other skill nodes / tools via Flowise-native `{{…}}` placeholders (no new grammar for users to learn — see §5). A stateless compiler resolves them and propagates tool dependencies transitively. |
| **Minimal relational footprint**  | A single `Skill` table holds only pointers + lightweight metadata. All heavy content (markdown, metadata, bundle, binaries) lives in object storage as JSON/bytes.                                                                          |
| **JSON everywhere**               | Every skill is persisted as `{ content: string, metadata: SkillMetadata }` JSON in storage. The compiled `SkillBundle` is also a single JSON artifact.                                                                                      |
| **Bundle-based runtime**          | Runtime never reads the raw DB; it loads one `bundle.json` (cached in memory/Redis) and calls `compile_one` per prompt.                                                                                                                     |
| **Transitive tool authorization** | Skill A that references Skill B inherits B's tool deps. A `ToolAccessPolicy` gates what a chatflow agent can invoke.                                                                                                                        |
| **No legacy coupling**            | Entirely new module tree (`nodes/tools/SkillV2Tool/`, `services/skills-v2/`, `database/entities/SkillV2.ts`). Legacy v1 stays untouched.                                                                                                    |
| **Incremental + cacheable**       | Bundles are keyed by `(workspaceId, bundleId)` where `bundleId = hash(content_digests)`. Redis cache with 24h TTL matches Dify.                                                                                                             |

---

## 2. Concept Mapping: Dify → Flowise

Dify operates inside a workflow engine; Flowise operates inside a chatflow/agentflow with
LangChain-style tools. The mapping:

| Dify concept                               | Flowise v2 equivalent                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dify app                                   | One row in **`skill_v2`** — a self-contained bundle of files owned by `workspaceId`.                                                                                                                     |
| `AppAssetFileTree`                         | The `fileTree` JSON column on `SkillV2` (shape shown in §3.1). Identical to Dify's layout.                                                                                                               |
| `AppAssetService`                          | `SkillV2Service` (row CRUD) + `SkillTreeService` (node CRUD inside `fileTree`).                                                                                                                          |
| `SkillDocument`                            | `{ nodeId, content, metadata, kind, path, … }` derived from one tree node + its stored payload.                                                                                                          |
| `SkillCompiler.compile_all/compile_one`    | `SkillV2Compiler.compileAll/compileOne` — stateless, pure TS.                                                                                                                                            |
| `SkillBundle`                              | `SkillBundle` JSON artifact stored at `skills-v2/{workspaceId}/artifacts/{bundleId}/bundle.json`.                                                                                                        |
| `SkillBuilder` (build pipeline)            | Explicit **Publish** action that produces a new `bundleId`, or implicit on-demand build on first chatflow run.                                                                                           |
| `SkillManager` (load/save + Redis)         | `SkillBundleManager` with same two-tier cache (memory → Redis → storage).                                                                                                                                |
| `SkillInitializer` (sandbox bundle inject) | `SkillV2Tool.init()` loads bundle into the agent's tool closure.                                                                                                                                         |
| LLM Node + `compile_one` at runtime        | `SkillV2Tool._call()` calls `compileOne` when an agent invokes the skill.                                                                                                                                |
| `ToolAccessPolicy`                         | `SkillV2Tool` filters the chatflow's tool array down to the deps declared by the skills it exposes (advisory in Flowise — see §8.4).                                                                     |
| Sandbox VM (`bash`, `python3`, …)          | **Not provided.** Flowise has no persistent sandbox. Code/data skill files are handled via two alternatives: (a) return their content inline when small, (b) expose a `readSkillAsset` helper tool — §8. |
| Multimodal workflow variables              | Flowise already handles file uploads in chatflow's `overrideConfig.uploads` / `Document` nodes — v2 does **not** replicate Dify's variable path.                                                         |

Net effect: v2 reuses Dify's **authoring + compilation** model verbatim, and re-maps Dify's
**runtime** model onto Flowise's agent-and-tool model.

---

## 3. Data Model — The Single `Skill` Entity

### 3.1 What "a skill" is

After reviewing Dify's real persistence layer, **a Skill is not a single Markdown file — it
is a self-contained bundle (folder tree) of files**, equivalent to Dify's `App` + its
`AppAssetFileTree`. A skill typically contains:

-   one or more `.md` "skill prompts" (the invocable entry points),
-   accompanying `.txt` / `.json` / `.csv` data files,
-   executable code files (`.py`, `.js`, …),
-   binary media (`.pdf`, `.png`, …),
-   organized under named folders to give authors a real workspace.

Example (the exact payload the user supplied, pasted verbatim into a skill's `fileTree`
column):

```json
{
    "nodes": [
        {
            "id": "fa56cf9a-…",
            "node_type": "file",
            "name": "marketing-strategy.md",
            "parent_id": null,
            "order": 0,
            "extension": "md",
            "size": 8143
        },
        { "id": "5cbd6021-…", "node_type": "folder", "name": "assets", "parent_id": null, "order": 1, "extension": "", "size": 0 },
        {
            "id": "effe8c05-…",
            "node_type": "file",
            "name": "social-media-strategy.jpeg",
            "parent_id": "5cbd6021-…",
            "order": 0,
            "extension": "jpeg",
            "size": 1058188
        },
        {
            "id": "eddcc425-…",
            "node_type": "file",
            "name": "TikTok-3-aspects.jpg",
            "parent_id": "5cbd6021-…",
            "order": 1,
            "extension": "jpg",
            "size": 134086
        },
        { "id": "adc7602a-…", "node_type": "file", "name": "test", "parent_id": null, "order": 2, "extension": "", "size": 59 },
        { "id": "654ebe13-…", "node_type": "file", "name": "main.js", "parent_id": null, "order": 3, "extension": "js", "size": 53 },
        { "id": "e28fcf09-…", "node_type": "file", "name": "main.py", "parent_id": null, "order": 4, "extension": "py", "size": 50 }
    ]
}
```

This mirrors Dify's `AppAssetFileTree` exactly.

### 3.2 The entity

```ts
// packages/server/src/database/entities/SkillV2.ts
@Entity({ name: 'skill_v2' })
export class SkillV2 {
    @PrimaryGeneratedColumn('uuid') id: string

    @Index()
    @Column({ type: 'uuid' })
    workspaceId: string

    // Human-chosen name for the skill (becomes the default tool name when exposed).
    @Column({ type: 'varchar', length: 255 }) name: string

    // Short description for agent-tool discovery and the skill library UI.
    @Column({ type: 'text', nullable: true }) description: string | null

    // Optional metadata for the skill-library UI.
    @Column({ type: 'varchar', length: 255, nullable: true }) iconSrc: string | null
    @Column({ type: 'varchar', length: 16, nullable: true }) color: string | null

    // The whole file tree (files + folders) as one JSON blob. Shape: SkillFileTree (see §3.3).
    // Every node has a UUID; the UUID is what placeholders reference.
    // The actual bytes for each file node live in object storage at
    // skills-v2/{workspaceId}/{skillId}/nodes/{nodeId}.{json|bin}.
    @Column({ type: 'text' }) fileTree: string

    // sha256(fileTree JSON + sorted node contentDigests). One-shot cache key for the
    // whole skill; changes whenever any file node content changes.
    @Column({ type: 'varchar', length: 64 }) contentDigest: string

    // Pointer to the most recent published bundle for this skill. null until first publish.
    @Column({ type: 'varchar', length: 64, nullable: true }) publishedBundleId: string | null

    @CreateDateColumn() createdAt: Date
    @UpdateDateColumn() updatedAt: Date
}
```

### 3.3 `SkillFileTree` — the shape of the `fileTree` column

```ts
// packages/server/src/services/skills-v2/entities.ts
interface SkillFileTree {
    nodes: SkillTreeNode[]
}

interface SkillTreeNode {
    id: string // UUID — stable forever; used in placeholders
    node_type: 'file' | 'folder'
    name: string // filename or folder name (not unique across the tree)
    parent_id: string | null // null => tree root
    order: number // display order among siblings
    extension: string // 'md' | 'py' | 'jpeg' | '' (folders & extensionless files)
    size: number // 0 for folders; bytes for files

    // Derived at compile time; NOT persisted in the column:
    //   kind: 'skill' | 'data' | 'code' | 'binary'  (from extension)
    //   path: '/assets/social-media-strategy.jpeg'  (from parent_id walk)
    //   contentDigest: sha256(bytes)                (stored in a small sidecar)
}
```

Design notes:

-   **UUID is the placeholder identifier.** A placeholder `{{skill.fa56cf9a-…}}` targets a
    tree node by its UUID. Renaming the file is a no-op for references.
-   **Two `node_type` values** — `file` and `folder`, identical to Dify. Folders have no
    bytes, no digest, just a name and an order.
-   **No separate path column.** Paths are computed on demand by walking `parent_id` chains.
    The tree is always small enough for an in-memory walk.
-   **Extension drives classification.** A lightweight `classifyKind(extension)` helper
    buckets nodes into `skill | data | code | binary` at compile time; the column does not
    store it.

### 3.4 What is NOT in the DB

Deliberately absent:

-   No row per file (every file is a JSON node inside `fileTree`).
-   No folder table (folders are `node_type: 'folder'` entries in the same tree).
-   No asset/node/edge/embedding/cache tables (v1 artifacts — not reused).
-   No `bundle` table (bundles are JSON files in object storage; the row just holds
    `publishedBundleId`).

### 3.5 Rules & invariants

-   `UNIQUE(workspaceId, name)` so users never see two skills with the same display name in
    one workspace. Within a skill, file/folder `name` may collide across branches (same
    as Dify / any real filesystem).
-   `fileTree` must contain each `parent_id` as a valid folder node id (or `null`). A
    `beforeUpdate` hook validates invariants: no cycles, parent exists, root-level `order`
    is monotonic, etc.
-   Deleting a skill deletes its whole storage prefix (`skills-v2/{wsId}/{skillId}/**`) and
    invalidates any cached bundles — cascade is purely at the service layer (no FK).
-   Skill size is capped (soft limit — e.g. `MAX_SKILL_BYTES = 200 MiB`, enforced in the
    service on every node upload).

### 3.6 Non-DB persisted artifacts

Everything that is not in the table lives in object storage, organized per skill:

| Artifact              | Location                                                               | Shape                                |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| Markdown file node    | `skills-v2/{wsId}/{skillId}/nodes/{nodeId}.json`                       | `{ content: string, metadata: {…} }` |
| Data file node (text) | `skills-v2/{wsId}/{skillId}/nodes/{nodeId}.json`                       | `{ content: string }`                |
| Code file node        | `skills-v2/{wsId}/{skillId}/nodes/{nodeId}.json`                       | `{ content: string }`                |
| Binary file node      | `skills-v2/{wsId}/{skillId}/nodes/{nodeId}.bin`                        | raw bytes                            |
| Per-node digest       | `skills-v2/{wsId}/{skillId}/nodes/{nodeId}.meta.json`                  | `{ digest, size, mime }`             |
| Compiled bundle       | `skills-v2/{wsId}/{skillId}/artifacts/{bundleId}/bundle.json`          | `SkillBundle` (§7)                   |
| Resolved per-node MD  | `skills-v2/{wsId}/{skillId}/artifacts/{bundleId}/resolved/{nodeId}.md` | compiled content                     |
| Published pointer     | `skills-v2/{wsId}/{skillId}/published.json`                            | `{ currentBundleId }`                |

Why store markdown as JSON rather than plain `.md`? Because each markdown node carries
tool metadata (`tool UUID → config`) that must travel atomically with its content. A
plain `.md` would require a sidecar — we collapse it into one JSON payload, matching
Dify's draft layout.

---

## 4. Storage Layout

Each skill owns its own prefix under the workspace. Bundles live **per skill** (not
per workspace), because placeholders only reference nodes inside the same skill — a
skill is the compilation unit, matching Dify's per-app `SkillBundle`.

```
skills-v2/
└── {workspaceId}/
    └── {skillId}/
        ├── nodes/
        │   ├── {nodeId}.json         # md / data / code: {content, metadata?}
        │   ├── {nodeId}.bin          # binary (pdf / image / …)
        │   └── {nodeId}.meta.json    # {digest, size, mime}
        ├── artifacts/
        │   └── {bundleId}/
        │       ├── bundle.json       # SkillBundle (§7)
        │       └── resolved/
        │           └── {nodeId}.md   # per-node compiled markdown
        └── published.json            # {"currentBundleId": "..."}
```

-   `bundleId` is a deterministic hash:
    `sha256(fileTree JSON + sorted(nodeId + nodeDigest for every node))`. Republishing
    an unchanged skill yields the same id → the service treats that as a cheap no-op and
    just re-points `published.json` + the row's `publishedBundleId`.
-   `published.json` is the **per-skill head pointer**. Runtime loaders read it first to
    locate the active bundle. It is also copied into the `SkillV2.publishedBundleId`
    column for fast DB-only lookups (storage and DB are kept in sync by the publish
    transaction).
-   Legacy v1 storage (`skills/...` used by `SkillAsset` uploads) is untouched.

Redis key pattern, keyed per skill:

```
skill_v2_bundle:{workspaceId}:{skillId}:{bundleId}   TTL 24h
```

A secondary key `skill_v2_head:{workspaceId}:{skillId}` holds just the current bundleId
string (TTL 60s) so a chatflow agent does not need a DB round-trip for every call.

---

## 5. Placeholder Syntax

> **Decision:** reuse Flowise's existing `{{…}}` placeholder grammar instead of Dify's
> `§[…]§`. Users already know `{{question}}`, `{{$vars.foo}}`, `{{$flow.sessionId}}`, and
> `{{<nodeId>.data.instance}}` from chatflow inputs (see `getVariableValue` in
> `packages/server/src/utils/index.ts:870`). Introducing a second grammar just for skills
> would be gratuitously different. Dify's conceptual model (tool/file references,
> tool groups, transitive propagation) is preserved — only the surface syntax changes.

### 5.1 The two skill-specific placeholders

Skill content may contain two new `{{…}}` namespaces on top of everything Flowise already
resolves:

**Tool reference**

```
{{tool.<provider>.<toolName>.<uuid>}}
```

-   Resolved at **compile time** by `SkillV2Compiler`.
-   Produces a human-readable label, e.g. `[Candidate Lookup: candidate_lookup_tool-uuid-1]`.
-   `<provider>` is the Flowise tool-registry key (`custom`, `mcp`, `http_request`,
    `builtin`, …). `<toolName>` is the tool's canonical name. `<uuid>` matches the key in
    the node's `metadata.tools` map (§6.1).

**File reference** (a node inside _this_ skill's tree)

```
{{skill.<nodeId>}}
```

-   Resolved at **compile time** to a path string:
    -   Caller is another node in the same tree → relative path from caller's folder, e.g.
        `./assets/social-media-strategy.jpeg` or `../main.py`.
    -   Caller is an anonymous prompt produced by `SkillV2Tool` (the runtime shim in §8.3) →
        absolute path under the skill's materialized layout, e.g.
        `skills/marketing-strategy.md`.
-   `<nodeId>` is the UUID of a node in `fileTree.nodes`. Unknown ids emit
    `SKILL_V2_BROKEN_REFERENCE`; placeholders never silently resolve to empty strings.

**Tool groups** (multiple candidates in a bracketed list; disabled tools are stripped)

```
[{{tool.a.x.u1}}, {{tool.b.y.u2}}]
```

The compiler detects the pattern `\[\s*{{tool\.…}}(\s*,\s*{{tool\.…}})*\s*]` during the
resolution pass, filters out entries whose metadata has `enabled: false`, and emits
either the remaining list or an empty string if every candidate is disabled.

### 5.2 Flowise-native placeholders pass through

Anything else the resolver in `getVariableValue` understands also works inside skill
content, but is **resolved at runtime**, not at compile time:

| Placeholder                         | When resolved       | Resolves to                                     |
| ----------------------------------- | ------------------- | ----------------------------------------------- |
| `{{tool.<provider>.<name>.<uuid>}}` | compile time        | human-readable label (skill-specific)           |
| `{{skill.<nodeId>}}`                | compile time        | path string (skill-specific)                    |
| `{{question}}`                      | runtime (tool call) | the current user message                        |
| `{{file_attachment}}`               | runtime             | uploaded-files content (if any)                 |
| `{{chat_history}}`                  | runtime             | stringified chat history                        |
| `{{$vars.<key>}}`                   | runtime             | workspace variable (static or env-runtime)      |
| `{{$flow.<key>}}`                   | runtime             | `{chatflowId, sessionId, chatId, input, state}` |

Compile-time pass strips the two skill-specific namespaces; everything else is left
verbatim and passed through `getVariableValue` when `SkillV2Tool._call()` returns the
resolved content. This is a natural extension of the existing Custom Tool pattern
(`docs/custom_tool_architecture.md` §4) — skills get the same runtime context Custom
Tools already enjoy.

### 5.3 Disambiguating `{{skill.X}}` from `{{<nodeId>.data.instance}}`

Flowise's runtime resolver treats `{{<firstSegment>.…}}` as a cross-node reference when
`<firstSegment>` matches an existing `reactFlowNode.id`. Because:

1. The skill compiler runs **before** runtime variable resolution and fully strips
   `{{skill.…}}` placeholders.
2. Flowise node IDs are UUIDs; the reserved prefix `skill` (and `tool`) are not valid
   node IDs in any chatflow.

…there is no collision. If a user nevertheless names a chatflow node literally `skill` or
`tool`, the compiler runs first, so skill placeholders still win.

### 5.4 Cross-skill references

Intentionally disallowed in the first release — a skill is a self-contained unit, matching
Dify. See §15 open question 1 for the future escape hatch (a proposed
`{{skill.<skillId>:<nodeId>}}` form).

### 5.5 Escaping

If a skill author needs literal `{{foo}}` in their markdown (not resolved), use
either:

-   HTML entity: `&#123;&#123;foo&#125;&#125;` — survives the resolver.
-   Backtick-wrap: `\`{{foo}}\`` — the compiler skips placeholders inside fenced-code or
    inline-code spans (a narrow pass added to preserve Markdown semantics).

No `§§`-style escape is needed because we dropped that grammar.

---

## 6. Compilation Pipeline

### 6.1 Entry points

The compiler operates on a single skill's tree. `compileAll` iterates **every file node
inside one skill**, not every skill in a workspace.

```ts
// packages/server/src/services/skills-v2/compiler/SkillV2Compiler.ts

interface SkillDocument {
    nodeId: string // UUID of the tree node (or '__anon__' at runtime)
    kind: 'skill' | 'data' | 'code' | 'binary'
    path: string // computed path inside the skill, e.g. 'assets/foo.jpeg'
    filename: string
    extension: string
    content: string // '' for binary
    metadata: SkillMetadata // empty {} for non-skill kinds
    contentDigest: string
}

interface SkillMetadata {
    tools: Record<string /*uuid*/, ToolReference>
    files?: FileReference[] // usually inferred from content scan
}

interface ToolReference {
    type: 'custom' | 'mcp' | 'http' | 'builtin'
    provider: string
    toolName: string
    uuid: string
    credentialId?: string
    enabled: boolean
    config?: Record<string, unknown>
}

interface CompileInput {
    skillId: string
    fileTree: SkillFileTree
    nodeDocuments: SkillDocument[] // one per file node (skill/data/code/binary)
}

class SkillV2Compiler {
    compileAll(input: CompileInput): SkillBundle
    compileOne(prompt: SkillDocument, bundle: SkillBundle): SkillBundleEntry
}
```

### 6.2 `compileAll` — per-skill build-time

Same three phases as Dify, scoped to one skill's tree:

1. **Parse & graph**

    - For every `kind === 'skill'` node, scan `content` for the two skill-specific
      placeholder namespaces — `{{tool.…}}` and `{{skill.…}}` — using a single scanner
      that walks `{{`/`}}` pairs (identical to the matcher in `getVariableValue`,
      `packages/server/src/utils/index.ts:870`).
    - Skip placeholder tokens that fall inside fenced or inline code spans (§5.5) so we
      do not mangle literal markdown examples.
    - Merge scanned references with the node's explicit `metadata` (the JSON blob saved
      with the file).
    - Build the forward graph `{ nodeId → [nodeId referenced as files] }`. Non-skill
      file nodes are leaves (the compiler does not parse `.py` / `.pdf` / etc.).

2. **Direct compile**

    - For each skill-node, resolve placeholders independently:
        - `{{tool.P.N.U}}` → `[<pretty name>: <toolName>_<uuid>]` (look up `P.N.U` in
          the node's metadata; fall back to `<toolName>_<uuid>` if no match).
        - Tool groups (the `[{{tool....}}, {{tool....}}]` pattern) → bracketed list;
          drop disabled entries; if the list becomes empty, replace the whole group
          with an empty string.
        - `{{skill.<nodeId>}}` → path string computed from the tree:
            - skill-node → skill-node: relative path (e.g. `./sub.md`, `../main.py`).
            - skill-node → data/code/binary node: same relative path rules, pointing
              at a non-skill file.
            - Unknown `nodeId` → `SKILL_V2_BROKEN_REFERENCE` error.
        - All other `{{…}}` placeholders (Flowise runtime tokens like `{{question}}`,
          `{{$vars.x}}`, `{{$flow.…}}`) are left **verbatim** — they are resolved later
          at runtime by `getVariableValue` (§8.3, §5.2).
    - Produce a preliminary `SkillBundleEntry` with **direct** tool + file deps for every
      skill-node. Non-skill nodes get a minimal entry (`content: ''`, declared tools empty)
      so they can still be looked up by id in the bundle.

3. **Transitive propagation (fixed-point)**

    - Iterate only over skill-node → skill-node edges. For every edge `A → B`, merge B's
      tool deps and file deps into A's entry. Non-skill leaves contribute their own
      FileReference but no tool deps. Repeat until no change.
    - Convergence is guaranteed (monotonic union over a finite universe). Cycles are
      still handled; the compiler emits a warning naming the participating nodes.

4. **Emit bundle** with
   `{ skillId, bundleId, entries, dependencyGraph, reverseGraph, builtAt, schemaVersion }`.

### 6.3 `compileOne` — runtime

Given an anonymous prompt (the node-invocation shim produced by `SkillV2Tool` — see §8.3):

1. Parse placeholders.
2. For every `{{skill.<nodeId>}}` referencing a known bundle entry, pull in that
   entry's already-computed transitive deps. O(1) lookup into the pre-built bundle.
3. Resolve all skill-specific placeholders. Anonymous prompts have no home folder, so
   paths are absolute: `skills/<path>/<filename>`.
4. Leave runtime `{{…}}` tokens (`{{question}}`, `{{$vars.…}}`, `{{$flow.…}}`, etc.)
   untouched for the call-site resolver.
5. Return a `SkillBundleEntry` with the resolved content + aggregated `ToolDependencies`.

This is the hot path; it must be allocation-cheap and O(len(content) + |refs|).

### 6.4 Compile keying

```
bundleId = sha256(
              schemaVersion
           || fileTree canonical JSON
           || sorted(nodeId || nodeDigest for every file node)
           )
```

If the computed `bundleId` already exists under
`skills-v2/{wsId}/{skillId}/artifacts/{bundleId}/`, `compileAll` is a no-op — the
service just re-points `published.json` and updates `SkillV2.publishedBundleId`.

---

## 7. Skill Bundle

A bundle is **per skill**, not per workspace. `entries` is keyed by tree-node UUID.

```ts
// packages/server/src/services/skills-v2/entities.ts

interface SkillBundle {
    schemaVersion: 1
    bundleId: string
    workspaceId: string
    skillId: string
    builtAt: string // ISO
    // keyed by tree node UUID (every file node has an entry; folders do not)
    entries: Record<string /* nodeId */, SkillBundleEntry>
    // graphs are over skill-kind nodes only
    dependencyGraph: Record<string, string[]>
    reverseGraph: Record<string, string[]>
}

interface SkillBundleEntry {
    nodeId: string
    kind: 'skill' | 'data' | 'code' | 'binary'
    name: string
    path: string // 'marketing-strategy.md', 'assets/foo.jpeg'
    source: { nodeId: string; contentDigest: string }
    tools: ToolDependencies
    files: AssetReferences
    content: string // resolved markdown for kind==='skill', '' otherwise
}

interface ToolDependencies {
    dependencies: ToolDependency[] // canonical (provider, toolName)
    references: ToolReference[] // per-invocation (credential, config)
}

interface ToolDependency {
    type: ToolReference['type']
    provider: string
    toolName: string
}

interface AssetReferences {
    references: FileReference[]
}

interface FileReference {
    source: 'app'
    nodeId: string
}
```

Operations the bundle must expose (mirrors Dify's `SkillBundle` API):

-   `get(nodeId)` — retrieve an entry for a tree node.
-   `upsert(entry)` / `remove(nodeId)` — for incremental republish of a single node.
-   `recompileGroupIds(nodeId)` — walk the reverse graph to find every skill-node
    transitively affected by a change to `nodeId`.
-   `subset(nodeIds)` — return a slimmer bundle for a subset of nodes (used when a
    `SkillV2Tool` only selects a few top-level `.md` nodes from a skill).
-   `aggregateTools(nodeIds?)` — union all entries' tool deps (optionally restricted to a
    subset), used to build the `ToolAccessPolicy` for a chatflow.

The bundle class is **pure data + helpers**, no I/O. I/O is `SkillBundleManager`'s job.

---

## 8. Runtime Invocation Inside Flowise

This is where v2 diverges most from Dify, because Flowise does not have a sandbox VM.

### 8.1 Node: `SkillV2Tool`

New component at `packages/components/nodes/tools/SkillV2Tool/SkillV2Tool.ts`. It follows
the pattern of `CustomTool.ts` (`docs/custom_tool_architecture.md`):

**Node inputs (UI)**

| Input              | Type                | Purpose                                                                                                                                              |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skillId`          | `asyncOptions`      | One skill from the current workspace (loaded via `listSkills` method).                                                                               |
| `entryNodeIds`     | `asyncMultiOptions` | Which file nodes in that skill to expose as invocable tools. Defaults to every top-level `.md` node. Loaded via `listEntryNodes` against `fileTree`. |
| `bundleMode`       | `options`           | `published` (read `published.json`) or `draft` (compile-on-demand, for authoring).                                                                   |
| `toolNamingScheme` | `options`           | `nodeName`, `skillName`, or `slugified`. Default `slugified`.                                                                                        |
| `returnFormat`     | `options`           | `resolved_markdown` (the compiled text) or `structured` (JSON envelope — see §8.3).                                                                  |
| `autoInjectDeps`   | `boolean`           | If true, wire transitive tool deps into the agent (§8.4).                                                                                            |

Multiple `SkillV2Tool` nodes can be added to a chatflow to expose several skills at once.

### 8.2 Init sequence

```
SkillV2Tool.init()
  ├── Resolve workspaceId + skillId from nodeData
  ├── Fetch SkillV2 row by id (scoped to workspaceId)
  ├── SkillBundleManager.loadBundle(workspaceId, skillId, bundleMode)
  │     - memory cache hit → return
  │     - Redis hit → warm memory, return
  │     - storage hit → warm Redis + memory, return
  │     - miss (draft mode): load all node payloads, run SkillV2Compiler.compileAll
  ├── If entryNodeIds empty → default = every top-level kind==='skill' node
  ├── subset = bundle.subset(entryNodeIds)
  ├── for each nodeId in subset.entries:
  │     build one DynamicStructuredTool whose:
  │        - name        = formatToolName(entry.name)   // e.g. marketing_strategy
  │        - description = entry.firstHeading || skill.description + deps hint
  │        - schema      = z.object({ query: z.string().optional() })
  │        - _call(args) = SkillV2CallStrategy.execute(entry, args, runtimeCtx)
  ├── return array of tools (LangChain arrays are supported by all Flowise agents)
```

The node returns **one LangChain tool per selected tree node**, matching v1 `SkillTool`'s
ergonomics so it plugs into any agent node (AgentExecutor, AgentFlow, LangGraph) without
special handling.

### 8.3 Call strategy — what the agent receives

When the agent invokes the tool for tree node `X` with input `args`:

1. Build an **anonymous prompt document** (a synthetic, non-tree node that just
   references `X`):
    ```ts
    const anon: SkillDocument = {
        nodeId: '__anon__',
        kind: 'skill',
        filename: '__anon__.md',
        path: '',
        extension: 'md',
        content: `{{skill.${X}}}`, // the agent "uses" tree node X
        metadata: { tools: {} },
        contentDigest: '__anon__'
    }
    ```
2. Run `compiler.compileOne(anon, bundle)`. Dify does exactly this (see
   `skill_invocation.md` Step 4, "The prompt is treated as an anonymous skill").
3. The result is a `SkillBundleEntry` with:

    - `content` — resolved markdown (skill-specific placeholders fully replaced: paths
      like `skills/assets/foo.jpeg`, tool labels like `[Python: python_tool-uuid-2]`).
      Flowise runtime tokens (`{{question}}`, `{{$vars.…}}`, `{{$flow.…}}`) are still
      present in raw form.
    - `tools.dependencies` — transitive tool closure the node is authorized to use.

4. **Runtime variable pass.** The resolved `content` is piped through Flowise's existing
   resolver (`getVariableValue` in `packages/server/src/utils/index.ts:870`) with the
   current `flowConfig` (`chatflowId`, `sessionId`, `chatId`, `input`, `state`), chat
   history, and workspace variables. This gives skill authors the same runtime context
   Custom Tools already expose, without inventing anything new.

5. **Output shape** chosen by `returnFormat`:
    - `resolved_markdown` (default, simplest): return the resolved content string, optionally
      prefixed with a "You may also use: [tool list]" line. Identical to v1 `SimpleCallStrategy`.
    - `structured`: return a JSON envelope the agent layer can recognize:
        ```json
        {
            "__skill_v2": true,
            "content": "...resolved markdown...",
            "tools": [{ "type": "custom", "provider": "hr_platform", "toolName": "candidate_lookup" }],
            "files": [{ "source": "app", "nodeId": "fa56cf9a-65df-463f-a2ee-d9c9de1d94f3" }]
        }
        ```
        The chatflow runtime (agent wrapper) can detect `__skill_v2` to enforce the access
        policy — otherwise it's just opaque JSON the agent passes through.

### 8.4 Tool access policy

Dify rejects LLM tool calls that are not in the bundle's declared dependencies. Flowise
has no equivalent enforcement layer in the agent loop today. v2 therefore ships **two
levels of enforcement**:

1. **Advisory (always-on)**: the resolved markdown lists only the allowed tools. The
   model sees them and is unlikely to hallucinate others.
2. **Hard enforcement (opt-in via `autoInjectDeps=true`)**:
    - At init time, `SkillV2Tool` computes `policy = bundle.aggregateTools(entryNodeIds)`.
    - Walks the chatflow's tool array (passed via `flowObj`/`options.tools`).
    - Filters it to the intersection of `policy.dependencies` and registered tools.
    - Emits the filtered array alongside the skill tools; the agent sees only
      policy-approved tools.

A future milestone can plug this into Flowise's agent executor wrapper so the policy
also applies to non-skill tools — out of scope for the initial cut.

### 8.5 Code / data / binary files

Dify relies on a sandbox VM to run `.py` or `cat` a `.txt` the LLM wants. Flowise has no
such VM in the general case, so we provide three complementary mechanisms:

| Asset kind                     | Mechanism                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.md` skill node               | Resolved content is inlined when an agent calls the skill tool.                                                                                                                                                                                                                                                                                                                                     |
| `.txt` / `.json` / `.csv` data | The placeholder resolves to `skills/<path>`. The `SkillV2Tool` also exposes a helper tool `read_skill_asset({ nodeId })` that returns the file's text content (size-capped). LLMs are trained to call such "read" tools on demand.                                                                                                                                                                  |
| Code (`.py`, `.js`)            | Two options documented in the node UI: (a) **E2B mode** — if `E2B_APIKEY` is set, we expose an `exec_skill_code({ nodeId, args[] })` helper that streams the file into an E2B sandbox and runs it (same backend `CustomTool` uses when E2B is configured). (b) **Disabled by default** otherwise — the LLM just sees the path string and can be told to return a description instead of running it. |
| Binary (`.png`, `.pdf`)        | `read_skill_asset` returns a base64 string with mime type. Large files are proxied via a signed URL helper (`get_skill_asset_url`). No automatic conversion to multimodal prompt blocks — that remains the chatflow's job.                                                                                                                                                                          |

Helper tools take `nodeId` (the tree node UUID), which the agent gets from the resolved
markdown's path strings (or from an explicit `list_skill_assets()` listing tool). All
helper tools share a single registration behind one node (no extra nodes required).

### 8.6 Runtime trace (follows `skill_invocation.md` example)

Reproducing the recruiting example on Flowise, now as a single skill named `recruiting`
with a file tree:

```
Skill "recruiting" (workspace W):
  fileTree.nodes = [
    { id: "n-screen",    kind=skill,  name: "resume-screener.md",    parent: null },
    { id: "n-interview", kind=skill,  name: "interview-questions.md", parent: null },
    { id: "n-email",     kind=skill,  name: "email-drafter.md",       parent: null },
    { id: "n-jd",        kind=data,   name: "job-description.txt",    parent: null },
    { id: "n-scorer",    kind=code,   name: "scoring_algorithm.py",   parent: null }
  ]

User hits POST /skills-v2/workspaces/W/skills/:skillId/publish
  → SkillV2Compiler.compileAll
  → bundleId = abc123
  → bundle.json + resolved/*.md written
  → SkillV2.publishedBundleId = "abc123"
  → published.json = { currentBundleId: "abc123" }

Chatflow "recruiter-agent" has:
  [SkillV2Tool] skillId=recruiting, entryNodeIds=[n-screen, n-interview, n-email]
  [AgentExecutor] bound to the three skill tools + an openai model

Agent loop:
  user: "Screen this resume: ..."
  model: tool_call('resume_screener', { query: 'john doe resume ...' })
    → SkillV2Tool._call:
        compileOne(anon = "{{skill.n-screen}}", bundle)
      returns:
        "You are an expert recruiter. Compare ... at: skills/job-description.txt
         Run the scoring algorithm: skills/scoring_algorithm.py
         Execute: python3 skills/scoring_algorithm.py '<resume>' '<jd>'
         Use [Candidate Lookup: candidate_lookup_tool-uuid-1]
         ..."
      with transitive tools:
        candidate_lookup  (direct, cred-hr-api)
  model: sees the text; because there is no VM in Flowise, either:
    (a) calls exec_skill_code({ nodeId: 'n-scorer', args: [resume, jd] })
        → E2B sandbox returns { technical_fit: 7.5, ... }
    (b) or synthesizes the scoring itself when no sandbox is configured
  model: tool_call('candidate_lookup', { ... })     # policy-allowed
  model: final answer
```

Agent flow is identical conceptually to Dify's. The differences are:

-   No sandbox bash loop; we expose purposeful helper tools (`read_skill_asset`,
    `exec_skill_code`) instead.
-   Tool access policy is enforced at init (filtered tool array) rather than at every
    tool invocation by a gatekeeper.

---

## 9. REST API

All under `/api/v1/skills-v2`. Legacy `/api/v1/skill-folders/**` is untouched. The API is
split into **skill-level** (CRUD on the row + `fileTree`) and **node-level** (CRUD on
individual tree nodes' content).

### 9.1 Skill-level

| Method   | Path                                                  | Purpose                                           |
| -------- | ----------------------------------------------------- | ------------------------------------------------- |
| `POST`   | `/workspaces/:wsId/skills`                            | Create a skill (row + empty `fileTree`).          |
| `GET`    | `/workspaces/:wsId/skills`                            | List skills (paginated).                          |
| `GET`    | `/workspaces/:wsId/skills/:skillId`                   | Get the row, including the full `fileTree`.       |
| `PUT`    | `/workspaces/:wsId/skills/:skillId`                   | Update `name`, `description`, `iconSrc`, `color`. |
| `DELETE` | `/workspaces/:wsId/skills/:skillId`                   | Delete row + its whole storage prefix.            |
| `POST`   | `/workspaces/:wsId/skills/:skillId/publish`           | Run `compileAll` for this skill; update pointer.  |
| `GET`    | `/workspaces/:wsId/skills/:skillId/bundle`            | Return the published `SkillBundle` JSON.          |
| `GET`    | `/workspaces/:wsId/skills/:skillId/bundle?mode=draft` | Compile on demand (dry-run; no pointer update).   |
| `POST`   | `/workspaces/:wsId/skills/:skillId/validate`          | Lint placeholders across all nodes.               |
| `GET`    | `/workspaces/:wsId/skills/:skillId/dependencies`      | Aggregate tool/file deps across selected nodes.   |

### 9.2 Node-level (inside one skill's tree)

Tree mutations are transactional: the endpoint updates `fileTree`, writes/deletes the
node payload in storage, and recomputes `contentDigest` in a single service call.

| Method   | Path                                                           | Purpose                                                                                                     |
| -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST`   | `/workspaces/:wsId/skills/:skillId/nodes`                      | Create a file or folder node. Body: `{parentId, name, node_type, extension, order?}`. Returns new `nodeId`. |
| `GET`    | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId`              | Return node metadata + content (for file nodes).                                                            |
| `PUT`    | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId`              | Update content / metadata / rename / reorder / move (`parentId`).                                           |
| `DELETE` | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId`              | Delete node (folders must be empty or `?recursive=true`).                                                   |
| `POST`   | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId/upload`       | Multipart upload for binary content.                                                                        |
| `GET`    | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId/download`     | Stream / signed URL for raw bytes.                                                                          |
| `GET`    | `/workspaces/:wsId/skills/:skillId/nodes/:nodeId/dependencies` | Per-node direct + transitive deps.                                                                          |

### 9.3 Controller / service split

Mirrors Flowise conventions:

-   `controllers/skills-v2/index.ts` → HTTP layer only.
-   `services/skills-v2/` → business logic.
    -   `SkillV2Service.ts` — skill-row CRUD.
    -   `SkillTreeService.ts` — node-level CRUD (updates `fileTree` + storage atomically).
    -   `SkillV2Storage.ts` — node payload read/write over `IStorageProvider`.
    -   `SkillV2Compiler.ts` — stateless compilation.
    -   `SkillBundleManager.ts` — memory + Redis + storage cache (per-skill).
    -   `ToolAccessPolicy.ts` — derive from bundle.

---

## 10. Directory Layout & New Files

```
docs/skill-v2/
├── PLAN.md                          # this document
├── placeholder-grammar.md           # (TODO in later milestone) EBNF + fixtures
├── recruiting-walkthrough.md        # (TODO) Flowise-specific version of skill_invocation.md

packages/server/src/
├── database/entities/
│   └── SkillV2.ts                   # the ONLY new entity
├── database/migrations/
│   ├── postgres/<ts>-CreateSkillV2.ts
│   ├── mysql/<ts>-CreateSkillV2.ts
│   ├── mariadb/<ts>-CreateSkillV2.ts
│   └── sqlite/<ts>-CreateSkillV2.ts
├── controllers/skills-v2/
│   └── index.ts
├── routes/skills-v2/
│   └── index.ts
└── services/skills-v2/
    ├── index.ts
    ├── entities.ts                  # TS interfaces: SkillFileTree, SkillTreeNode,
    │                                # SkillBundle, SkillBundleEntry, …
    ├── SkillV2Service.ts            # skill-row CRUD
    ├── SkillTreeService.ts          # fileTree + node-payload mutations
    ├── SkillV2Storage.ts            # object-storage wrapper
    ├── compiler/
    │   ├── SkillV2Compiler.ts
    │   ├── placeholderParser.ts
    │   ├── toolResolver.ts
    │   ├── fileResolver.ts          # relative-path computation over SkillFileTree
    │   └── transitivePropagator.ts
    ├── bundle/
    │   ├── SkillBundleManager.ts    # load/save/cache (per-skill)
    │   └── ToolAccessPolicy.ts
    └── utils/
        ├── digest.ts                # sha256 helpers
        ├── tree.ts                  # walk / reparent / reorder / detect-cycles
        └── slug.ts

packages/components/nodes/tools/SkillV2Tool/
├── SkillV2Tool.ts                   # INode wrapper (parallel to CustomTool.ts)
├── core.ts                          # DynamicStructuredTool subclass w/ callStrategy
├── callStrategy.ts
├── helperTools.ts                   # read_skill_asset / exec_skill_code / get_skill_asset_url
└── README.md

packages/ui/src/views/skills-v2/     # see §11
```

Nothing in the list above touches v1 modules.

---

## 11. UI

Replace the v1 Tools → Skills tab surface with a new one, hidden behind a feature flag
(`SKILL_V2_ENABLED`) until stable. Components:

-   `SkillV2Workspace.jsx` — main page: list + tree view of skills, filter by kind, path
    breadcrumb navigation (path is just a `/`-delimited string).
-   `SkillV2Editor.jsx` — drawer with:
    -   **Source tab**: TipTap markdown editor + metadata editor (tool UUIDs, credentials).
    -   **Preview tab**: client-side `compile_one` on draft (calls
        `GET /bundle?mode=draft`) to show resolved output live.
    -   **Dependencies tab**: direct + transitive tool/file graph (reuses ReactFlow as v1
        did but with a different data adapter).
-   `SkillV2UploadDialog.jsx` — upload binary / code / data assets.
-   `SkillV2PublishBar.jsx` — show current bundleId, last publish time, changed-skill count,
    "Publish" button. Wired to `POST /publish`.
-   `SkillV2ToolNode.jsx` — the node-palette card for `SkillV2Tool`, standard Flowise.

Legacy UI remains — we do not touch `SkillFolderDialog.jsx`, `SkillFolderEditorDialog.jsx`,
`SkillNodeGraph.jsx`.

---

## 12. Security

Inherits Flowise's standard protections plus Dify-style constraints:

-   **Workspace scoping** — every query is filtered on `workspaceId`; storage keys include
    `workspaceId` to prevent cross-tenant reads.
-   **Placeholder parser** is strictly regex-based with capped iteration counts; no
    `eval`. `SecureZodSchemaParser` continues to be the only path that evaluates strings.
-   **`exec_skill_code`** only enabled when `E2B_APIKEY` is set; runs in a disposable E2B
    micro-VM exactly like `CustomTool`'s code path. The code file content is streamed into
    the VM — we never execute it in the Flowise server process.
-   **`read_skill_asset`** size-caps files at `MAX_SKILL_ASSET_INLINE` (default 1 MiB).
    Larger files return a signed URL.
-   **Signed URLs** issued with `SKILL_V2_SIGNED_URL_TTL_SEC` (default 300s).
-   **Content digest** stored on the DB row — tampering with storage-only content will
    fail digest verification on load and surface as a `SKILL_V2_CONTENT_TAMPERED` error.
-   **Bundle load** verifies `schemaVersion`; unknown versions are refused.

---

## 13. Phased Rollout

Each phase is independently shippable and produces a usable artifact.

### Phase A — Entity + Storage + Tree CRUD (no compiler)

-   [x] Add `SkillV2` entity + migrations for all four DB engines.
-   [x] `SkillV2Storage` with `put/get/delete` over `IStorageProvider`.
-   [x] `SkillTreeService` for `fileTree` mutations (create/rename/move/delete nodes,
        invariant checks, digest recomputation).
-   [x] REST: skill-level CRUD + node-level CRUD + raw upload/download.
-   [ ] UI: `SkillV2Library` (skill list) + `SkillV2Editor` (tree view + source tab).
-   **Outcome**: users can author skill trees and upload assets; no runtime yet.

### Phase B — Compiler (batch + single)

-   [x] `placeholderParser.ts` (tests deferred to the fixture phase).
-   [x] `SkillV2Compiler.compileAll` over one skill's tree with transitive fixed-point.
-   [x] `SkillV2Compiler.compileOne` for anonymous prompts.
-   [x] REST: `skills/:id/publish`, `skills/:id/bundle`, `skills/:id/nodes/:n/dependencies`.
-   [ ] UI: Preview tab (calls draft bundle), Dependencies tab, Publish bar.
-   **Outcome**: bundles produced and readable; still no chatflow integration.

### Phase C — `SkillV2Tool` node

-   [ ] `SkillV2Tool.ts` + `core.ts` + `callStrategy.ts`.
-   [ ] `resolved_markdown` return format.
-   [x] `SkillBundleManager` with memory cache (Redis deferred — see §15.8 below).
-   **Outcome**: agents can consume skills; feature reaches parity with v1
    `SimpleCallStrategy`.

### Phase D — Helper tools + policy

-   [ ] `read_skill_asset`, `exec_skill_code` (E2B), `get_skill_asset_url`.
-   [x] `ToolAccessPolicy` derivation (the `autoInjectDeps` wiring happens in the node).
-   **Outcome**: v2 surpasses v1 — the agent can actually execute code/data skills in a
    sandbox when E2B is configured, and tool authorization is enforced.

### Phase E — Structured output + advanced UX

-   [ ] `structured` return format (`__skill_v2` envelope) — used by a future agent-layer
        integration to enforce policy on non-skill tools too.
-   [ ] UI polish: dependency graph with reverse edges, inline conflict detection
        (broken placeholder, duplicate sibling `name`, cycle warning).

### Phase F — Deprecation of v1 (not in this plan)

Left as a follow-up. The migration tool is scoped separately.

---

## 14. Testing Strategy (SKIPPED FOR NOW)

-   **Unit tests** — `SkillV2Compiler` gets the bulk of the coverage. Port Dify's
    `test_skill_compiler.py` table-driven cases to Jest (we already saw their test
    pattern in `skill_invocation.md` §Step 3).
-   **Fixture corpus** at `docs/skill-v2/fixtures/` (future task):
    -   Transitive deps (A→B→C).
    -   Cycles (A→B→A) — must still converge.
    -   Tool groups with disabled entries.
    -   Non-skill file references.
    -   Unicode `§` escapes.
-   **Integration** — `services/skills-v2/__tests__/compiler.spec.ts` drives the full
    `compileAll` → `compileOne` path against fixture payloads.
-   **E2E** — Cypress flow: create workspace → author 3 skills referencing each other →
    publish → run a chatflow with `SkillV2Tool` → assert the agent receives the resolved
    text + tool list.
-   **Contract tests** — Snapshot of `bundle.json` shape (one per schema version) to
    protect downstream consumers.

---

## 15. Open Questions / Design Decisions

These are explicit gaps the implementer must resolve with the product owner:

1. **Cross-skill placeholder references?**
   v2 scopes placeholders to one skill's tree, matching Dify. If users want one skill
   to reference a node inside a different skill, we would need a namespaced placeholder
   like `{{skill.<skillId>:<nodeId>}}` plus cross-skill bundle merging at runtime.
   Recommended for a future milestone once the single-skill model is validated.

2. **Do we need an auto-rebuild on save, or only explicit publish?**
   Dify only has publish. Plan assumes we support **draft bundle on demand** (hot path
   `bundle?mode=draft` for UI preview) plus explicit publish for runtime. This is
   cheap: hashing + caching make draft builds essentially O(changed file count).

3. **Sandbox strategy for code files when E2B is not configured?**
   Options: (a) fall back to Flowise's local `NodeVM` — risky for arbitrary user Python
   (no python runtime in vm2); (b) refuse execution; (c) emit the path only. Plan
   defaults to (c). Open to revisit.

4. **Multimodal binary files — any native support for feeding a PDF to the LLM?**
   v2 says no, mirroring Dify's `skill_invocation.md` §"Path A vs Path B" distinction.
   Users who want a PDF fed to the model must use Flowise's existing Document Loader /
   file-upload machinery — skills v2 is strictly for prompt composition and text
   retrieval.

5. **Does `autoInjectDeps=true` need to modify the chatflow's tool array, or only warn?**
   Technically the node doesn't own the tool array; the agent node does. Two
   implementation options:
   (a) `SkillV2Tool` writes the policy into `flowConfig` and Flowise's agent wrapper
   reads it (requires a tiny agent-wrapper change).
   (b) `SkillV2Tool` only logs a warning when deps are missing.
   Plan recommends (b) for Phase D, (a) for Phase E.

6. **Compiler schema version migration** — when we add a new placeholder form in
   future, how do we migrate existing bundles? Plan punts to "republish regenerates the
   bundle under the new schema; old bundles become unreadable". Should be fine for
   self-hosted Flowise where republish is fast; SaaS multi-tenant might need a bulk
   rebuild job.

7. **Do we back-port the v1 graph visualization** to v2's dependency view, or invent a
   new UI? Plan assumes we borrow the ReactFlow node/edge model but with a different
   adapter — the legacy `SkillNodeGraph.jsx` stays untouched, a new
   `SkillV2DepsGraph.jsx` is written.

---

## Appendix A — End-to-End Example (Flowise-flavored)

Reproducing the recruiting skill chain from `docs/dify_project/skill_invocation.md` on
Flowise v2. All five files live inside **one** skill named `recruiting`.

**Create the skill + file nodes**

```
POST /api/v1/skills-v2/workspaces/W/skills
  { "name": "recruiting", "description": "Hiring workflow skill pack" }
→ 201 { "skillId": "S" }

POST /.../skills/S/nodes  { "parentId": null, "name": "resume-screener.md",    "node_type": "file", "extension": "md",  "order": 0 }  → nodeId n-screen
POST /.../skills/S/nodes  { "parentId": null, "name": "interview-questions.md","node_type": "file", "extension": "md",  "order": 1 }  → nodeId n-interview
POST /.../skills/S/nodes  { "parentId": null, "name": "email-drafter.md",      "node_type": "file", "extension": "md",  "order": 2 }  → nodeId n-email
POST /.../skills/S/nodes  { "parentId": null, "name": "job-description.txt",   "node_type": "file", "extension": "txt", "order": 3 }  → nodeId n-jd
POST /.../skills/S/nodes  { "parentId": null, "name": "scoring_algorithm.py",  "node_type": "file", "extension": "py",  "order": 4 }  → nodeId n-scorer

PUT /.../skills/S/nodes/n-screen
  { "content": "# Resume Screening Skill\nYou are ... at {{skill.n-jd}} ...\n{{tool.custom.candidate_lookup.tool-uuid-1}} ...",
    "metadata": { "tools": { "tool-uuid-1": {
        "type": "custom", "provider": "hr_platform",
        "toolName": "candidate_lookup", "credentialId": "cred-hr-api",
        "enabled": true } } } }

# …similar PUTs for n-interview, n-email, n-jd (no metadata), n-scorer (no metadata).
```

The final `fileTree` JSON persisted on the `SkillV2` row:

```json
{
    "nodes": [
        {
            "id": "n-screen",
            "node_type": "file",
            "name": "resume-screener.md",
            "parent_id": null,
            "order": 0,
            "extension": "md",
            "size": 742
        },
        {
            "id": "n-interview",
            "node_type": "file",
            "name": "interview-questions.md",
            "parent_id": null,
            "order": 1,
            "extension": "md",
            "size": 486
        },
        { "id": "n-email", "node_type": "file", "name": "email-drafter.md", "parent_id": null, "order": 2, "extension": "md", "size": 612 },
        {
            "id": "n-jd",
            "node_type": "file",
            "name": "job-description.txt",
            "parent_id": null,
            "order": 3,
            "extension": "txt",
            "size": 1843
        },
        {
            "id": "n-scorer",
            "node_type": "file",
            "name": "scoring_algorithm.py",
            "parent_id": null,
            "order": 4,
            "extension": "py",
            "size": 920
        }
    ]
}
```

**Publish**

```
POST /api/v1/skills-v2/workspaces/W/skills/S/publish
→ 202 { "bundleId": "abc123", "nodeCount": 5, "skillNodeCount": 3, "transitiveEdges": 3 }
```

**Inspect dependencies for a single node**

```
GET /api/v1/skills-v2/workspaces/W/skills/S/nodes/n-email/dependencies
→ {
    "direct":     { "tools": ["comms.send_email"],
                    "files": ["n-screen", "n-interview"] },
    "transitive": { "tools": ["comms.send_email", "hr_platform.candidate_lookup",
                              "sandbox.python"],
                    "files": ["n-screen", "n-interview", "n-jd"] }
  }
```

Exactly reproduces the "Final SkillBundle entries" table in `skill_invocation.md` §Step 3
(the Dify `skill-email` row).

**Runtime**

```
chatflow "recruiter-agent":
  [SkillV2Tool: skillId=S, entryNodeIds=[n-screen, n-interview, n-email], autoInjectDeps=true]
  → exposes tools:
      resume_screener, interview_questions, email_drafter,
      read_skill_asset, exec_skill_code
  → policy (aggregated): candidate_lookup, python, send_email

agent loop:
  user: "Screen this resume: ..."
  model: tool_call(resume_screener, { query: "..." })
    → SkillV2Tool → compileOne(anon "{{skill.n-screen}}")
    → returns resolved markdown (job description path, scoring script path,
      candidate_lookup label)
  model: tool_call(exec_skill_code, { nodeId: "n-scorer",
                                      args: ["<resume>", "<jd>"] })
    → E2B runs scoring_algorithm.py, returns { technical_fit: 7.5, ... }
  model: tool_call(candidate_lookup, { id: "..." })     # policy-allowed
  model: final answer
```

The invocation pattern is equivalent to Dify's, adapted to Flowise's agent-and-tool runtime.

---

## Appendix B — Backend Implementation Status

First backend cut landed. The following files exist and typecheck cleanly:

### Database layer

-   `packages/server/src/database/entities/SkillV2.ts` — the single new entity.
-   `packages/server/src/database/entities/index.ts` — wired `SkillV2` into the entity map.
-   `packages/server/src/database/migrations/{postgres,mysql,mariadb,sqlite}/1771000000000-AddSkillV2.ts`
    — identical `skill_v2` table across dialects (uuid PK, `workspaceId` indexed,
    `fileTree` text/longtext, `contentDigest` varchar(64), `publishedBundleId` nullable).
-   Each dialect's `index.ts` now registers `AddSkillV21771000000000`.
-   `packages/server/src/Interface.ts` — added `ISkillV2`.

### Service layer (`packages/server/src/services/skills-v2/`)

-   `entities.ts` — shared TS types: `SkillFileTree`, `SkillTreeNode`, `SkillDocument`,
    `SkillMetadata`, `SkillBundle`, `SkillBundleEntry`, `ToolDependencies`, DTOs.
-   `utils/digest.ts` — `sha256` + `canonicalJson` (sorted-key JSON) for stable hashes.
-   `utils/slug.ts` — `slugify` / `stripExtension` for tool-name derivation.
-   `utils/tree.ts` — classification, indexing, path computation (relative + absolute),
    cycle detection, descendant walks, tree (de)serialization, mime guessing.
-   `SkillV2Storage.ts` — thin wrapper over `flowise-components`' storage utils for
    per-node JSON/binary payloads, per-node meta sidecars, bundle + resolved-md artifacts,
    and the `published.json` pointer. Uses the layout described in §4.
-   `compiler/placeholderParser.ts` — `{{…}}` scanner with classification into
    `tool | skill | passthrough`, plus tool-group detector, plus code-span skipper
    (fenced ` ``` ` / inline backticks). Match count capped at 10k.
-   `compiler/toolResolver.ts` — `{{tool.…}}` → `[Pretty Name: toolName_uuid]` labels;
    emits canonical `ToolDependency` + per-invocation `ToolReference`.
-   `compiler/fileResolver.ts` — `{{skill.<nodeId>}}` → relative path from caller's
    folder, or `skills/<path>` for anonymous runtime prompts.
-   `compiler/transitivePropagator.ts` — monotonic fixed-point merge of tool + file
    deps over skill→skill edges.
-   `compiler/SkillV2Compiler.ts` — `compileAll` (4 phases: parse, direct-compile,
    propagate, emit) + `compileOne` (runtime anon-prompt resolution). Broken references
    become `[SKILL_V2_BROKEN_REFERENCE]`. Schema version `1`.
-   `bundle/SkillBundleManager.ts` — two-tier cache (process memory LRU → object
    storage). Redis layer deferred — see §15.8.
-   `bundle/ToolAccessPolicy.ts` — `derivePolicy(bundle, nodeIds)` + `isAllowed`.
-   `SkillV2Service.ts` — row CRUD, publish pipeline, `compileAll`, draft/published
    bundle loaders, per-node dependency reporter.
-   `SkillTreeService.ts` — node CRUD + payload mutations; validates invariants,
    cycles, folder/file constraints; wraps `SkillV2Storage` + persists `fileTree`
    updates atomically (service-level transaction).
-   `index.ts` — barrel used by controllers.

### HTTP layer

-   `packages/server/src/controllers/skills-v2/index.ts` — one handler per route.
    Every handler asserts `req.user.activeWorkspaceId === req.params.wsId` and funnels
    errors through `InternalFlowiseError`.
-   `packages/server/src/routes/skills-v2/index.ts` — all routes under
    `/api/v1/skills-v2/workspaces/:wsId/skills/**`, guarded with existing `tools:*`
    RBAC buckets (will migrate to a dedicated `skills:*` bucket when v1 is retired).
-   `packages/server/src/routes/index.ts` — registers the new router at `/skills-v2`.

### What is NOT in this cut

-   No `SkillV2Tool` component — planned for Phase C together with the helper tools
    (`read_skill_asset`, `exec_skill_code`, `get_skill_asset_url`).
-   No UI — planned for Phase B/C once the tool node lands.
-   No tests — deferred per §14 (to be added alongside the fixture corpus).
-   No Redis integration in the bundle manager — Flowise core does not expose a
    shared Redis client today. The memory cache satisfies single-process correctness;
    multi-process caching is a future task (add Redis once Flowise core exposes one).
