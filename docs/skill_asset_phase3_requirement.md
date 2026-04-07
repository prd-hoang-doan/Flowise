# Skill Asset Support — Phase 3 Requirement

## Two Execution Modes, Asset Preprocessing Pipeline, and Dynamic Retrieval

**Depends on:** Phase 1 (completed) — image upload, fallback captions, compilation pipeline, UI asset panel.
**Depends on:** Phase 2 (completed) — vision LLM captioning, front matter sync, multi-format assets (PDF/HTML/spreadsheet), regenerate caption, caption model config per folder.

---

## Current State (Phase 1 + Phase 2 Completed)

### What exists today

#### Data Model

| Entity        | Key Fields                                                                   | Purpose                                                 |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `SkillFolder` | `id`, `name`, `color`, `iconSrc`, `description`, `captionModelConfig`        | Organizes skills into folders; stores vision LLM config |
| `SkillFile`   | `id`, `folderId`, `name`, `description`, `content`                           | Markdown skill file with instructions                   |
| `SkillAsset`  | `id`, `folderId`, `fileId`, `filename`, `mimeType`, `storagePath`, `caption` | Uploaded file (image/PDF/etc.) with text caption        |

#### Server Architecture

| Component       | Location                                                        | Responsibility                                                                                               |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Routes          | `packages/server/src/routes/skill-folders/`                     | REST API for folders, files, and assets                                                                      |
| Controllers     | `packages/server/src/controllers/skill-{folders,files,assets}/` | Request handling                                                                                             |
| Services        | `packages/server/src/services/skill-{folders,files,assets}/`    | Business logic, file storage, captioning                                                                     |
| Caption Service | `packages/server/src/services/skill-assets/captionService.ts`   | `generateVisionCaption()`, `generateFallbackCaption()`, `imageToBase64DataUri()`                             |
| SkillTool       | `packages/components/nodes/tools/SkillTool/SkillTool.ts`        | LangChain Tool node; `compileSkillContent()` strips front matter, appends asset captions as "Visual Context" |

#### UI Architecture

| Component                  | Location                                                   | Responsibility                                                                                          |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tools page (Skills tab)    | `packages/ui/src/views/tools/index.jsx`                    | Lists skill folders                                                                                     |
| `SkillFolderDialog`        | `packages/ui/src/views/tools/SkillFolderDialog.jsx`        | Create/edit/delete folder metadata (name, description, color, icon)                                     |
| `SkillFolderEditorDialog`  | `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx`  | Full editor drawer: file sidebar, TipTap markdown editor, asset upload/management, caption model config |
| `CaptionModelInputHandler` | `packages/ui/src/views/tools/CaptionModelInputHandler.jsx` | Renders dynamic input fields for caption model configuration (credentials, model selection, parameters) |
| API clients                | `packages/ui/src/api/skill{folders,files,assets}.js`       | REST client wrappers                                                                                    |

#### Current Compilation Pipeline (Summary Mode Only)

```
SkillTool.init()
  → load SkillFolder + SkillFiles from DB
  → load SkillAssets grouped by fileId
  → for each file: compileSkillContent(file.content, assets)
      → strip YAML front matter
      → append "Visual Context:" bullet list of non-empty asset captions
  → return SkillFileTool[] (LangChain Tool instances)
```

**Current compiled output example:**

```text
You are a podcast strategist.
Generate startup interview concepts.
Use professional tone.

Visual Context:
- Professional interview podcast studio with black microphones and premium lighting
- Startup interview episode samples covering fintech and healthtech verticals
```

#### What is NOT yet done

-   Only **Summary Mode** exists — assets produce text captions only, never sent to LLM as actual content
-   No **Multimodal Mode** — images/PDFs are never passed to the LLM directly
-   No **semantic extraction** or **embedding** of asset content
-   No **dynamic retrieval** — all captions are dumped into the prompt regardless of relevance
-   No **preprocessing pipeline** beyond captioning
-   Asset captions are always **fully appended** — no truncation, no relevance filtering

---

## Phase 3 Goals

1. **Two execution modes** — Summary Mode (cheap, stable) and Multimodal Mode (visual reasoning, document understanding)
2. **Asset preprocessing pipeline** — semantic extraction, structured metadata, optional embeddings
3. **Dynamic retrieval** — at runtime, retrieve only relevant asset context based on user query
4. **Visible value** — show users which assets influenced generation

---

## WI-P3-1: Summary Mode Enhancement (Default Production Mode)

### Problem

Current Summary Mode appends all asset captions unconditionally. With 20+ assets per skill, this bloats the prompt and dilutes signal.

### Design

Enhance the existing `compileSkillContent()` in `SkillTool.ts` to:

1. **Group captions by asset type** (images, documents, data) — continuing from Phase 2's multi-format support
2. **Truncate total asset context** to a configurable `maxAssetContext` (default 2000 chars)
3. **Include structured metadata** — filename, type category, and caption in a consistent format
4. **Structured tool prompt** — produce a clean system message:

```text
Skill: Podcast_Strategist

Instructions:
You are a podcast strategist. Generate startup interview concepts. Use professional tone.

Assets:
Images:
- podcast.jpeg → professional interview podcast studio with black microphones and premium lighting

Documents:
- examples.pdf → startup interview episode samples covering fintech and healthtech verticals
```

### Files to Modify

| File                                                     | Change                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts` | Refactor `compileSkillContent()` to group by type, add truncation, structured format |
| `packages/server/src/Interface.ts`                       | (No changes needed — `mimeType` already exists on `ISkillAsset`)                     |

### Checklist

-   [x] Refactor `compileSkillContent()` to categorize assets by MIME type (image/document/data)
-   [x] Add `maxAssetContext` parameter with 2000 char default
-   [x] Format output as `Skill: {name}` + `Instructions:` + `Assets:` grouped sections
-   [x] Include filename in caption output (`filename → caption`)
-   [x] Truncate long individual captions and total context to `maxAssetContext`
-   [x] Add `executionMode` input param to `SkillTool` node (dropdown: `summary` | `multimodal`, default `summary`)
-   [ ] Unit tests for grouped compilation output

---

## WI-P3-2: Multimodal Mode (Advanced Execution)

### Problem

Summary Mode sends only text captions. For tasks requiring visual reasoning (layout analysis, design review, chart interpretation) or deep document understanding, the LLM needs actual content.

### Design

When `executionMode === 'multimodal'`, the `SkillFileTool._call()` should return a multimodal message payload instead of plain text:

1. **Images** — convert to base64 data URIs and include as `image_url` content parts (reuse `imageToBase64DataUri` from `captionService.ts`)
2. **PDFs/Documents** — include extracted full text (not just summary caption)
3. **Spreadsheets** — include full schema + sample data

The tool return becomes a structured message with text instructions + inline content:

```json
{
    "role": "system",
    "content": [
        { "type": "text", "text": "Skill: Podcast_Strategist\nInstructions:\n..." },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } },
        { "type": "text", "text": "Document: examples.pdf\n<extracted text content>" }
    ]
}
```

### Key Considerations

-   **Token cost** — multimodal payloads can be very large. Add a `maxMultimodalAssets` limit (default 5) and `maxDocumentChars` (default 5000)
-   **Model compatibility** — not all LLMs support vision; gracefully fall back to Summary Mode if the agent's LLM does not support multimodal input
-   **File access at runtime** — `SkillTool` needs access to asset file paths, not just captions. The `storagePath` is already stored on `SkillAsset`

### Files to Modify

| File                                                          | Change                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`      | Add `compileMultimodalContent()`, update `SkillFileTool._call()` to return multimodal payload when mode is set |
| `packages/components/src/Interface.ts`                        | May need to extend tool return types for multimodal content                                                    |
| `packages/server/src/services/skill-assets/captionService.ts` | Export `imageToBase64DataUri` for reuse; add `extractFullDocumentText()`                                       |

### Checklist

-   [ ] Add `executionMode` input parameter to SkillTool node (`summary` | `multimodal`)
-   [ ] Implement `compileMultimodalContent()` in `SkillTool.ts`
-   [ ] For images: read from `storagePath`, convert to base64 data URI, include as `image_url` content part
-   [ ] For PDFs: extract full text (up to `maxDocumentChars`), include as text content part
-   [ ] For spreadsheets: extract full schema + rows (up to `maxDocumentChars`), include as text content part
-   [ ] Add `maxMultimodalAssets` parameter (default 5)
-   [ ] Add `maxDocumentChars` parameter (default 5000)
-   [ ] Graceful fallback to Summary Mode if LLM does not support multimodal
-   [ ] Update `SkillFileTool._call()` to return structured multimodal content
-   [ ] Unit tests for multimodal compilation

---

## WI-P3-3: Asset Preprocessing Pipeline

### Problem

Currently, asset captions are generated at upload time and stored as a single text string. This limits what can be done at runtime:

-   No semantic search over asset content
-   No structured metadata beyond filename + caption
-   No way to selectively retrieve relevant assets

### Design

Add a preprocessing step that runs on asset upload (and can be re-triggered):

```
Asset Upload
  → File storage (existing)
  → Caption generation (existing)
  → Semantic extraction (NEW)
  → Metadata generation (NEW)
  → Optional: Embedding generation (NEW)
```

#### Semantic Extraction

For each asset type, extract structured knowledge:

| Asset Type      | Extraction                                                         |
| --------------- | ------------------------------------------------------------------ |
| **Image**       | Vision caption (existing) + detected objects/themes/colors as tags |
| **PDF**         | Full text extraction + section headings + key entities             |
| **HTML**        | DOM text + metadata (title, description, headings)                 |
| **Spreadsheet** | Column headers + data types + row count + sample values            |

Store extracted data in a new `metadata` JSON column on `SkillAsset`.

#### Schema Change

Add to `SkillAsset` entity:

```typescript
@Column({ nullable: true, type: 'text' })
metadata?: string  // JSON: { tags: string[], sections: string[], entities: string[], fullText?: string }

@Column({ nullable: true, type: 'text' })
embedding?: string  // JSON array of floats (optional, for future vector search)
```

### Files to Modify

| File                                                          | Change                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/server/src/database/entities/SkillAsset.ts`         | Add `metadata` and `embedding` columns                                    |
| `packages/server/src/Interface.ts`                            | Add `metadata?: string` and `embedding?: string` to `ISkillAsset`         |
| `packages/server/src/services/skill-assets/captionService.ts` | Add `extractAssetMetadata()` for each asset type                          |
| `packages/server/src/services/skill-assets/index.ts`          | Call metadata extraction after caption generation in `createSkillAsset()` |
| DB migrations                                                 | New migration for `metadata` and `embedding` columns                      |

### Checklist

-   [ ] Add `metadata` column (`text`, nullable) to `SkillAsset` entity
-   [ ] Add `embedding` column (`text`, nullable) to `SkillAsset` entity
-   [ ] Create DB migrations for all supported databases (postgres, mysql, mariadb, sqlite)
-   [ ] Update `ISkillAsset` interface
-   [ ] Implement `extractImageMetadata()` — tags, themes, colors from vision LLM
-   [ ] Implement `extractDocumentMetadata()` — sections, entities, key phrases from PDF/HTML
-   [ ] Implement `extractSpreadsheetMetadata()` — schema summary, data profile
-   [ ] Wire metadata extraction into `createSkillAsset()` after caption generation
-   [ ] Add `POST /:folderId/assets/:assetId/reprocess` endpoint to re-trigger full preprocessing
-   [ ] Store metadata as JSON string in `SkillAsset.metadata`
-   [ ] Unit tests for each extraction function

---

## WI-P3-4: Dynamic Retrieval at Runtime

### Problem

When a skill has 20+ assets, dumping all captions into the prompt wastes tokens and dilutes relevance. The LLM should receive only the assets relevant to the current user query.

### Design

Add a retrieval step between tool selection and prompt building:

```
User Request
  → Agent decides tool (existing)
  → Skill compiler (existing)
  → Asset resolver (NEW) ← filters assets by relevance to user query
  → Prompt builder (existing, enhanced)
  → LLM tool call (existing)
```

#### Retrieval Strategy (Progressive)

**Phase 3A — Keyword matching (no embeddings required):**

1. Extract keywords from the user's query
2. Match against asset captions + metadata tags
3. Score and rank assets
4. Include top N (configurable, default 5) most relevant assets

**Phase 3B — Embedding-based retrieval (future, optional):**

1. Generate embedding for user query at runtime
2. Cosine similarity against stored asset embeddings
3. Include top N most similar assets

### Integration into SkillTool

The `SkillFileTool._call()` method currently ignores the user's input. To enable retrieval:

1. Modify `_call(input: string)` to accept the user query
2. Use the query to filter/rank assets before compilation
3. Return only relevant asset context

```typescript
async _call(input: string): Promise<string> {
    const relevantAssets = this.retrieveRelevantAssets(input, this.assets)
    return this.compileWithAssets(this.instructions, relevantAssets)
}
```

### Files to Modify

| File                                                     | Change                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts` | Add `retrieveRelevantAssets()`, modify `SkillFileTool` to store all assets and filter at call time |
| `packages/server/src/services/skill-assets/index.ts`     | Add `getAssetsByRelevance(fileId, query)` for server-side retrieval (if needed)                    |

### Checklist

-   [ ] Modify `SkillFileTool` constructor to accept full asset list (not just compiled content)
-   [ ] Change `_call(input)` to use input for retrieval instead of returning static content
-   [ ] Implement `retrieveRelevantAssets()` — keyword-based matching against captions + metadata
-   [ ] Add `maxRetrievedAssets` parameter to SkillTool node (default 5)
-   [ ] Add `retrievalMode` parameter (`all` | `relevant`, default `all` for backward compat)
-   [ ] When `retrievalMode === 'all'`, behave as today (append all captions)
-   [ ] When `retrievalMode === 'relevant'`, run retrieval and include only top N
-   [ ] Unit tests for keyword-based retrieval scoring
-   [ ] Integration test: skill with 20 assets, verify only relevant subset is included

---

## WI-P3-5: Visible Asset Attribution in UI

### Problem

Users expect to see "I uploaded a file, so the system should understand it deeply." If assets work silently behind the scenes, perceived value drops. The system should show which assets influenced generation.

### Design

When a skill tool is invoked during an agent flow execution, include asset attribution metadata in the tool response:

1. **In tool response metadata** — list which assets were used and why
2. **In chat UI** — show a collapsible "Assets Used" section under skill tool responses
3. **In execution logs** — log which assets were retrieved and their relevance scores

#### Tool Response Enhancement

```json
{
    "content": "... compiled skill output ...",
    "metadata": {
        "assetsUsed": [
            { "filename": "brand-guideline.pdf", "reason": "tone alignment", "score": 0.85 },
            { "filename": "landing-page.png", "reason": "visual reference", "score": 0.72 }
        ],
        "executionMode": "summary",
        "totalAssetsAvailable": 12,
        "assetsRetrieved": 3
    }
}
```

### Files to Modify

| File                                                                | Change                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`            | Return metadata alongside content in `SkillFileTool._call()`   |
| `packages/ui/src/views/chatmessage/ChatMessage.jsx` (or equivalent) | Render "Assets Used" accordion in tool response                |
| `packages/server/src/utils/buildAgentflow.ts`                       | Pass-through asset metadata from tool responses to chat output |

### Checklist

-   [ ] Add `metadata` return field to `SkillFileTool._call()` response
-   [ ] Include `assetsUsed` array with filename, reason, and relevance score
-   [ ] Include `executionMode`, `totalAssetsAvailable`, `assetsRetrieved` counts
-   [ ] UI: render "Assets Used" section in chat message for skill tool responses
-   [ ] UI: show asset thumbnails or icons alongside attribution
-   [ ] Log asset retrieval details in execution logs
-   [ ] Unit tests for metadata generation

---

## WI-P3-6: Folder-Level Execution Configuration

### Problem

Execution mode, retrieval settings, and asset limits are per-skill-tool-node today. Users configuring skills in the Tools page should be able to set sensible defaults at the folder level.

### Design

Add execution configuration to `SkillFolder`:

```typescript
@Column({ nullable: true, type: 'text' })
executionConfig?: string
// JSON: {
//   defaultMode: 'summary' | 'multimodal',
//   maxAssetContext: number,
//   maxMultimodalAssets: number,
//   maxDocumentChars: number,
//   retrievalMode: 'all' | 'relevant',
//   maxRetrievedAssets: number
// }
```

The SkillTool node should use these as defaults, overridable by node-level settings.

### Files to Modify

| File                                                      | Change                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/server/src/database/entities/SkillFolder.ts`    | Add `executionConfig` column                                            |
| `packages/server/src/Interface.ts`                        | Add `executionConfig?: string` to `ISkillFolder`                        |
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Add execution config panel (alongside existing caption model settings)  |
| `packages/components/nodes/tools/SkillTool/SkillTool.ts`  | Read folder `executionConfig` as defaults, merge with node-level inputs |
| DB migrations                                             | New migration for `executionConfig` column                              |

### Checklist

-   [ ] Add `executionConfig` column to `SkillFolder` entity
-   [ ] Create DB migrations for all databases
-   [ ] Update `ISkillFolder` interface
-   [ ] UI: add "Execution Settings" collapsible panel in `SkillFolderEditorDialog` (next to "Vision Captioning Model")
-   [ ] UI: fields for defaultMode, maxAssetContext, retrievalMode, maxRetrievedAssets
-   [ ] API: save `executionConfig` via `updateSkillFolder`
-   [ ] SkillTool: load folder's `executionConfig` at `init()`, merge with node inputs
-   [ ] Unit tests for config merge logic (node overrides folder defaults)

---

## Implementation Order

```
WI-P3-1 (Summary Mode Enhancement)
    ↓
WI-P3-2 (Multimodal Mode)
    ↓
WI-P3-3 (Asset Preprocessing Pipeline)
    ↓
WI-P3-4 (Dynamic Retrieval)        ←→  WI-P3-6 (Folder Execution Config)   [parallel]
    ↓
WI-P3-5 (Visible Asset Attribution)
```

-   **WI-P3-1** is the foundation — restructuring the compilation output format
-   **WI-P3-2** builds on WI-P3-1 by adding a second output path
-   **WI-P3-3** provides the data layer for WI-P3-4
-   **WI-P3-4** and **WI-P3-6** can be done in parallel once preprocessing exists
-   **WI-P3-5** depends on WI-P3-4 (needs to know which assets were retrieved)

---

## Priority Ranking

| Priority | Work Item                             | Impact                                      | Effort |
| -------- | ------------------------------------- | ------------------------------------------- | ------ |
| **P0**   | WI-P3-1: Summary Mode Enhancement     | High — immediate quality improvement        | Low    |
| **P0**   | WI-P3-2: Multimodal Mode              | High — unlocks visual reasoning use cases   | Medium |
| **P1**   | WI-P3-4: Dynamic Retrieval            | High — critical for skills with many assets | Medium |
| **P1**   | WI-P3-6: Folder Execution Config      | Medium — better UX for configuration        | Low    |
| **P2**   | WI-P3-3: Asset Preprocessing Pipeline | Medium — enables future capabilities        | High   |
| **P2**   | WI-P3-5: Visible Asset Attribution    | Medium — user trust and perceived value     | Medium |

---

## Dependencies

| Item                        | External Dependency                                                               |
| --------------------------- | --------------------------------------------------------------------------------- |
| Multimodal mode             | Agent's LLM must support vision/multimodal input (e.g. GPT-4o, Claude Sonnet)     |
| Preprocessing pipeline      | Existing caption model config (Phase 2); no new external deps                     |
| Embedding generation (P3-3) | Embedding model (optional, future) — could reuse existing Flowise embedding nodes |
| Dynamic retrieval (keyword) | None — pure text matching                                                         |
| Dynamic retrieval (vector)  | Embedding model + vector similarity library (future phase)                        |

---

## Migration Notes

-   **Backward compatibility** — all new features must default to current behavior (`executionMode: 'summary'`, `retrievalMode: 'all'`)
-   **No breaking changes** — existing skills continue to work identically
-   **Progressive enhancement** — features can be adopted incrementally per folder/skill
-   **DB migrations** — new columns are nullable; existing rows unaffected

---

## Full Checklist Summary

### WI-P3-1: Summary Mode Enhancement

-   [ ] Refactor `compileSkillContent()` to categorize assets by MIME type
-   [ ] Add `maxAssetContext` parameter (default 2000 chars)
-   [ ] Format as `Skill: {name}` + `Instructions:` + `Assets:` grouped sections
-   [ ] Include filename in caption output
-   [ ] Truncate long captions and total context
-   [ ] Add `executionMode` input param to SkillTool node
-   [ ] Unit tests

### WI-P3-2: Multimodal Mode

-   [ ] Implement `compileMultimodalContent()` in SkillTool
-   [ ] Image: base64 data URI as `image_url` content part
-   [ ] PDF: full text extraction up to `maxDocumentChars`
-   [ ] Spreadsheet: full schema + rows up to `maxDocumentChars`
-   [ ] Add `maxMultimodalAssets` parameter (default 5)
-   [ ] Add `maxDocumentChars` parameter (default 5000)
-   [ ] Graceful fallback to Summary Mode for non-multimodal LLMs
-   [ ] Update `SkillFileTool._call()` for multimodal output
-   [ ] Unit tests

### WI-P3-3: Asset Preprocessing Pipeline

-   [ ] Add `metadata` and `embedding` columns to `SkillAsset`
-   [ ] DB migrations (postgres, mysql, mariadb, sqlite)
-   [ ] Update `ISkillAsset` interface
-   [ ] Implement `extractImageMetadata()` (tags, themes, colors)
-   [ ] Implement `extractDocumentMetadata()` (sections, entities)
-   [ ] Implement `extractSpreadsheetMetadata()` (schema, profile)
-   [ ] Wire into `createSkillAsset()` after captioning
-   [ ] Add reprocess endpoint
-   [ ] Unit tests

### WI-P3-4: Dynamic Retrieval

-   [ ] Modify `SkillFileTool` to store asset list and filter at call time
-   [ ] Change `_call(input)` to use query for retrieval
-   [ ] Implement keyword-based `retrieveRelevantAssets()`
-   [ ] Add `maxRetrievedAssets` parameter (default 5)
-   [ ] Add `retrievalMode` parameter (`all` | `relevant`)
-   [ ] Unit tests for retrieval scoring
-   [ ] Integration test with 20+ assets

### WI-P3-5: Visible Asset Attribution

-   [ ] Return `metadata.assetsUsed` from `SkillFileTool._call()`
-   [ ] Include filename, reason, relevance score
-   [ ] UI: "Assets Used" section in chat message
-   [ ] UI: asset thumbnails/icons in attribution
-   [ ] Log retrieval details in execution logs
-   [ ] Unit tests

### WI-P3-6: Folder Execution Config

-   [ ] Add `executionConfig` column to `SkillFolder`
-   [ ] DB migrations
-   [ ] Update `ISkillFolder` interface
-   [ ] UI: "Execution Settings" panel in `SkillFolderEditorDialog`
-   [ ] API: save via `updateSkillFolder`
-   [ ] SkillTool: load folder config as defaults, merge with node inputs
-   [ ] Unit tests for config merge
