# Skill Feature Architecture

This document describes the end-to-end architecture of the **Skill** feature in Flowise.
A *Skill* is an authoring primitive — a self-contained app composed of
markdown prompts, code, data and binary assets — that can be published once and then
invoked from any chatflow as one or more LangChain tools.

The implementation spans two packages:

| Package                    | Path                                                  | Responsibility                                                                                                                                  |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server`          | `src/services/skills/`                                | Authoring (CRUD on the file tree, payload storage), compilation, bundle storage + cache, REST controllers and routes.                          |
| `packages/components`      | `nodes/tools/Skill/`                                  | The `Skill` node that runs inside a chatflow. Loads a published bundle, exposes one LangChain tool per selected markdown file, optionally registers a sandbox bash tool, and resolves referenced custom tools to live `DynamicStructuredTool` instances. |

The design follows three hard constraints:

1. **One database entity** — a single `skill` table holds only pointers + lightweight
   metadata. Every byte of authored content lives in object storage (the same
   `IStorageProvider` chain that already backs file uploads).
2. **JSON-first content** — both the persisted file tree (`Skill.fileTree`) and every
   per-node payload (`{nodeId}.json`) are JSON. The compiled artefact (`bundle.json`) is
   also JSON, content-addressed by SHA-256.
3. **Build-once, read-many runtime** — the runtime node never re-parses placeholders or
   walks the tree. It loads the immutable `SkillBundle` produced at publish time and
   wraps each entry in a `Tool`.

---

## 1. High-level Overview

```
                               ┌──────────────────────────────────────┐
                               │          Authoring (Server)          │
                               │                                      │
   REST  /api/v1/skills/**     │  ┌──────────────────────────────┐    │
   ────────────────────────────┼─▶│  controllers/skills           │    │
                               │  └──────────────┬───────────────┘    │
                               │                 ▼                    │
                               │  ┌─────────────────────────────────┐ │
                               │  │ services/skills/                │ │
                               │  │  ├─ SkillService    (row CRUD)  │ │
                               │  │  ├─ SkillTreeService (nodes)    │ │
                               │  │  ├─ SkillStorage  (blob I/O)    │ │
                               │  │  ├─ compiler/SkillCompiler      │ │
                               │  │  └─ bundle/SkillBundleManager   │ │
                               │  └────────┬───────────────┬────────┘ │
                               │           │               │          │
                               │   DB row  │               │  bundles │
                               │  (Skill)  ▼               ▼          │
                               │   ┌──────────┐   ┌────────────────┐  │
                               │   │  RDBMS   │   │ IStorageProvider│ │
                               │   └──────────┘   │  (Local/S3/GCS/ │ │
                               │                  │   Azure Blob)   │ │
                               │                  └────────────────┘  │
                               └──────────────────────────────────────┘
                                                 ▲
                                                 │ readBlob (bundle.json + node bytes)
                                                 │
                               ┌─────────────────┴────────────────────┐
                               │     Runtime (Components / Chatflow)  │
                               │                                      │
   ┌────────────┐              │  ┌──────────────────────────────┐    │
   │ LLM / Agent│ ◀──tools─────┼──│  nodes/tools/Skill/Skill.ts  │    │
   └────────────┘              │  └──────────────┬───────────────┘    │
                               │                 ▼                    │
                               │  ┌─────────────────────────────────┐ │
                               │  │ bundleLoader  → SkillBundle    │  │
                               │  │ SkillFileTool (one per .md)    │  │
                               │  │ customToolFactory              │  │
                               │  │   → DynamicStructuredTool[]    │  │
                               │  │ sandbox/ (optional E2B path)   │  │
                               │  │   ├─ SandboxManifest           │  │
                               │  │   ├─ SandboxSession (lazy VM)  │  │
                               │  │   └─ SandboxBashTool           │  │
                               │  └─────────────────────────────────┘ │
                               └──────────────────────────────────────┘
```

The two halves are coupled only through the storage layer: the server writes a
`SkillBundle` (and per-node assets) to a deterministic key, and the runtime node reads
from the same key. There is no in-process call between them.

---

## 2. Data Model

### 2.1 The `Skill` entity

Defined in `packages/server/src/database/entities/Skill.ts`:

```13:53:packages/server/src/database/entities/Skill.ts
@Entity({ name: 'skill' })
export class Skill implements ISkill {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'text' })
    workspaceId: string

    @Column({ type: 'varchar', length: 255 })
    name: string

    @Column({ type: 'text', nullable: true })
    description?: string | null

    @Column({ type: 'varchar', length: 255, nullable: true })
    iconSrc?: string | null

    @Column({ type: 'varchar', length: 16, nullable: true })
    color?: string | null

    @Column({ type: 'text' })
    fileTree: string

    @Column({ type: 'varchar', length: 64 })
    contentDigest: string

    @Column({ type: 'varchar', length: 64, nullable: true })
    publishedBundleId?: string | null

    @CreateDateColumn() createdDate: Date
    @UpdateDateColumn() updatedDate: Date
}
```

| Column              | Purpose                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceId`       | Tenancy boundary. Every query and storage key includes it.                                                                                           |
| `name`              | Display name; unique per workspace (enforced in `SkillService.createSkill`/`updateSkill`).                                                           |
| `iconSrc`, `color`  | UI metadata for the skill library.                                                                                                                   |
| `fileTree`          | The whole file/folder tree as a JSON string (shape: `SkillFileTree`).                                                                                |
| `contentDigest`     | `sha256(canonicalJson({ fileTree, sortedNodeDigests }))` — invalidates derived caches whenever any byte changes.                                     |
| `publishedBundleId` | Pointer to the latest `SkillBundle` artefact in storage. Null until the first publish.                                                               |

There is intentionally **no row per file** and **no graph/edge table**. Both are derived
artefacts living in object storage.

### 2.2 The file tree (`SkillFileTree`)

`Skill.fileTree` deserializes into the shape declared in
`packages/server/src/services/skills/entities.ts`:

```12:26:packages/server/src/services/skills/entities.ts
export type SkillNodeType = 'file' | 'folder'

export interface SkillTreeNode {
    id: string
    node_type: SkillNodeType
    name: string
    parent_id: string | null
    order: number
    extension: string
    size: number
}

export interface SkillFileTree {
    nodes: SkillTreeNode[]
}
```

Key properties:

- **UUID is the placeholder identifier.** `{{skill.<nodeId>}}` references a tree node by
  its UUID, so renaming the file is a no-op for callers.
- **Folders are tree nodes too** (`node_type: 'folder'`, `extension: ''`, `size: 0`); no
  separate folder table is needed.
- **Path, kind, mime** are *derived* by `utils/tree.ts` (`computePath`, `classifyKind`,
  `guessMime`) from the tree shape and the file extension. They are never persisted on
  the row.
- **Serialization is canonicalized** in `serializeFileTree` (sorted by `parent_id`,
  `order`, `name`) so `contentDigest` is stable across writes that don't change semantics.

### 2.3 Kind classification

`classifyKind(extension)` in `utils/tree.ts` buckets every file node into one of four
*skill kinds* used by the compiler and the runtime:

| Kind     | Extensions (examples)                                  | Meaning                                                                                              |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `skill`  | `.md`, `.markdown`                                     | The invocable entry points. Their content is parsed for placeholders at compile time.                |
| `code`   | `.py`, `.js`, `.ts`, `.sh`, `.rb`, `.go`, …            | Source code — passed verbatim to the sandbox VM at runtime.                                          |
| `data`   | `.txt`, `.json`, `.csv`, `.yaml`, `.html`, `.log`, …   | Text data — `cat`-able inside the sandbox. Extensionless files default to this bucket.               |
| `binary` | everything else (`.pdf`, `.png`, `.jpeg`, `.zip`, …)   | Opaque bytes. Stored as `.bin`; surfaced to the sandbox as raw files.                                |

### 2.4 Per-node payload metadata

Skill-kind nodes carry a small `SkillMetadata` block alongside their markdown:

```48:68:packages/server/src/services/skills/entities.ts
export type ToolReferenceType = 'custom' | 'mcp' | 'http' | 'builtin'

export interface ToolReference {
    type: ToolReferenceType
    provider: string
    toolName: string
    uuid: string
    credentialId?: string
    enabled: boolean
    config?: Record<string, unknown>
}

export interface FileReference {
    source: 'app'
    nodeId: string
}

export interface SkillMetadata {
    tools: Record<string /* uuid */, ToolReference>
    files?: FileReference[]
}
```

`metadata.tools` maps the `<uuid>` segment of every `{{tool.<provider>.<toolName>.<uuid>}}`
placeholder back to its concrete reference (credential id, enabled flag, optional config).
This is what lets the compiler turn an opaque placeholder into a labelled, gated tool
dependency without re-reading the chatflow's tool array.

---

## 3. Storage Layout

`SkillStorage` (`packages/server/src/services/skills/SkillStorage.ts`) wraps Flowise's
`IStorageProvider` so every read is a single GET and every write is a single PUT (plus a
sidecar). Cloud-backend cost is therefore O(1) per node mutation.

```
skills/
└── {workspaceId}/
    └── {skillId}/
        ├── nodes/
        │   ├── {nodeId}.json          # md / data / code: { content, metadata? }
        │   ├── {nodeId}.bin           # binary blobs
        │   └── {nodeId}.meta.json     # { digest, size, mime }
        ├── artifacts/
        │   └── {bundleId}/
        │       ├── bundle.json        # SkillBundle (§5.5)
        │       └── resolved/
        │           └── {nodeId}.md    # per-skill resolved markdown sidecar
        └── published.json             # { currentBundleId, publishedAt }
```

Notable properties:

- **`bundleId` is content-addressed** — `sha256(canonicalJson({ schemaVersion, fileTree,
  sortedNodeDigests }))`. Republishing an unchanged skill mints the same id, so a no-op
  publish is detectable.
- **Two cleanups, never one.** `publish` writes the new bundle artefacts *first*, swings
  the `published.json` pointer + DB column, and only then garbage-collects the previous
  `artifacts/{previousBundleId}/` directory. If anything fails midway, the previous
  bundle remains valid and the DB pointer keeps working.
- **The `resolved/` sidecar** is a debugging aid; the runtime never reads it. Each
  skill-kind entry's compiled markdown is also embedded inside `bundle.json` itself.
- **Idempotent deletes.** `deleteBlobFromStorage` is a no-op on missing files, so
  partial-failure recovery never has to reason about half-deleted prefixes.

---

## 4. REST Surface

Routes are mounted under `/api/v1/skills` (see
`packages/server/src/routes/skills/index.ts`) and guarded by Flowise's existing `tools:*`
RBAC buckets — Skills currently piggy-back on the same bucket as the legacy Tools tab.

### 4.1 Skill-level

| Method   | Path                              | Purpose                                                                                                  |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST`   | `/`                               | Create a skill (row + empty `fileTree`).                                                                 |
| `GET`    | `/`                               | Paginated list shaped by `shapeForList` (file/node counts, no payloads).                                 |
| `GET`    | `/:skillId`                       | Fetch the row, including the full `fileTree` JSON.                                                       |
| `PUT`    | `/:skillId`                       | Update `name` / `description` / `iconSrc` / `color`.                                                     |
| `DELETE` | `/:skillId`                       | Delete row, every blob under `skills/{wsId}/{skillId}/`, and the cached bundle entries.                  |
| `POST`   | `/:skillId/publish`               | `compileAll` → write `bundle.json` + sidecars → flip `published.json` → update `Skill.publishedBundleId`. |
| `GET`    | `/:skillId/bundle?mode=published` | Return the published `SkillBundle` (or `draft` to compile on demand without persisting).                 |
| `POST`   | `/:skillId/validate`              | Draft-compile and count `[SKILL_V2_BROKEN_REFERENCE]` markers per node.                                  |
| `GET`    | `/:skillId/dependencies`          | Aggregated direct + transitive tool/file deps for the whole skill.                                       |
| `GET`    | `/:skillId/graph?mode=…`          | Slim DTO of nodes + directional edges suitable for ReactFlow.                                            |

### 4.2 Node-level (inside one skill's tree)

Tree mutations are atomic at the service level: every endpoint updates `fileTree`,
writes/deletes the per-node payload, and recomputes `contentDigest` in one call to
`SkillService.saveFileTree`.

| Method   | Path                                         | Purpose                                                                                                       |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/:skillId/nodes`                            | Create a file or folder. Body: `{ parentId, name, node_type, extension?, content?, metadata? }`.              |
| `GET`    | `/:skillId/nodes/:nodeId`                    | Return node + meta + content (or `kind` for binaries).                                                        |
| `PUT`    | `/:skillId/nodes/:nodeId`                    | Rename / move / reorder; update content + metadata for non-binary kinds.                                      |
| `DELETE` | `/:skillId/nodes/:nodeId`                    | Delete node; folders require `?recursive=true` if non-empty.                                                  |
| `POST`   | `/:skillId/nodes/:nodeId/upload`             | Multer multipart upload (or base64 body) for binary content.                                                  |
| `GET`    | `/:skillId/nodes/:nodeId/download`           | Stream raw bytes (text or binary) with proper `Content-Disposition`.                                          |
| `GET`    | `/:skillId/nodes/:nodeId/dependencies`       | Per-node direct + transitive deps from a fresh draft compile.                                                 |

Every controller asserts `req.user.activeWorkspaceId` exists and the URL is scoped
through the user's workspace, preventing cross-tenant reads.

---

## 5. Compilation Pipeline

`SkillCompiler` (`packages/server/src/services/skills/compiler/skillCompiler.ts`) is
**pure TypeScript** — no I/O, no caching, no globals. It accepts a `CompileInput`
(file tree + every file node's payload) and returns a `SkillBundle`.

### 5.1 Placeholder grammar

Two namespaces are added on top of Flowise's existing `{{…}}` grammar:

| Token                                       | Resolved at  | Output                                                                  |
| ------------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `{{tool.<provider>.<toolName>.<uuid>}}`     | compile time | `[Pretty Name: provider.toolName.uuid]` label                           |
| `{{skill.<nodeId>}}`                        | compile time | relative path (`./sub.md`, `../assets/foo.png`) or `skills/<absolute>`  |
| `[{{tool.…}}, {{tool.…}}]` (tool group)     | compile time | bracketed list with disabled tools stripped, or `''` if all disabled    |
| `{{question}}`, `{{$vars.x}}`, `{{$flow.…}}` | runtime      | left verbatim — handled by Flowise's `getVariableValue` at call time    |

`placeholderParser.ts` is strictly regex-based, caps matches at 10,000 per document, and
*skips placeholders inside fenced or inline code spans* so user examples in markdown
round-trip unchanged.

### 5.2 `compileAll(input)` — four phases

Implemented in `compiler/skillCompiler.ts`:

1. **Parse & graph.** For every `kind === 'skill'` node, scan placeholders and build the
   forward dependency graph `{ nodeId → [skill nodes it references] }`. Tool tokens are
   *not* graph edges.
2. **Direct compile.** For each skill node, replace placeholders independently:
   - `{{tool.…}}` becomes a label and contributes a `ToolDependency` + `ToolReference`
     to the entry.
   - Tool groups go through `isToolEnabled` first; disabled members are stripped.
   - `{{skill.<nodeId>}}` is resolved through `fileResolver.resolvePath` to a relative
     path. Unknown ids emit `[SKILL_BROKEN_REFERENCE]` (never silently empty).
   - All other `{{…}}` tokens are left untouched for the runtime resolver.
3. **Snapshot direct deps.** Before propagation mutates entries in place, each entry's
   `directTools` and `directFiles` arrays are copied so the graph builder (§6) can later
   distinguish "I declared this" from "I inherited this".
4. **Transitive propagation.** `transitivePropagator.propagate` runs a monotonic
   fixed-point merge of `tools.dependencies`, `tools.references` and `files.references`
   along skill→skill edges. A 10,000-iteration belt-and-braces guard catches pathological
   inputs even though the underlying lattice is finite.
5. **Emit.** `bundleId = sha256(canonicalJson({ schemaVersion, fileTree, sortedDigests }))`
   and the bundle is returned.

Cycles are tolerated — propagation is monotonic so it always converges; the resulting
bundle simply has both nodes seeing each other's deps.

### 5.3 `compileOne(prompt, bundle)` — runtime

Used today only by tooling/tests; the runtime node reads pre-compiled entries from the
published bundle directly. `compileOne` builds a slim entry for an *anonymous* prompt
(e.g. `{{skill.<X>}}`) by:

1. Pulling the transitive deps of every referenced skill from the pre-built bundle.
2. Resolving paths through a synthetic `fromNodeId === '__anon__'` so they always come
   out as absolute `skills/<path>` strings.
3. Returning the merged entry without writing anything.

### 5.4 Resolvers

| File                      | Job                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `placeholderParser.ts`    | Regex scanner that classifies tokens (`tool` / `skill` / `passthrough`) and detects tool groups + code spans.                                    |
| `toolResolver.ts`         | `{{tool.…}}` → label + `ToolDependency` + `ToolReference`, looking up uuid in the node's `metadata.tools`.                                       |
| `fileResolver.ts`         | `{{skill.<nodeId>}}` → relative path between two nodes (`computeRelativePath`) or absolute `skills/<path>` for anonymous callers.                |
| `transitivePropagator.ts` | Monotonic union of tools + file refs along skill→skill edges, idempotent and order-independent.                                                  |

### 5.5 The `SkillBundle` shape

```104:128:packages/server/src/services/skills/entities.ts
export interface SkillBundleEntry {
    nodeId: string
    kind: SkillKind
    name: string
    path: string
    source: { nodeId: string; contentDigest: string }
    tools: ToolDependencies
    files: AssetReferences
    content: string
    directTools?: ToolDependency[]
    directFiles?: FileReference[]
}

export interface SkillBundle {
    schemaVersion: 1
    bundleId: string
    workspaceId: string
    skillId: string
    builtAt: string
    entries: Record<string, SkillBundleEntry>
    dependencyGraph: Record<string, string[]>
    reverseGraph: Record<string, string[]>
}
```

- One entry per file node (folders are absent; they have no compiled artefact).
- For `kind === 'skill'`, `content` is the *resolved* markdown — runtime tokens still
  present, skill/tool tokens replaced.
- `directTools`/`directFiles` are optional so older bundles compiled before this field
  existed still load.
- The bundle is **immutable** — any mutation produces a new `bundleId`.

### 5.6 The publish pipeline

`SkillService.publish` glues the pieces together:

```197:237:packages/server/src/services/skills/SkillService.ts
const previousBundleId = row.publishedBundleId
const input = await loadCompileInput(row)
const compiler = new SkillCompiler()
const bundle = compiler.compileAll(input)

await SkillBundleManager.putBundle(bundle)

await Promise.all(
    Object.values(bundle.entries)
        .filter((entry) => entry.kind === 'skill')
        .map((entry) => SkillStorage.putResolvedMd(workspaceId, skillId, bundle.bundleId, entry.nodeId, entry.content))
)

const pointer: PublishedPointer = { currentBundleId: bundle.bundleId, publishedAt: bundle.builtAt }
await SkillStorage.putPublishedPointer(workspaceId, skillId, pointer)

await repo().update({ id: skillId, workspaceId }, { publishedBundleId: bundle.bundleId })

if (previousBundleId && previousBundleId !== bundle.bundleId) {
    await SkillStorage.deleteBundleArtifacts(workspaceId, skillId, previousBundleId)
    await SkillBundleManager.invalidateBundle(workspaceId, skillId, previousBundleId)
}
```

Two safety properties matter:

- **Reads are batched.** `loadCompileInput` issues `Promise.all` over every file's
  `getNodeMeta` + `getNodeJson` so a 200-file skill round-trips in parallel rather than
  serially against the cloud backend.
- **GC is last.** The previous bundle's artefacts are only deleted *after* the new
  bundle has been written, the pointer flipped, and the DB column updated. If any step
  throws, the old bundle remains a valid fallback.

---

## 6. Bundle Caching and Graph Derivation

### 6.1 `SkillBundleManager` — a multi-tier cache

Located at `packages/server/src/services/skills/bundle/SkillBundleManager.ts`. It layers
three tiers:

```
L1  in-process memory          — Keyv default in-memory store (always on)
L2  Redis                      — Keyv + KeyvRedis when REDIS_URL or REDIS_HOST is set
L3  object storage             — SkillStorage.{get,put}Bundle (source of truth)
```

Cache keys are `${workspaceId}:${skillId}:${bundleId}`. Because `bundleId` is
content-addressed and immutable, hits are always self-consistent across replicas — a
republish mints a fresh id that misses the cache by definition. `invalidateSkill` is an
intentional no-op for the same reason; stale entries simply expire via TTL.

If Redis is configured but initialization fails, the manager logs a warning and falls
back to memory-only — bundle reads are on the admin path, not the runtime hot path,
so a degraded state is preferable to a crash.

### 6.2 `SkillGraphBuilder` — DTO for the UI

`buildSkillGraph(bundle)` in `bundle/SkillGraphBuilder.ts` is a *pure* projection of a
`SkillBundle` into a slim `{ nodes[], edges[] }` graph for the React canvas:

- One node per file entry (skill / data / code / binary).
- One synthesized `tool` node per unique `(provider, toolName)` triple, deduped across
  the whole bundle.
- Directional edges (consumer → producer) labelled `file_direct`, `file_transitive`,
  `tool_direct`, `tool_transitive` — using `directTools`/`directFiles` from the entry to
  pick the right relation.
- Each entry carries a `brokenRefs` count from a regex pass over `[SKILL_BROKEN_REFERENCE]`
  markers so the UI can flag publish-blocking issues.

### 6.3 `ToolAccessPolicy` — authorization helper

`bundle/ToolAccessPolicy.ts` exposes `derivePolicy(bundle, nodeIds?)` and
`isAllowed(policy, tool)`. The policy is a flat `(type, provider, toolName)` set used
by `SkillTool` to advertise the allowed list ("You may also use: …") or, in a future
milestone, to filter the chatflow's tool array down to the intersection.

---

## 7. Runtime Node — `Skill_Tools`

The runtime entry point lives at
`packages/components/nodes/tools/Skill/Skill.ts`. It implements Flowise's `INode`
interface and returns an array of LangChain `Tool`s — one per selected markdown file,
plus optional companion tools.

### 7.1 UI inputs

| Input              | Type                | Notes                                                                                                                                                                                |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skillId`          | `asyncOptions`      | Workspace skill picker, populated by `loadMethods.listSkills`.                                                                                                                       |
| `skillFiles`       | `asyncMultiOptions` | Multi-select of markdown nodes inside the chosen skill. `loadMethods.listSkillFiles` peeks at the published bundle to surface YAML frontmatter (`name`, `description`) when present. |
| `enableBash`       | `boolean`           | Default on. When the server has `E2B_APIKEY` *and* `SKILL_ALLOW_EXEC` is not disabled, registers a companion `bash_<SkillName>` tool that materialises the reachable assets.         |
| `execTimeoutMs`    | `number`            | Per-call timeout for the bash tool, clamped against `SKILL_EXEC_TIMEOUT_MS` (default 15,000).                                                                                        |

### 7.2 `init()` — wiring tools per agent run

The init sequence is:

1. **Fetch the row** by `skillId` scoped to the user's workspace; reject if no
   `publishedBundleId`.
2. **Load the bundle** through `bundleLoader.loadPublishedBundle`, which reads
   `skills/{wsId}/{skillId}/artifacts/{bundleId}/bundle.json` and caches it in process
   memory (TTL 24h, LRU-capped at 64 entries). A re-publish mints a new bundleId, so
   stale entries naturally expire.
3. **Detect sandbox capability** via `detectSandboxCapability(process.env)`. This is
   purely environment-driven (no network probe): an `E2B_APIKEY` plus the
   `SKILL_ALLOW_EXEC` and `SKILL_BASH_EXEC` opt-outs.
4. **Build a `SandboxManifest`** when capability + selected ids are non-empty (§7.5).
   Computes the *reachable* set via BFS over `dependencyGraph` plus explicit file
   references, then projects each reachable node into a manifest entry with a canonical
   path under `/home/user/skills/`.
5. **Emit one `SkillFileTool` per selected markdown node** (§7.3). Each tool's
   description is enriched with the entry's transitive tool-deps hint and, in sandbox
   mode, per-reference recipe lines so the LLM sees the exact bash command for every
   referenced file.
6. **Resolve referenced custom tools to live `DynamicStructuredTool` instances** via
   `customToolFactory.buildCustomToolsFromBundle` (§7.4). Other reference types
   (`mcp` / `http` / `builtin`) remain advertised through the textual hint only.
7. **Optionally register the bash tool** (`SandboxBashTool`) backed by a single shared
   `SandboxSession` (§7.5).

### 7.3 `SkillFileTool` — one tool per markdown file

`SkillFileTool` (`packages/components/nodes/tools/Skill/SkillFileTool.ts`) is a thin
`Tool` wrapper around one pre-compiled `SkillBundleEntry`:

```37:42:packages/components/nodes/tools/Skill/SkillFileTool.ts
    async _call(_input: string): Promise<string> {
        if (this.toolHint) {
            return `${this.content}\n\n${this.toolHint}`
        }
        return this.content
    }
```

- All compilation happened server-side. The runtime returns `entry.content` verbatim,
  appended with an optional `toolHint` block (transitive tools list, sandbox shell
  intro, per-reference command recipes).
- Flowise's runtime `{{question}}` / `{{$vars.…}}` resolver runs *after* this tool
  returns, in the agent layer, so the call site doesn't need to know anything about
  skill placeholders.
- Tool name is derived from YAML frontmatter (`name:`) when present, falling back to the
  filename (`extractFrontmatterMetadata` in `utils.ts`). `formatToolName` enforces
  LangChain's `[a-zA-Z0-9_-]+` constraint.

### 7.4 `customToolFactory` — materialising referenced tools

For every `ToolReference` with `type === 'custom'` and `enabled !== false`, the runtime
re-creates the same `DynamicStructuredTool` that the `CustomTool` node would build:

- Fetches the `Tool` row by `uuid` from the workspace DB.
- Re-derives the Zod schema with `convertSchemaToZod(row.schema)` and the JS body from
  `row.func`.
- Injects workspace variables (`getVars`) and `{ chatflowId }` flow context — exactly
  the same surface as the `CustomTool` node so authors get a uniform `$vars` / `$flow`
  contract.
- Skips silently when the row is missing or its schema is malformed (the bundle was
  published in the past; the underlying tool may have been deleted since). Surfacing a
  hard error would break the whole Skill node for one stale reference.
- Dedupes by `uuid` and disambiguates colliding tool names with `_2`, `_3`, … suffixes.

`mcp` / `http` / `builtin` references are intentionally *not* materialised yet — they
remain advertised through the textual hint until each grows a dedicated runtime path.

### 7.5 The optional sandbox shell

When E2B is available, the node registers a single companion bash tool. The pieces:

| File                    | Role                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox/capability.ts` | Env-only detection: returns a `SandboxCapability` (timeout + output-byte ceilings) or `null`. No network probes.                      |
| `sandbox/SandboxManifest.ts` | Pure projection of `(SkillBundle, selectedIds)` into `{ skillsDir, outputDir, entries[] }`. Computes reachability and canonical paths. |
| `sandbox/fetchNodeBytes.ts` | Loads a node's bytes for materialisation. Skill markdown comes from `entry.content`; code/data come from `nodes/{nodeId}.json#content`; binaries from `nodes/{nodeId}.bin`. Cached by `(wsId, skillId, nodeId, digest)` — a re-publish mints fresh digests so stale entries age out automatically. |
| `sandbox/SandboxSession.ts` | Owns one E2B VM per agent run. `ensureStarted()` is lazy + idempotent; nothing hits the wire until the first `exec()`. Uploads the manifest as a single bulk write, capped by `SKILL_V2_SANDBOX_MAX_BYTES_PER_FILE` and `SKILL_V2_SANDBOX_MAX_TOTAL_BYTES`. An idle timer (`SKILL_V2_SANDBOX_IDLE_MS`, default 5 min) auto-closes the VM if the agent forgets. |
| `sandbox/SandboxBashTool.ts` | The LLM-facing `StructuredTool`. Schema is `{ command: string, timeout_ms?: number }`. Always returns a JSON envelope `{ status, stdout, stderr, exitCode, error?, durationMs, engine }`; never throws. Description carries a "Suggested invocations" cheat-sheet grouped by recipe family. |
| `sandbox/commandRecipes.ts` | Per-extension family registry. Each family carries one **primary** task plus a curated list of **alternatives** tagged by intent (`peek` / `tail` / `search` / `count` / `query` / `info`), so the bash tool's description and the per-file helper block can advertise `grep -nE`, `head -n 50`, `jq`, `pdftotext`, `pdfgrep`, `unzip -l`, … instead of always falling back to `cat` / `file`. The bash tool description renders four sections: intro, productivity tips, per-file primary commands, and per-family productive-command templates. The per-file helper block emits 1 line for exec references and up to 3 lines (primary + 2 productive alternatives) for data/binary references. |

VM layout:

```
/home/user/
├── skills/                 # materialised manifest entries
│   ├── resume-screener.md
│   ├── job-description.txt
│   └── scoring_algorithm.js
└── output/                 # convention: LLM writes artefacts here
```

The session never throws to the agent — host failures (timeout, network, boot) flow
through the same envelope as guest-side failures so the function-calling loop stays
deterministic.

### 7.6 Two execution modes

The whole runtime collapses to one of two modes:

| Mode                     | When                                                                                                  | What the LLM sees                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sandbox shell**        | `E2B_APIKEY` is set, `SKILL_ALLOW_EXEC` is not `false`, `enableBash` is on, and the manifest is non-empty. | Per-file skill tools enriched with execution recipes + a single `bash_<SkillName>` tool that materialises `/home/user/skills` and lets the model run shell commands. |
| **Fallback (read-only)** | E2B not configured, kill-switch flipped, or `enableBash=false`.                                       | Per-file skill tools only. Compiled markdown is shown verbatim; any code the skill references becomes documentation the model has to reason about by hand.         |

There is no middle ground — the design avoids the trap of "partial sandbox" which would
force authors to handle two failure modes per script.

---

## 8. Runtime Sequence

A typical chatflow turn that invokes a skill:

```
Author / API                Server (publish)                    Storage                  Runtime (Skill node)              LLM / Agent
     │ POST /skills/:id/publish                                       │                          │                              │
     ├──────────────────────▶│ loadCompileInput (parallel reads)──────▶│                         │                              │
     │                       │ SkillCompiler.compileAll                │                         │                              │
     │                       │ putBundle (bundle.json + sidecars)─────▶│                         │                              │
     │                       │ putPublishedPointer ───────────────────▶│                         │                              │
     │                       │ Skill.publishedBundleId = id            │                         │                              │
     │                       │ deleteBundleArtifacts(prev) ───────────▶│                         │                              │
     │◀── 202 { bundleId }───│                                         │                         │                              │
     │                                                                                            │                              │
     │                                          (chatflow run starts)                              │                              │
     │                                                                                            │ init() fetch row             │
     │                                                                                            │◀── workspaceId, skillId,─────│
     │                                                                                            │   publishedBundleId          │
     │                                                                                            │ loadPublishedBundle ─────────▶│ memory cache hit?
     │                                                                                            │                              │ no → readBlob bundle.json
     │                                                                                            │ buildManifest (if E2B)       │
     │                                                                                            │ build SkillFileTool[] +      │
     │                                                                                            │   custom DynamicStructuredTool[] +
     │                                                                                            │   SandboxBashTool (optional) │
     │                                                                                            │── return Tool[] ────────────▶│
     │                                                                                            │                              │
     │                                                                                            │              tool_call(resume_screener, args)
     │                                                                                            │◀─────────────────────────────│
     │                                                                                            │ SkillFileTool._call          │
     │                                                                                            │   → entry.content + hint     │
     │                                                                                            │── string ───────────────────▶│
     │                                                                                            │                              │ (optional)
     │                                                                                            │              tool_call(bash_skill, { command: "node /home/user/skills/scoring_algorithm.js …" })
     │                                                                                            │◀─────────────────────────────│
     │                                                                                            │ SandboxSession.ensureStarted()
     │                                                                                            │   ↳ first call only — boot E2B,
     │                                                                                            │     materialise manifest      │
     │                                                                                            │ session.exec(command)        │
     │                                                                                            │── envelope JSON ────────────▶│
     │                                                                                            │                              │ final answer
```

Two cold-path observations:

- **The first chatflow invocation pays the bundle download cost.** Subsequent calls
  within the same process hit the in-memory cache (24 h TTL). When Redis is configured,
  even a fresh worker only pays a Redis round-trip.
- **The first bash call pays the E2B boot cost (~1–2 s).** All subsequent commands
  reuse the same VM until the idle timer or `close()` reaps it.

---

## 9. Security Model

Skills inherit Flowise's standard protections plus a few skill-specific defences:

- **Workspace scoping.** Every controller asserts `req.user.activeWorkspaceId`; every
  service query and storage key includes `workspaceId`.
- **No `eval` in compilation.** `placeholderParser` is strictly regex-based with a
  10,000-iteration cap and skips code spans, so user content never reaches the
  compiler's control flow.
- **Custom tool execution inherits `CustomTool` hardening.** `customToolFactory`
  rebuilds `DynamicStructuredTool` instances that go through the same E2B / NodeVM
  sandbox documented in `docs/custom_tool_architecture.md` §6.
- **Sandbox shell is opt-in twice.** Both `E2B_APIKEY` (server-side) and the
  per-node `Enable Sandbox Shell` toggle must be on; the kill-switch
  `SKILL_ALLOW_EXEC=false` overrides everything.
- **Upload budgets.** `SKILL_V2_SANDBOX_MAX_BYTES_PER_FILE` (default 2 MiB) and
  `SKILL_V2_SANDBOX_MAX_TOTAL_BYTES` (default 20 MiB) cap how much the manifest can
  push into the VM, regardless of how large the published assets are.
- **Output clipping.** `SKILL_MAX_OUTPUT_BYTES` (default 64 KiB per stream) prevents a
  chatty command from blowing the context window or DoS-ing the agent loop.
- **Idle + lifetime timers.** `SKILL_V2_SANDBOX_IDLE_MS` (5 min default) auto-closes a
  forgotten session; `SKILL_V2_SANDBOX_LIFETIME_MS` (15 min default) bounds how long
  E2B will keep the VM around even if everything else fails.
- **Content-addressed bundles.** A consumer cannot accidentally pull a half-written
  bundle: `bundleId` is computed *before* the artefacts hit storage, and the
  `published.json` pointer flips only after the new bundle is fully committed.
- **Schema versioning.** `bundle.schemaVersion = 1`. Future breaking changes to the
  bundle shape will bump the version and the loader will refuse unknown versions.

---

## 10. Extension Points

| Extension                                     | How                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New file kind                                 | Add the extension to `classifyKind` (`utils/tree.ts`) and, if relevant, to `commandRecipes.ts` so the bash tool advertises a sensible default invocation.                                            |
| New productive command for a file family      | Add a `RecipeTask` to the family's `alternatives` array in `commandRecipes.ts` (e.g. a new `query` task using `dasel` for YAML). The new template is automatically picked up by `buildBashToolDescription` (per-family productive block) and `renderReferenceRecipes` (per-skill helper block). No other file needs to change. |
| New placeholder namespace (e.g. `{{env.…}}`)  | Extend `placeholderParser.scanPlaceholders` with a new `kind`, then teach `SkillCompiler.resolveContent` how to render and (optionally) gather it as a dependency.                                   |
| New tool reference type (besides `custom`)    | Add a branch to `customToolFactory.buildCustomToolsFromBundle` that materialises the right LangChain `Tool`. The compiled bundle already carries the metadata (`type`, `provider`, `config`).        |
| Alternative sandbox backend (Daytona, Modal)  | Implement a new `SandboxSession` flavour with the same `ensureStarted` / `exec` / `harvestOutputs` contract; swap selection in `Skill.ts#buildBashSessionTool`. The manifest is backend-agnostic.     |
| Cross-skill placeholder references             | Extend `{{skill.<nodeId>}}` to `{{skill.<skillId>:<nodeId>}}`, teach `fileResolver` about cross-skill bundle merging, and update `SkillBundleManager` to hold the joined view.                       |
| Hard tool-access enforcement                   | Have the agent wrapper read `derivePolicy(bundle, selectedIds)` from the node and filter the chatflow's tool array down to the intersection before each tool call.                                   |

---

## 11. Summary

The Skill feature is two cooperating subsystems that meet only through object storage:

1. **Authoring** (`packages/server/src/services/skills/`) lets users assemble a
   self-contained tree of markdown / code / data / binary files, persists each file
   as a JSON or binary blob, runs a stateless `SkillCompiler` on publish, and writes
   a content-addressed `SkillBundle` artefact that future runs can read by id.

2. **Runtime** (`packages/components/nodes/tools/Skill/`) is a Flowise node that
   reads a published bundle, exposes one LangChain `Tool` per selected markdown
   file, materialises every referenced custom tool as a live `DynamicStructuredTool`,
   and — when E2B is configured — adds a shared bash tool backed by a lazy
   `SandboxSession` that materialises every reachable asset under `/home/user/skills/`.

Both halves stay deliberately small: the database holds one row per skill, the
compiler is pure TypeScript with no I/O, the runtime never re-parses placeholders,
and the bundle artefact is immutable and content-addressed so caches never see a
stale read. The result is a Dify-style authoring experience that drops cleanly into
Flowise's existing chatflow + tool runtime without a parallel execution engine.
