# Skills Architecture

This document describes the architecture of the **Skills** feature in Dify workflows: what a skill is, how skills are authored, compiled, persisted, and executed at runtime inside LLM workflow nodes.

---

## Table of Contents

-   [Overview](#overview)
-   [Key Concepts](#key-concepts)
-   [Directory Layout](#directory-layout)
-   [Data Flow](#data-flow)
    -   [Authoring (Draft)](#1-authoring-draft)
    -   [Build / Publish](#2-build--publish)
    -   [Runtime Execution](#3-runtime-execution)
    -   [API Introspection](#4-api-introspection)
-   [Compilation](#compilation)
    -   [Placeholder Syntax](#placeholder-syntax)
    -   [Batch Compilation (compile_all)](#batch-compilation-compile_all)
    -   [Single-Prompt Compilation (compile_one)](#single-prompt-compilation-compile_one)
    -   [Transitive Dependency Propagation](#transitive-dependency-propagation)
-   [Skill Bundle](#skill-bundle)
    -   [Structure](#structure)
    -   [Persistence & Caching](#persistence--caching)
-   [Workflow Integration](#workflow-integration)
    -   [LLM Node Entities](#llm-node-entities)
    -   [Prompt Resolution](#prompt-resolution)
    -   [Tool Dependency Extraction](#tool-dependency-extraction)
    -   [Tool Access Policy](#tool-access-policy)
-   [Build Pipeline](#build-pipeline)
    -   [AssetBuildPipeline](#assetbuildpipeline)
    -   [SkillBuilder](#skillbuilder)
-   [Sandbox Integration](#sandbox-integration)
-   [Storage Layout](#storage-layout)
-   [API Layer](#api-layer)

---

## Overview

Skills are **Markdown-based prompt assets** that augment LLM nodes in Dify workflows. A skill document contains structured prompt text with embedded **tool references** and **file references**, expressed through a placeholder syntax. At build time, skills are compiled into a **SkillBundle** that captures resolved content, tool dependencies, file dependencies, and their transitive closure. At runtime, the LLM node uses the bundle to transform prompt templates into final prompt text and to determine which tools the node is allowed to invoke.

Skills are **not** stored as a dedicated database model. They are ordinary `.md` file nodes inside the app's `AppAssetFileTree`, managed through the generic `AppAssetService`. The compiled artifact (`SkillBundle`) is persisted as a JSON file in object storage and cached in Redis.

---

## Key Concepts

| Concept              | Description                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SkillDocument**    | Raw input: a skill ID, Markdown content with placeholders, and a metadata dict mapping tool UUIDs to their configuration.                           |
| **SkillBundle**      | The compiled output of all skills in an app: a map of `skill_id → SkillBundleEntry` plus forward/reverse dependency graphs.                         |
| **SkillBundleEntry** | One compiled skill: resolved content, tool dependencies (with transitive closure), and file references.                                             |
| **SkillCompiler**    | Stateless compiler that parses placeholders, resolves file paths and tool labels, builds dependency graphs, and propagates transitive dependencies. |
| **SkillManager**     | Loads and saves `SkillBundle` to/from object storage with Redis caching.                                                                            |
| **SkillBuilder**     | Build-pipeline participant that accepts `.md` assets and orchestrates compilation.                                                                  |
| **ToolDependency**   | A declared dependency on a specific tool (`type`, `provider`, `tool_name`).                                                                         |
| **ToolReference**    | An instance of a tool in a skill's content, including UUID, enabled flag, credential, and configuration.                                            |
| **ToolAccessPolicy** | Security gate that derives allowed tool invocations from `ToolDependencies`.                                                                        |

---

## Directory Layout

```
api/core/skill/
├── __init__.py                      # Public re-exports
├── constants.py                     # SkillAttrs (sandbox attribute keys)
├── skill_compiler.py                # Core compilation logic
├── skill_manager.py                 # Bundle persistence + Redis cache
└── entities/
    ├── __init__.py                  # Re-exports all entities
    ├── api_entities.py              # NodeSkillInfo (API response DTO)
    ├── asset_references.py          # AssetReferences (file ref collection)
    ├── skill_bundle.py              # SkillBundle (compiled artifact set)
    ├── skill_bundle_entry.py        # SkillBundleEntry + SourceInfo
    ├── skill_document.py            # SkillDocument (compiler input)
    ├── skill_metadata.py            # ToolReference, FileReference, SkillMetadata
    ├── tool_access_policy.py        # ToolAccessPolicy (security)
    └── tool_dependencies.py         # ToolDependency, ToolDependencies

api/core/app_assets/builder/
├── base.py                          # BuildContext, AssetBuilder protocol
├── pipeline.py                      # AssetBuildPipeline
├── skill_builder.py                 # SkillBuilder (build-time orchestrator)
└── file_builder.py                  # FileBuilder (generic file passthrough)

api/core/sandbox/initializer/
└── skill_initializer.py             # Injects SkillBundle into sandbox

api/services/
├── skill_service.py                 # API-level skill introspection
└── app_asset_package_service.py     # Publish pipeline (wires SkillBuilder)

api/controllers/console/app/
└── skills.py                        # REST endpoints for skill queries
```

---

## Data Flow

The skill lifecycle has four phases:

### 1. Authoring (Draft)

```
User (IDE/UI) ──→ AppAssetService ──→ Object Storage
                                       (draft/{node_id})
```

Skills are authored as `.md` files within the app's asset tree. Each file is stored in object storage under the draft path as a JSON payload containing `content` (Markdown with placeholders) and `metadata` (tool configuration keyed by UUID). The asset tree (`AppAssetFileTree`) is persisted as JSON in the `app_assets` database table.

### 2. Build / Publish

```
AppAssetPackageService.publish()
  │
  ▼
AssetBuildPipeline
  │
  ├── SkillBuilder.accept(.md) → collect → build
  │     │
  │     ├── _load_all()           ← parallel I/O from draft storage
  │     ├── SkillCompiler.compile_all()  ← CPU-bound compilation
  │     ├── SkillManager.save_bundle()   ← persist SkillBundle JSON
  │     └── _upload_all()         ← parallel I/O, resolved content
  │
  └── FileBuilder.accept(*) → collect → build
```

On publish, the `AssetBuildPipeline` distributes file nodes to builders. The `SkillBuilder` claims all `.md` files, loads their draft content in parallel, runs batch compilation to produce a `SkillBundle`, saves it via `SkillManager`, and uploads per-skill resolved Markdown. Non-`.md` files fall through to `FileBuilder`.

### 3. Runtime Execution

```
Workflow Engine
  │
  ├── SkillInitializer.initialize(sandbox)
  │     └── SkillManager.load_bundle() → sandbox.attrs[BUNDLE]
  │
  └── LLM Node
        ├── handle_list_messages()
        │     └── SkillCompiler.compile_one() per prompt
        │           → resolved prompt text
        │
        └── _extract_tool_dependencies()
              └── SkillCompiler.compile_one() per prompt
                    → ToolDependencies → ToolAccessPolicy
```

Before a workflow runs, `SkillInitializer` loads the published `SkillBundle` from storage (with Redis cache) and injects it into the sandbox's attribute map. When the LLM node executes, it retrieves the bundle and file tree from the sandbox, then runs `SkillCompiler.compile_one()` on each prompt message to resolve placeholders into final text and extract tool dependencies.

### 4. API Introspection

```
GET /apps/{app_id}/workflows/draft/skills
GET /apps/{app_id}/workflows/draft/nodes/{node_id}/skills
  │
  └── SkillService
        ├── walk LLM nodes with skill=true prompts
        └── SkillCompiler.compile_one() per skill prompt
              → NodeSkillInfo (tool dependencies)
```

The REST API uses `SkillService` to scan the draft workflow for LLM nodes containing skill-flagged prompts and returns their tool dependencies.

---

## Compilation

### Placeholder Syntax

Skill content uses two types of placeholders:

**Tool references:**

```
§[tool].[provider].[tool_name].[uuid]§
```

Resolved at compile time to human-readable labels like `[Bash Command: bash_<uuid>]` or `[Executable: <name>_<uuid> --help command]`.

**Tool groups** (multiple tools in a bracketed list):

```
[§[tool].[p1].[n1].[u1]§, §[tool].[p2].[n2].[u2]§]
```

Disabled tools are removed; the group renders as `[<resolved_1>, <resolved_2>]`.

**File references:**

```
§[file].[source].[asset_id]§
```

Resolved to a relative file path from the source skill to the target asset, or an absolute `skills/<path>` path when the source is anonymous.

### Batch Compilation (compile_all)

Used at **build time** by `SkillBuilder`. The compiler processes all skill documents in three phases:

1. **Parse & Graph**: Extract `SkillMetadata` from each document. Build a dependency graph where edges represent file references between skills.
2. **Direct Compile**: Compile each skill independently with only its directly declared tools and files.
3. **Transitive Propagation**: Iteratively merge tool/file dependencies from referenced skills until a fixed-point is reached.

The output is a `SkillBundle` containing all entries plus the forward and reverse dependency graphs.

### Single-Prompt Compilation (compile_one)

Used at **runtime** by LLM nodes and at **introspection time** by `SkillService`. Given a prompt's content and metadata:

1. Parse metadata for tool and file references.
2. Look up referenced skill entries in the pre-built bundle to pull in their transitive dependencies.
3. Resolve all placeholders in the content text.
4. Return a `SkillBundleEntry` with the resolved content and aggregated `ToolDependencies`.

The prompt is treated as an "anonymous" skill (not part of the bundle) that references bundle entries through file placeholders.

### Transitive Dependency Propagation

When skill A references skill B (via a file placeholder), and skill B declares tool X, then skill A also inherits tool X. The compiler uses a fixed-point iteration over the dependency graph:

```
repeat:
  for each skill S in graph:
    for each dependency D of S:
      merge D.tools into S.tools
      merge D.files into S.files
  until no changes
```

This guarantees the transitive closure even with multi-level chains (A → B → C).

---

## Skill Bundle

### Structure

```
SkillBundle
├── assets_id: str              # The build/publish ID
├── schema_version: int         # Forward compatibility
├── built_at: datetime?
├── entries: {skill_id → SkillBundleEntry}
│     └── SkillBundleEntry
│           ├── skill_id: str
│           ├── source: SourceInfo (asset_id, content_digest)
│           ├── tools: ToolDependencies
│           │     ├── dependencies: [ToolDependency]
│           │     └── references: [ToolReference]
│           ├── files: AssetReferences
│           │     └── references: [FileReference]
│           └── content: str    # Resolved Markdown
├── dependency_graph: {skill_id → [dependency_ids]}
└── reverse_graph: {skill_id → [dependent_ids]}
```

The bundle supports:

-   **Lookup**: `bundle.get(skill_id)` to retrieve a compiled entry.
-   **Upsert/Remove**: For incremental updates.
-   **Recompile groups**: `recompile_group_ids(skill_id)` returns all skills transitively affected by a change (via the reverse graph).
-   **Subset**: Extract a sub-bundle for a set of skill IDs.
-   **Aggregate**: `get_tool_dependencies()` merges all entries' tool deps.

### Persistence & Caching

| Layer          | Key Pattern                                                               | TTL       |
| -------------- | ------------------------------------------------------------------------- | --------- |
| Object Storage | `app_assets/{tenant}/{app}/artifacts/{assets_id}/skill_artifact_set.json` | Permanent |
| Redis          | `skill_bundle:{tenant}:{app}:{assets_id}`                                 | 24 hours  |

`SkillManager.load_bundle()` checks Redis first, falls back to object storage, and populates the cache on miss. `save_bundle()` writes to storage and invalidates the cache.

---

## Workflow Integration

### LLM Node Entities

The `LLMNodeChatModelMessage` extends `ChatModelMessage` with skill-specific fields:

```python
class LLMNodeChatModelMessage(ChatModelMessage):
    text: str = ""
    jinja2_text: str | None = None
    skill: bool = False                    # Marks this prompt as a skill prompt
    metadata: Mapping[str, Any] | None = None  # Tool config keyed by UUID
```

The `skill` flag is used by `SkillService` for API introspection. At runtime, the LLM node compiles **all** prompts when a bundle + file tree exist (not just `skill=True` ones).

### Prompt Resolution

In `LLMNode.handle_list_messages()`:

1. For **Jinja2** prompts: render the template first, then pass the result through `SkillCompiler.compile_one()`.
2. For **plain-text** prompts: resolve variables into a text segment, then pass through `SkillCompiler.compile_one()`.

The compiler replaces `§[tool]...§` placeholders with readable labels and `§[file]...§` with resolved paths, producing the final prompt text sent to the LLM.

### Tool Dependency Extraction

In `LLMNode._extract_tool_dependencies()`:

1. Compile each prompt template entry with `SkillCompiler.compile_one()`.
2. Collect `ToolDependencies` from each compiled entry.
3. Merge all dependencies using `ToolDependencies.merge()`.
4. Mark tools as disabled if they appear in the node's `tool_settings` with `enabled=False`.

The resulting `ToolDependencies` determines which tools the LLM is allowed to invoke during execution.

### Tool Access Policy

`ToolAccessPolicy` converts `ToolDependencies` into an authorization gate:

-   A tool must be declared in `dependencies` or `references` to be invokable.
-   If `references` specify `credential_id` values, the invocation must use one of those credentials.
-   If the policy is empty (no dependencies), all tools are allowed (backward compatibility).

---

## Build Pipeline

### AssetBuildPipeline

The generic pipeline distributes file nodes to builders in priority order:

```python
class AssetBuildPipeline:
    def build_all(self, tree, ctx) -> list[AssetItem]:
        # 1. Distribute: each node goes to first accepting builder
        for node in tree.walk_files():
            for builder in self._builders:
                if builder.accept(node):
                    builder.collect(node, path, ctx)
                    break  # first match wins

        # 2. Each builder builds its collected nodes
        for builder in self._builders:
            results.extend(builder.build(tree, ctx))
```

The pipeline is instantiated as:

```python
AssetBuildPipeline([SkillBuilder(storage=asset_storage), FileBuilder()])
```

Since `SkillBuilder` is first and accepts `.md` files, all Markdown assets go to skill compilation. `FileBuilder` (which accepts everything) handles the rest.

### SkillBuilder

The build process:

1. **Load** (`_load_all`): Parallel I/O to read JSON payloads from draft storage for each `.md` node.
2. **Compile** (`SkillCompiler.compile_all`): Single-threaded batch compilation producing a `SkillBundle`.
3. **Save** (`SkillManager.save_bundle`): Persist the bundle JSON to object storage.
4. **Upload** (`_upload_all`): Parallel I/O to write each skill's resolved content to the `resolved/` storage path.
5. **Return**: `AssetItem` list for inclusion in the runtime ZIP.

If no `.md` files exist, an empty `SkillBundle` is still saved (ensures `SkillManager.load_bundle()` always succeeds).

---

## Sandbox Integration

The sandbox is the execution environment for workflow nodes. Skills integrate via initializers:

**`SkillInitializer`**: Loads the `SkillBundle` from `SkillManager` and sets it on `sandbox.attrs` under the `SkillAttrs.BUNDLE` key.

**`AppAssetsAttrs`** (from `core/app_assets/constants.py`): Provides `FILE_TREE` and `APP_ASSETS_ID` attribute keys used alongside the bundle.

At LLM node execution time, the node reads:

-   `sandbox.attrs.get(SkillAttrs.BUNDLE)` → `SkillBundle`
-   `sandbox.attrs.get(AppAssetsAttrs.FILE_TREE)` → `AppAssetFileTree`

Both are required for skill compilation. If either is `None`, skill resolution is skipped.

---

## Storage Layout

```
app_assets/
└── {tenant_id}/
    └── {app_id}/
        ├── draft/
        │   └── {node_id}              # Raw JSON: {content, metadata}
        ├── artifacts/
        │   └── {assets_id}/
        │       ├── skill_artifact_set.json   # SkillBundle
        │       ├── resolved/{node_id}        # Compiled skill content
        │       └── ...
        ├── sources/
        │   └── {workflow_id}.zip       # Source ZIP for export
        └── bundle_exports/
            └── {export_id}.zip
```

---

## API Layer

### Endpoints

| Method | Path                                                                | Description                                  |
| ------ | ------------------------------------------------------------------- | -------------------------------------------- |
| GET    | `/console/api/apps/{app_id}/workflows/draft/nodes/{node_id}/skills` | Get skill info for a specific node           |
| GET    | `/console/api/apps/{app_id}/workflows/draft/skills`                 | Get skill info for all nodes in the workflow |

### Controller → Service Flow

1. **Controller** (`controllers/console/app/skills.py`): Validates auth, retrieves the draft workflow, delegates to `SkillService`.
2. **SkillService**: Iterates LLM nodes, checks for `skill=True` prompts, loads the draft `SkillBundle`, and runs `SkillCompiler.compile_one()` to extract `ToolDependencies`.
3. **Response**: Returns `NodeSkillInfo` (node ID + list of `ToolDependency`).

Both endpoints are restricted to `ADVANCED_CHAT` and `WORKFLOW` app modes.
