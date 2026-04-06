# Skill Asset Support — Phase 2 Plan

## Vision LLM Captioning, Front Matter Sync, and Multi-Format Assets

**Depends on:** Phase 1 (completed) — image upload, fallback captions, compilation pipeline, UI asset panel.

---

## Goals

1. **Auto-caption images using a vision LLM** — replace filename-based fallback with semantically rich captions
2. **Sync front matter `assets:` references** — auto-insert/remove asset filenames in YAML front matter when uploading or deleting
3. **Support PDF, HTML, and spreadsheet assets** — extend the pipeline to extract text summaries from non-image file types
4. **Regenerate captions on demand** — allow users to re-trigger captioning from the UI

---

## WI-P2-1: Vision LLM Auto-Captioning

### Problem

Phase 1 generates captions from filenames (e.g. `Image: hero banner`). These provide minimal semantic value to the LLM at tool invocation time.

### Design

Add a `generateVisionCaption()` function to `captionService.ts` that:

1. Reads the image from disk and converts to base64 data URI (already implemented: `imageToBase64DataUri`)
2. Sends a single-turn vision LLM request with the image and a system prompt:
    > "Describe this image in one concise sentence for use as context in an AI tool prompt."
3. Returns the generated caption string
4. Falls back to `generateFallbackCaption()` if no vision model is configured or the call fails

### Integration Points

-   **Caption model selection** — add a workspace-level or folder-level setting `captionModelId` that references a configured Chat Model credential. If unset, use fallback.
-   **Trigger on upload** — call `generateVisionCaption()` in `createSkillAsset()` after file storage, before DB insert
-   **Trigger on demand** — new API endpoint `POST /:folderId/assets/:assetId/regenerate-caption`

### Files to Modify

| File                                                          | Change                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/server/src/services/skill-assets/captionService.ts` | Add `generateVisionCaption()` using LangChain chat model with vision      |
| `packages/server/src/services/skill-assets/index.ts`          | Call vision captioning in `createSkillAsset()`; add `regenerateCaption()` |
| `packages/server/src/controllers/skill-assets/index.ts`       | Add `regenerateCaption` handler                                           |
| `packages/server/src/routes/skill-folders/index.ts`           | Add `POST /:folderId/assets/:assetId/regenerate-caption` route            |

### Checklist

-   [ ] Implement `generateVisionCaption()` in `captionService.ts`
-   [ ] Add workspace/folder-level `captionModelId` setting lookup
-   [ ] Wire vision captioning into `createSkillAsset()` with fallback
-   [ ] Add `regenerateCaption` service method
-   [ ] Add `regenerateCaption` controller + route
-   [ ] Add UI "Regenerate caption" button per asset in `SkillFolderEditorDialog.jsx`
-   [ ] Add `regenerateCaption` to `packages/ui/src/api/skillassets.js`

---

## WI-P2-2: Auto-Sync Front Matter `assets:` References

### Problem

In Phase 1, users must manually add `assets:` references to their YAML front matter. This is error-prone and adds friction.

### Design

When an asset is uploaded or deleted for a skill file:

1. Read the current skill file content
2. Parse the front matter
3. Add or remove the asset filename in the `assets:` array
4. Write the updated content back to the skill file
5. Trigger the editor to reload if open

### Integration Points

-   **On upload** — after `createSkillAsset()` succeeds, call `syncFrontMatterAssets(fileId)`
-   **On delete** — after `deleteSkillAsset()` succeeds, call `syncFrontMatterAssets(fileId)`
-   **Editor reload** — the UI should re-fetch file content when switching back to the Source tab from Assets tab

### Files to Modify

| File                                                      | Change                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/server/src/services/skill-files/index.ts`       | Add `syncFrontMatterAssets(fileId, workspaceId)` — reads file, updates `assets:` array, saves |
| `packages/server/src/services/skill-assets/index.ts`      | Call `syncFrontMatterAssets` after create/delete                                              |
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Reload file content when switching from Assets to Source tab                                  |

### Checklist

-   [ ] Implement `syncFrontMatterAssets()` in skill-files service
-   [ ] Implement `buildFrontMatter()` helper to serialize YAML front matter
-   [ ] Call sync after asset upload in `createSkillAsset()`
-   [ ] Call sync after asset delete in `deleteSkillAsset()`
-   [ ] Reload editor content in UI when switching back to Source tab after asset changes
-   [ ] Handle edge case: file has no existing front matter (create one)

---

## WI-P2-3: PDF Asset Support

### Design

Extend `ALLOWED_MIME_TYPES` to include `application/pdf`.

For PDF files, extract a text summary instead of an image caption:

1. Use an existing PDF text extraction library (e.g. `pdf-parse` already available in `flowise-components`)
2. Extract the first N characters (configurable, default 500) as the asset context
3. Store the extracted text in `SkillAsset.caption`

### Files to Modify

| File                                                          | Change                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/server/src/services/skill-assets/index.ts`          | Add `application/pdf` to `ALLOWED_MIME_TYPES`; route to PDF extractor |
| `packages/server/src/services/skill-assets/captionService.ts` | Add `extractPdfSummary(filePath, maxChars)`                           |

### Checklist

-   [ ] Add `application/pdf` to allowed MIME types
-   [ ] Implement `extractPdfSummary()` using `pdf-parse`
-   [ ] Route PDF files to summary extraction in `createSkillAsset()`
-   [ ] Update UI to accept PDF in file input (`accept` attribute)
-   [ ] Show PDF icon instead of thumbnail for PDF assets
-   [ ] Update "Visual Context" label to "Asset Context" in compilation pipeline

---

## WI-P2-4: HTML Asset Support

### Design

Extend `ALLOWED_MIME_TYPES` to include `text/html`.

For HTML files, extract a DOM text summary:

1. Parse HTML and extract text content (strip tags)
2. Truncate to first N characters (default 500)
3. Store as caption

### Files to Modify

| File                                                          | Change                                       |
| ------------------------------------------------------------- | -------------------------------------------- |
| `packages/server/src/services/skill-assets/index.ts`          | Add `text/html` to `ALLOWED_MIME_TYPES`      |
| `packages/server/src/services/skill-assets/captionService.ts` | Add `extractHtmlSummary(filePath, maxChars)` |

### Checklist

-   [ ] Add `text/html` to allowed MIME types
-   [ ] Implement `extractHtmlSummary()` — read file, strip tags, truncate
-   [ ] Route HTML files to summary extraction in `createSkillAsset()`
-   [ ] Update UI file input accept list
-   [ ] Show HTML icon for HTML assets

---

## WI-P2-5: Spreadsheet Asset Support

### Design

Extend `ALLOWED_MIME_TYPES` to include spreadsheet formats:

-   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx)
-   `text/csv`

For spreadsheets, extract schema summary:

1. Read sheet names and column headers
2. Include first few rows as sample data
3. Format as structured text

### Files to Modify

| File                                                          | Change                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/server/src/services/skill-assets/index.ts`          | Add spreadsheet MIME types                                    |
| `packages/server/src/services/skill-assets/captionService.ts` | Add `extractSpreadsheetSummary()` using `xlsx` or `csv-parse` |

### Checklist

-   [ ] Add xlsx and csv MIME types to allowed list
-   [ ] Implement `extractSpreadsheetSummary()` — extract headers + sample rows
-   [ ] Route spreadsheet files to summary extraction
-   [ ] Update UI file input accept list
-   [ ] Show spreadsheet icon for spreadsheet assets

---

## WI-P2-6: Compilation Pipeline Enhancements

### Changes

-   Rename "Visual Context" to "Asset Context" in `compileSkillContent()` to reflect multi-format support
-   Group asset context by type (images, documents, data) for clearer LLM consumption
-   Add optional `maxAssetContext` parameter to limit total injected context size

### Example compiled output (Phase 2)

```text
Generate marketing copy for products, services, or campaigns.

Asset Context:

Images:
- Minimal luxury advertisement layout with white background and premium gold typography.
- Close-up product shot on marble surface with soft lighting.

Documents:
- Brand guidelines document covering tone of voice, color palette, and typography standards. Key points: formal tone, gold/white color scheme, serif fonts preferred.

Data:
- Product catalog with columns: SKU, Name, Price, Category. Sample: SKU-001, "Gold Watch", $2499, Luxury Accessories.
```

### Checklist

-   [ ] Rename "Visual Context" to "Asset Context" in `SkillTool.ts`
-   [ ] Group captions by asset MIME type category
-   [ ] Add `maxAssetContext` truncation (default 2000 chars)
-   [ ] Update compilation test cases

---

## Implementation Order

```
WI-P2-1 (Vision LLM Captioning)
    ↓
WI-P2-2 (Front Matter Sync)
    ↓
WI-P2-3 (PDF) ←→ WI-P2-4 (HTML) ←→ WI-P2-5 (Spreadsheet)   [parallel]
    ↓
WI-P2-6 (Compilation Pipeline Enhancements)
```

WI-P2-1 and WI-P2-2 are highest priority as they complete the deferred Phase 1 items. WI-P2-3 through WI-P2-5 can be implemented independently in parallel. WI-P2-6 ties everything together.

---

## Dependencies

| Item                   | External Dependency                                                      |
| ---------------------- | ------------------------------------------------------------------------ |
| Vision captioning      | A configured Chat Model with vision support (e.g. GPT-4o, Claude Sonnet) |
| PDF extraction         | `pdf-parse` (already in `flowise-components` dependencies)               |
| HTML extraction        | None (built-in string processing)                                        |
| Spreadsheet extraction | `xlsx` or `csv-parse` package                                            |
