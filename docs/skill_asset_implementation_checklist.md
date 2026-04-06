# Skill Asset Support — Phase 1 Implementation Checklist

## Overview

Phase 1 adds **image asset support** to markdown-based skills. Users can upload images into skill folders, reference them via YAML front matter, and have captions auto-generated for LLM context injection.

See [skill_enhancement.md](./skill_enhancement.md) for the full proposal.

---

## WI-1: SkillAsset Entity + Migration

-   [x] Create `ISkillAsset` interface in `packages/server/src/Interface.ts`
-   [x] Create `SkillAsset` entity in `packages/server/src/database/entities/SkillAsset.ts`
-   [x] Create migration `1768000000000-AddSkillAsset` for sqlite
-   [x] Create migration `1768000000000-AddSkillAsset` for mysql
-   [x] Create migration `1768000000000-AddSkillAsset` for postgres
-   [x] Create migration `1768000000000-AddSkillAsset` for mariadb
-   [x] Register entity in TypeORM DataSource configs
-   [x] Register entity in `databaseEntities` map

## WI-2: Asset Upload API

-   [x] Create service `packages/server/src/services/skill-assets/index.ts`
-   [x] Create controller `packages/server/src/controllers/skill-assets/index.ts`
-   [x] Add asset routes to `packages/server/src/routes/skill-folders/index.ts`
    -   `POST /:folderId/files/:fileId/assets` — upload image
    -   `GET /:folderId/files/:fileId/assets` — list assets
    -   `GET /:folderId/assets/:assetId` — serve asset
    -   `DELETE /:folderId/assets/:assetId` — delete asset

## WI-3: Extend Front Matter Parsing

-   [x] Update `extractFrontMatter()` in `packages/server/src/services/skill-files/index.ts` to parse `assets:` array
-   [x] Return `{ name, description, assets: string[] }` from parser

## WI-4: Caption Generation Service

-   [x] Create `packages/server/src/services/skill-assets/captionService.ts`
-   [ ] Implement vision LLM captioning strategy (deferred to Phase 2)
-   [x] Implement fallback strategy (filename-based caption)
-   [x] Trigger caption on asset upload
-   [x] Store caption in `SkillAsset.caption`

## WI-5: Skill Compilation Pipeline

-   [x] Modify `getTools()` in `packages/components/nodes/tools/SkillTool/SkillTool.ts`
-   [x] Parse front matter → strip from body
-   [x] Resolve assets → query `SkillAsset` records by folderId
-   [x] Collect captions → build "Visual Context" section
-   [x] Compile final tool content (body + visual context)

## WI-6: UI — Asset Upload Panel

-   [x] Create API client `packages/ui/src/api/skillassets.js`
-   [x] Add "Assets" tab to `SkillFolderEditorDialog.jsx`
-   [x] Implement drag-and-drop image upload
-   [x] Show thumbnail grid with captions
-   [x] Allow caption editing
-   [x] Allow asset deletion
-   [ ] Auto-insert `assets:` references into front matter on upload (deferred)

## WI-7: Integration & Verification

-   [x] Verify build passes (`pnpm build`)
-   [ ] Verify dev server starts (`pnpm dev`)
-   [ ] Test asset upload end-to-end
-   [ ] Test skill compilation with assets
-   [ ] Test skill tool invocation returns compiled content with captions
