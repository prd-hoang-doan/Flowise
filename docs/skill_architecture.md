# Skill Feature — Architecture Overview

This document describes the end-to-end architecture of the **Skill** feature in Flowise, organized by the five development phases that produced it. Each phase builds on the previous one and is still present in the current runtime — together they form a layered pipeline that turns user-authored markdown into structured, retrievable, LLM-ready context.

---

## 1. High-Level Model

A **Skill Folder** groups related **Skill Files** (markdown + optional assets). At runtime, every selected file becomes an individual LangChain `Tool` that the agent can invoke; the tool's `_call()` returns the compiled prompt (plus optional multimodal payload) that the LLM consumes.

```
SkillFolder  ─┬─ SkillFile  ─── SkillNode ─── SkillNodeEmbedding
              │                 │
              │                 └─ SkillEdge
              │
              └─ SkillAsset ─── (caption / summary / extracted text)

              │
              └─ SkillCompileCache   (derived / cached compile output)
```

The folder has a `mode` property (`simple` | `advanced` | `dedicated`) that selects how much of the pipeline runs. Modes map directly to phases:

| Folder mode | Entities used                                                         | Phase baseline |
| ----------- | --------------------------------------------------------------------- | -------------- |
| `simple`    | `SkillFolder`, `SkillFile`                                            | Phase 1        |
| `advanced`  | + `SkillAsset` (+ captions, multimodal)                               | Phase 2–3      |
| `dedicated` | + `SkillNode`, `SkillEdge`, `SkillNodeEmbedding`, `SkillCompileCache` | Phase 4–5      |

---

## 2. Runtime Pipeline (Load → Normalize → Compile → Inject)

All phases share a common four-stage runtime pipeline defined in `packages/components/nodes/tools/SkillTool/`:

```
Load  →  Normalize  →  Compile  →  Inject
```

-   **Load** — `SkillTool.getTools()` pulls folders, files, assets, nodes, edges, embeddings, and cache rows from the database.
-   **Normalize** — `SkillCompiler.normalize()` converts raw DB rows into a canonical `NormalizedSkill` shape (`role`, `behavior`, `knowledge`, `assets`, `runtimeRules`) so compilation is independent of DB schema.
-   **Compile** — a mode-specific strategy (`SimpleInitCompileStrategy` / `AdvancedInitCompileStrategy` / `DedicatedInitCompileStrategy`) produces `summaryContent` and optional `multimodalContent`.
-   **Inject** — at `_call()` time the matching `ICallStrategy` returns the final string (or a `__multimodal` JSON envelope) that the agent feeds to the LLM.

The two strategy families (`initCompileStrategy.ts` + `callStrategy.ts`) make the engine **mode-driven**: one switch selects the entire behavior across both build-time and runtime.

---

## 3. Phase-by-Phase Architecture

### Phase 1 — Markdown Skill Primitive

**Purpose:** Establish the Skill domain as a first-class entity and expose it as a LangChain tool.

**Data model**

-   `SkillFolder` — `id`, `name`, `description`, `color`, `iconSrc`
-   `SkillFile` — `folderId`, `name`, `description`, `content` (markdown)

**Server**

-   REST routes under `packages/server/src/routes/skill-folders/` for folder + file CRUD.
-   `compileSkillContent()` inside `SkillTool.ts` strips YAML front matter and returns the raw markdown.

**Runtime**

-   `SkillTool` (`skillTool` node) exposes:
    -   `skillFolderId` — folder to load
    -   `skillFiles` — multi-select of files inside the folder
-   Each selected file becomes one `SkillFileTool` instance (`Tool.name = formatToolName(file.name)`).
-   Call path: `_call(input)` → returns `content` as-is (handled by `SimpleCallStrategy`).

**UI**

-   Tools page → **Skills** tab.
-   `SkillFolderDialog` — flat create/edit dialog (name, description, color, icon).
-   `SkillFolderEditorDialog` — right-side drawer with file sidebar + **Source** / **Preview** tabs (TipTap markdown editor, react-markdown preview).

**Outcome:** A folder of markdown skills that the agent can read verbatim.

---

### Phase 2 — Vision Captioning, Front-Matter Sync, Multi-Format Assets

**Purpose:** Turn uploaded files (images, PDFs, HTML, spreadsheets) into usable text context for the LLM.

**Data model additions**

-   `SkillAsset` — `folderId`, `fileId`, `filename`, `mimeType`, `storagePath`, `caption`
-   `SkillFolder.captionModelConfig` (JSON) — stores the vision LLM provider, model, credentials, and parameters used to caption assets.

**Server additions**

-   `packages/server/src/services/skill-assets/` — asset service, storage, caption pipeline.
-   `captionService.ts`:
    -   `generateVisionCaption()` — sends the image to a configured chat model with vision (GPT-4o, Claude Sonnet, etc.) and stores the result as `SkillAsset.caption`.
    -   `generateFallbackCaption()` — filename-based caption when no model is configured.
    -   `extractPdfSummary()` / `extractHtmlSummary()` / `extractSpreadsheetSummary()` for non-image assets.
-   Asset create/delete auto-syncs the `assets:` array in the markdown file's YAML front matter.
-   Endpoint `POST /:folderId/assets/:assetId/regenerate-caption` re-triggers captioning on demand.

**UI additions**

-   New **Assets** tab in `SkillFolderEditorDialog` — upload, preview thumbnails, caption inline-edit, regenerate-caption button.
-   `CaptionModelInputHandler.jsx` — dynamically renders the caption LLM config (credential picker, provider/model dropdowns, temperature, maxTokens) using the same input-param pattern as canvas nodes.

**Runtime**

-   `compileSkillContent()` appends an **Asset Context** block grouped by type (Images / Documents / Data), truncated to `maxAssetContext`.

**Outcome:** The agent receives concise, model-generated descriptions of uploaded assets alongside the markdown.

---

### Phase 3 — Two Execution Modes + Asset Preprocessing

**Purpose:** Stop dumping every caption into every prompt; allow real multimodal delivery when the LLM supports it.

**Node params added to `SkillTool`** (see `SkillTool.ts` `inputs`):

| Param                 | Default | Purpose                                             |
| --------------------- | ------- | --------------------------------------------------- |
| `executionMode`       | summary | `summary` (text only) or `multimodal` (images/docs) |
| `maxAssetContext`     | 2000    | Cap on asset text injected in summary mode (chars)  |
| `maxMultimodalAssets` | 5       | Cap on assets attached as multimodal parts          |
| `maxDocumentChars`    | 5000    | Cap on text extracted per document asset            |

**Runtime**

-   `AssetCompilerRegistry` dispatches each asset to a category-specific compiler (`image`, `pdf`, `html`, `spreadsheet`) implementing `IAssetCompiler.compileSummary()` and `compileMultimodal()`.
-   In **summary mode** the compiler returns `{ textBlock }` chunks merged into the prompt.
-   In **multimodal mode** the compiler returns `{ textBlock, multimodalPayload }`; the tool wraps the payload as:

    ```json
    { "__multimodal": true, "content": [ { "type": "image_url", "image_url": { "url": "..." } }, ... ] }
    ```

    The agent layer detects the `__multimodal` key and forwards the array as a native multimodal message to the LLM.

-   Dynamic retrieval is introduced: at tool invocation time, only assets whose captions match the user query are appended, avoiding the "dump everything" problem.

**Outcome:** A single folder can serve both cheap text-only flows and rich multimodal flows without duplicating data.

---

### Phase 4 — Graphify: Nodes, Edges, and Compile Cache

**Purpose:** Replace the monolithic `SkillFile.content` blob with **typed, prioritized, retrievable units** and cache compiled output.

**Guiding principle:** _Store normalized data for editing, but compile graph-ready data for runtime._

**Data model additions**

-   `SkillNode` — smallest unit of skill content:

    | Field           | Notes                                                                          |
    | --------------- | ------------------------------------------------------------------------------ |
    | `type`          | `role` (100) · `rule` (95) · `behavior` (80) · `knowledge` (70) · `asset` (60) |
    | `title`         | Human label for debugging                                                      |
    | `content`       | Node text                                                                      |
    | `priority`      | Default by type; used for trimming under token pressure                        |
    | `triggers`      | JSON keyword array for keyword retrieval                                       |
    | `cluster`       | `tone` / `platform` / `asset` / `constraint` / `output` / …                    |
    | `embeddingText` | Reserved for Phase 5                                                           |
    | `orderIndex`    | Deterministic render order                                                     |

-   `SkillEdge` — `fromNodeId → toNodeId` with `relation ∈ {supports, depends_on, extends}`.
-   `SkillCompileCache` — `folderId + skillFileId + executionMode + hash → compiledPrompt`.

**Node extraction pipeline** (`compiler/normalizer.ts` + heuristics):

```
parse markdown
  → segment blocks
  → classify type (role / rule / behavior / knowledge)
  → derive triggers + cluster
  → assign priority + orderIndex
  → persist SkillNode[] + SkillEdge[]
```

Detection heuristics (from Phase 4 spec): _"You are"_ → role · _"Do not / Always / Never"_ → rule · imperative-verb lines → behavior · declarative lines → knowledge · references to uploaded files → asset.

**Runtime (`nodeCompiler.ts`)**

1. Sort nodes by `priority DESC, orderIndex ASC`.
2. Trim to `maxTokenBudget` (drop lowest-priority first; `role` + `rule` are sticky).
3. Group by type and render with section headers:

    ```
    Skill: <name>
    Description: <desc>

    Role
    - <node.content>

    Rules
    - <node.content>

    Instructions
    - ...
    Knowledge
    - ...
    Assets
    - ...
    ```

4. `computeCompileHash(nodes, assets, config)` keys the `SkillCompileCache`; repeat invocations skip recompilation.

**Keyword retrieval (`compiler/retriever.ts`)**

-   Score each node: `trigger-hit × 2 + content-hit × 1`.
-   Always include `role` + `rule` nodes regardless of score.
-   Expand via `supports` edges.

**UI additions**

-   **Nodes** tab in `SkillFolderEditorDialog` with two display modes:
    -   **List view** — grouped by type with priority/cluster chips.
    -   **Graph view** (`SkillNodeGraph.jsx`) — ReactFlow visualization, colored by type (`role` purple, `rule` red, `behavior` blue, `knowledge` green, `asset` orange) with edge markers for relationships.
-   **Summary** tab — shows compile preview, hash, cache hit/miss, token estimate.

**Outcome:** The skill becomes a graph of typed nodes that can be selectively retrieved, re-ordered, and cached.

---

### Phase 5 — Embeddings, Semantic Retrieval, and Node-First Runtime

**Purpose:** Replace keyword matching with semantic similarity and send nodes (not a compiled blob) to the LLM.

**Data model additions**

-   `SkillNodeEmbedding`:

    | Field         | Notes                                                               |
    | ------------- | ------------------------------------------------------------------- |
    | `nodeId`      | Unique — one embedding per node                                     |
    | `embedding`   | JSON-serialized `float[]` (portable across SQLite/MySQL/PG/MariaDB) |
    | `dimension`   | Validated on load                                                   |
    | `modelId`     | Which embedding model produced the vector                           |
    | `contentHash` | SHA-256 of the node text; drives incremental re-embedding           |

-   `SkillFolder.embeddingModelConfig` — same config pattern as `captionModelConfig`, but for embedding models (OpenAI, Cohere, HuggingFace, Ollama, …).

**Embedding pipeline**

-   `compiler/embeddingAdapter.ts` instantiates the configured embedding model via `createEmbeddingInstance()`.
-   On node save/update the service computes `contentHash`; if it differs from the stored hash the node is re-embedded, otherwise skipped. Orphaned embeddings are cleaned up on node/file delete and on embedding-model change.
-   If no `embeddingModelConfig` is set, the folder silently falls back to keyword retrieval (Phase 4 behavior preserved).

**Semantic retrieval (`compiler/semanticRetriever.ts` + `cosineSimilarity.ts`)**

1. Always include `role` + `rule` nodes (mandatory).
2. If total nodes ≤ `maxNodes`, return all.
3. Otherwise compute a **hybrid score** per optional node:

    ```
    score = 0.60 * cosine(queryEmbedding, nodeEmbedding)
          + 0.25 * keywordOverlap(query, node)
          + 0.15 * normalize(node.priority)
    ```

    Defaults live in `DEFAULT_RETRIEVAL_CONFIG` (`maxNodes: 20`, `minSemanticScore: 0.3`).

4. Drop nodes below `minSemanticScore` when a semantic path is active.
5. Take top-K, expand via `supports` edges, deduplicate, return.
6. If `queryEmbedding` is null or no embeddings exist, the scorer degrades to keyword-only.

**Node-first runtime (`DedicatedCallStrategy`)**

-   At `_call(input)`:
    1. `generateQueryEmbedding(input)` via the folder's embedding model.
    2. `retrieveRelevantNodes()` returns a ranked `SkillNodeInput[]`.
    3. `compileFromNodes()` renders them with `[ROLE] / [RULE] / [DO] / [KNOW] / [ASSET]` section tags (`TYPE_TAGS` in `types.ts`) — empty sections are omitted.
    4. In multimodal mode, the compiler still emits the `__multimodal` envelope alongside the tagged text.

**UI additions**

-   `EmbeddingModelInputHandler.jsx` — mirrors `CaptionModelInputHandler` (provider, model, credential, optional dimension/batch size) and saves into `SkillFolder.embeddingModelConfig`.
-   **Execution Mode selector** inside `SkillFolderEditorDialog` — exposes `summary` vs `multimodal` as user-friendly cards.
-   **Embedding status indicators** on the Nodes tab: `Embedded` / `Not embedded` / `Outdated` / `Embedding…` plus aggregate stats in the Summary tab (total embedded nodes, model, last embedded timestamp).
-   **Re-embed All** action (`POST /api/v1/skill-folders/:folderId/reembed`) to rebuild vectors after a model change.
-   The **folder creation flow** kept as a 3-step wizard in `SkillFolderDialog` (Choose Goal → Folder Setup → Review & Create) where "Goal" maps to folder mode (`simple` / `advanced` / `dedicated`).

**Outcome:** The LLM receives only the nodes semantically relevant to the current user query, in a structured tag-delimited format, with graceful fallback when embeddings are not configured.

---

## 4. Strategy Dispatch Summary

The runtime behavior is entirely selected by `SkillFolder.mode`, applied in two places:

| Layer                  | File                     | Strategy selected by `folderMode`                                       |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------- |
| **Build (init-time)**  | `initCompileStrategy.ts` | Simple / Advanced / Dedicated init compile                              |
| **Invoke (call-time)** | `callStrategy.ts`        | `SimpleCallStrategy` / `AdvancedCallStrategy` / `DedicatedCallStrategy` |

| Folder mode | Init strategy                | Call strategy                                   | Retrieval           | Output shape                |
| ----------- | ---------------------------- | ----------------------------------------------- | ------------------- | --------------------------- |
| `simple`    | Markdown → normalized render | Return pre-compiled text                        | None                | Plain string                |
| `advanced`  | + asset compilation          | Text, or `__multimodal` envelope if configured  | Caption-based       | String or multimodal JSON   |
| `dedicated` | + node compilation + caching | Embed query → retrieve nodes → compile → return | Hybrid (sem+kw+pri) | Tagged string or multimodal |

Backward compatibility is preserved by `inferFolderMode()` in `SkillTool.ts`: if `folder.mode` is missing it infers from available tables (`SkillNode` → dedicated, `SkillAsset` → advanced, else simple). No existing folder is ever broken by a migration.

---

## 5. Key Files (Quick Reference)

**Runtime / compiler (`packages/components/nodes/tools/SkillTool/`)**

-   `SkillTool.ts` — node definition, load pipeline, strategy wiring.
-   `compiler/SkillCompiler.ts` — Load → Normalize → Compile facade.
-   `compiler/normalizer.ts` — front-matter stripping, type classification heuristics.
-   `compiler/nodeCompiler.ts` — node-aware compile + `computeCompileHash()`.
-   `compiler/retriever.ts` — Phase 4 keyword retrieval.
-   `compiler/semanticRetriever.ts` — Phase 5 hybrid retrieval.
-   `compiler/cosineSimilarity.ts` — vector math.
-   `compiler/embeddingAdapter.ts` — embedding model instantiation.
-   `compiler/initCompileStrategy.ts` — init-time strategy per mode.
-   `compiler/callStrategy.ts` — runtime strategy per mode.
-   `compiler/assetCompilers/` — per-MIME asset compilers (image / PDF / HTML / spreadsheet).
-   `compiler/types.ts` — shared interfaces + `TYPE_TAGS` + `DEFAULT_RETRIEVAL_CONFIG`.

**Server (`packages/server/src/`)**

-   `database/entities/SkillFolder.ts` · `SkillFile.ts` · `SkillAsset.ts` · `SkillNode.ts` · `SkillEdge.ts` · `SkillCompileCache.ts` · `SkillNodeEmbedding.ts`
-   `services/skill-folders/`, `skill-files/`, `skill-assets/`, `skill-nodes/`
-   `services/skill-assets/captionService.ts` — vision + extraction helpers

**UI (`packages/ui/src/views/tools/`)**

-   `SkillFolderDialog.jsx` — create/edit folder (wizard for create).
-   `SkillFolderEditorDialog.jsx` — main editor drawer (Source / Preview / Assets / Nodes / Summary).
-   `CaptionModelInputHandler.jsx` — caption LLM config panel.
-   `EmbeddingModelInputHandler.jsx` — embedding model config panel.
-   `SkillNodeGraph.jsx` — ReactFlow visualization of nodes + edges.

---

## 6. Extensibility Notes

-   **New asset types** plug in as new `IAssetCompiler` implementations registered in `AssetCompilerRegistry` — no changes to the core pipeline.
-   **New node types** only need an entry in `TYPE_ORDER`, `TYPE_SECTION_HEADERS`, and `TYPE_TAGS` plus a classification heuristic.
-   **Alternative vector stores** (pgvector, external vector DB) can replace the JSON-serialized storage without changing the retrieval contract — `SkillNodeEmbedding.embedding` is the only field that needs a new reader/writer.
-   **Multiple skills merge** is ready for future Agentflow integration: each tool already emits its own `=== SKILL <name> ===` boundary in the compiled output, preserving per-skill separation rather than flattening into a single system prompt.

---

# SUMMARY:

I've created the architecture document at docs/skill_architecture.md.

It's organized into 6 sections that mirror the 5 phases of the feature as implemented in the codebase:

High-Level Model — the entity diagram (SkillFolder → SkillFile → SkillNode/SkillEdge/SkillNodeEmbedding, plus SkillAsset and SkillCompileCache) and how the folder mode (simple / advanced / dedicated) maps to each phase.
Runtime Pipeline — the shared Load → Normalize → Compile → Inject stages in packages/components/nodes/tools/SkillTool/.
Phase-by-Phase Architecture — one subsection per phase, each covering:
Phase 1 — markdown skill primitive, SkillFolder + SkillFile, SimpleCallStrategy.
Phase 2 — SkillAsset, vision captioning (captionService.ts), front-matter sync, CaptionModelInputHandler.jsx.
Phase 3 — executionMode summary vs multimodal, AssetCompilerRegistry, the \_\_multimodal envelope.
Phase 4 — SkillNode / SkillEdge / SkillCompileCache, node extraction heuristics, nodeCompiler.ts, keyword retriever.ts, Nodes/Graph UI (SkillNodeGraph.jsx).
Phase 5 — SkillNodeEmbedding, hybrid scoring (0.6 _ cosine + 0.25 _ keyword + 0.15 \* priority), DedicatedCallStrategy, EmbeddingModelInputHandler, 3-step folder wizard from SkillFolderDialog.jsx.
Strategy Dispatch Summary — a table showing how folderMode selects both initCompileStrategy and callStrategy, plus the backward-compat inferFolderMode() fallback.
Key Files — quick reference grouped by runtime / server / UI.
Extensibility Notes — how to add asset types, node types, swap vector storage, and merge multiple skills.
The document cross-references the actual source files (e.g. compiler/semanticRetriever.ts, callStrategy.ts, SkillFolderEditorDialog.jsx) so it stays grounded in the current implementation rather than just repeating the requirement docs.
