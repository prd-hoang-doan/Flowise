# Skill Feature — Frontend Architecture

Scope: `web/app/components/workflow/skill`

The Skill feature is an in-browser IDE-like workspace embedded in a Dify workflow app. It lets a user author a "skill" — a collection of markdown instructions, code, and binary assets organised into a file tree — and edit those files in rich editors with live collaboration, autosave, SQLite preview, sandbox artifacts browsing, and template scaffolding.

This document describes the **frontend** side of the Skill feature. For the backend contract, see `api/core/skill/ARCHITECTURE.md` and `api/core/skill/skill_invocation.md`.

---

## 1. High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ SkillMain (main.tsx)                                                 │
│  └ SkillSaveProvider (save queue, dirty tracking, Ctrl+S, leader sync)│
│     └ SkillAutoSaveManager (flush on unmount / visibilitychange)     │
│     └ SkillPageLayout                                                │
│        ├ Sidebar (resizable)                                         │
│        │   ├ SidebarSearchAdd   (search + add/import menu)           │
│        │   ├ FileTree           (react-arborist virtualised tree)    │
│        │   └ ArtifactsSection   (sandbox outputs, read-only)         │
│        └ ContentArea                                                 │
│           ├ FileTabs            (start tab + open file tabs)         │
│           └ ContentBody                                              │
│              └ ContentRouter →                                       │
│                 ├ ArtifactContentPanel  (isArtifactTab → read-only)  │
│                 └ FileContentPanel                                   │
│                    ├ StartTabContent (create / import / templates)   │
│                    ├ MarkdownFileEditor (Lexical SkillEditor)        │
│                    ├ CodeFileEditor      (Monaco)                    │
│                    ├ MediaFilePreview / PdfFilePreview               │
│                    ├ SQLiteFilePreview   (wa-sqlite in worker)       │
│                    └ UnsupportedFileDownload                         │
└──────────────────────────────────────────────────────────────────────┘
```

Three data sources feed the tree:

| Tree           | Source                                 | Editable |
| -------------- | -------------------------------------- | -------- |
| **Asset tree** | `useGetAppAssetTree` (authored files)  | Yes      |
| **Artifacts**  | `useSandboxFilesTree` (sandbox output) | No       |
| **Start tab**  | `SKILL_TEMPLATES` registry + import    | N/A      |

All skill UI state is kept in the workflow Zustand store under a dedicated **skill-editor slice** (`web/app/components/workflow/store/workflow/skill-editor`). Server state is cached with **TanStack Query**. Live collaboration events are multiplexed through `skillCollaborationManager`.

---

## 2. Tech Stack

-   **Framework**: Next.js (`'use client'` components) + React 19.
-   **Tree**: [`react-arborist`](https://github.com/brimdata/react-arborist) for virtualised rendering, DnD, inline edit, and search.
-   **Markdown editor**: [Lexical](https://lexical.dev/) with custom plugins (`SkillEditor`).
-   **Code editor**: [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) (`CodeFileEditor`).
-   **State**: Zustand (workflow store) + TanStack Query (server cache).
-   **i18n**: `react-i18next`; all user-facing strings come from `web/i18n/en-US/workflow.ts` and `common.ts`.
-   **SQLite preview**: `wa-sqlite` (WebAssembly) running against an in-memory VFS.
-   **Zip handling**: `fflate` for import/template extraction.

---

## 3. Directory Layout

```
skill/
├── main.tsx                        # Top-level orchestrator (SkillMain)
├── constants.ts                    # ROOT_ID, START_TAB_ID, artifact helpers
├── type.ts                         # TreeNodeData, SkillTabType
│
├── skill-body/
│   ├── layout/                     # Page shell (resizable sidebar, content area)
│   ├── sidebar-search-add.tsx      # Search box + "+" menu (new/upload/import)
│   ├── tabs/                       # FileTabs, FileTabItem, StartTabItem
│   └── panels/
│       ├── file-content-panel.tsx  # Editor / preview router for asset files
│       └── artifact-content-panel.tsx  # Read-only preview for sandbox files
│
├── file-tree/
│   ├── tree/                       # react-arborist integration (primary tree)
│   │   ├── file-tree.tsx           # Tree host: DnD orchestration, context menu
│   │   ├── tree-node.tsx           # Row renderer (icon, label, "more" menu)
│   │   ├── tree-node-icon.tsx      # Folder/file icons + dirty dot
│   │   ├── tree-edit-input.tsx     # Inline rename/create input
│   │   ├── tree-guide-lines.tsx    # Indentation guides
│   │   ├── node-menu.tsx           # Dropdown menu for a node
│   │   ├── menu-item.tsx           # Menu primitive
│   │   ├── tree-context-menu.tsx   # Right-click menu host
│   │   ├── drag-action-tooltip.tsx # "Upload to / Move to <path>" overlay
│   │   ├── upload-status-tooltip.tsx
│   │   └── search-result-list.tsx  # Flat search result view
│   └── artifacts/
│       ├── artifacts-section.tsx   # Collapsible "Artifacts" section
│       └── artifacts-tree.tsx      # Plain recursive tree (read-only)
│
├── editor/
│   ├── markdown-file-editor.tsx    # Wrapper around SkillEditor (Lexical)
│   ├── code-file-editor.tsx        # Wrapper around Monaco + cursor overlay
│   ├── skill-editor/               # Lexical editor implementation
│   │   ├── index.tsx               # LexicalComposer + plugin wiring
│   │   ├── plugins/
│   │   │   ├── file-picker-block.tsx        # `/` typeahead → insert file ref
│   │   │   ├── file-picker-panel.tsx        # Tree picker panel
│   │   │   ├── file-picker-upload-modal.tsx # Upload flow inside picker
│   │   │   ├── file-reference-block/        # Inline file-ref decorator node
│   │   │   ├── tool-block/                  # `@` typeahead → tool decorator
│   │   │   └── remote-cursors/              # Collaborative cursor overlay
│   │   └── tool-setting/
│   └── code-editor/
│       └── plugins/remote-cursors.tsx       # Monaco collaborative cursors
│
├── viewer/                         # Non-editable previews
│   ├── read-only-file-preview.tsx  # Router (used by artifacts)
│   ├── read-only-code-preview.tsx
│   ├── read-only-markdown-preview.tsx
│   ├── media-file-preview.tsx      # <img>/<video>
│   ├── pdf-file-preview.tsx
│   ├── unsupported-file-download.tsx
│   └── sqlite-file-preview/        # wa-sqlite table explorer
│
├── start-tab/                      # "Start" tab content
│   ├── index.tsx
│   ├── create-import-section.tsx
│   ├── create-blank-skill-modal.tsx
│   ├── import-skill-modal.tsx
│   ├── skill-templates-section.tsx
│   ├── template-card.tsx / template-search.tsx
│   └── templates/
│       ├── registry.ts             # SKILL_TEMPLATES (lazy `loadContent()`)
│       ├── template-to-upload.ts   # Template tree → batch-upload payload
│       └── skills/*.ts             # Generated template bundles
│
├── hooks/
│   ├── use-skill-save-manager.tsx  # SkillSaveProvider (context + queue)
│   ├── skill-save-context.ts       # useSkillSaveManager hook
│   ├── use-skill-auto-save.ts      # Flush on unmount / visibility / unload
│   ├── use-skill-file-data.ts      # Mode-driven content/download fetch
│   ├── use-file-node-view-state.ts # 'resolving' | 'ready' | 'missing'
│   ├── use-file-type-info.ts       # isMarkdown / isCodeOrText / isPdf ...
│   ├── use-fetch-text-content.ts
│   ├── use-sqlite-database.ts      # wa-sqlite lifecycle
│   ├── sqlite/                     # SQLite constants & types
│   └── file-tree/
│       ├── data/                   # Asset tree + collaboration broadcasts
│       ├── interaction/            # Shortcuts, tab↔tree sync, inline create
│       ├── dnd/                    # External file drop (root/folder/unified)
│       └── operations/             # Create / modify / move / reorder / paste / download
│
└── utils/
    ├── tree-utils.ts               # buildNodeMap, getAncestorIds, isDescendantOf, …
    ├── file-utils.ts               # Extension → language / icon / type booleans
    ├── drag-utils.ts               # isFileDrag / isDragEvent
    ├── skill-upload-utils.ts       # prepareSkillUploadFile
    ├── zip-extract.ts              # Safe unzip with size/path guards
    └── zip-to-upload-tree.ts       # Zip → BatchUploadNodeInput
```

---

## 4. State Management

All client-side skill state lives in a dedicated Zustand slice composed from per-concern sub-slices: see `web/app/components/workflow/store/workflow/skill-editor/`.

```ts
export type SkillEditorSliceShape = TabSliceShape &
    FileTreeSliceShape &
    ClipboardSliceShape &
    DirtySliceShape &
    MetadataSliceShape &
    FileOperationsMenuSliceShape &
    UploadSliceShape &
    ArtifactSliceShape & { resetSkillEditor: () => void }
```

| Slice                        | Responsibility                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- | ---------------- |
| `tab-slice`                  | `openTabIds`, `activeTabId`, `previewTabId`, `editorAutoFocusFileId`, open/close/pin.                       |
| `file-tree-slice`            | `expandedFolderIds`, `selectedTreeNodeId`, `selectedNodeIds`, `pendingCreateNode`, drag state, search term. |
| `clipboard-slice`            | `cut` operation for paste semantics.                                                                        |
| `dirty-slice`                | `dirtyContents: Map<fileId, string>` — in-flight drafts.                                                    |
| `metadata-slice`             | `fileMetadata`, `dirtyMetadataIds` — drives `metadata.files` and `metadata.tools`.                          |
| `file-operations-menu-slice` | Right-click `contextMenu` position/type.                                                                    |
| `upload-slice`               | Aggregated upload progress (`uploading                                                                      | success | partial_error`). |
| `artifact-slice`             | `selectedArtifactPath` for sandbox file selection.                                                          |

Key constants (`constants.ts`):

```14:43:web/app/components/workflow/skill/constants.ts
export const ROOT_ID = 'root' as const
export const START_TAB_ID = '__start__' as const
export const INTERNAL_NODE_DRAG_TYPE = 'application/x-dify-tree-node'

export const ARTIFACT_TAB_PREFIX = 'artifact:' as const
export function isArtifactTab(tabId: string | null): boolean
export function getArtifactPath(tabId: string): string
export function makeArtifactTabId(path: string): string
```

-   `ROOT_ID` is a **UI-only** identifier; it is converted to `null` via `toApiParentId()` before any API call.
-   Tab IDs are either an `AppAssetTreeView.id` (UUID) for editable files, `START_TAB_ID`, or `artifact:<path>` for sandbox artifacts. `ContentRouter` discriminates via `isArtifactTab`.

---

## 5. Entry Point (`main.tsx`)

`SkillMain` is mounted from the workflow page shell. It:

1. Resolves `appId` from the app store.
2. Opens any `?fileId=` deep-link tab exactly once (`openedFileRef`).
3. Mounts `SkillSaveProvider` with that `appId` so every child can enqueue saves.
4. Renders `SkillAutoSaveManager` (a null component that wires global auto-save listeners).
5. Lays out `Sidebar` + `ContentArea` through `SkillPageLayout`.

`ContentRouter` decides per render what to show inside `ContentBody`:

```26:31:web/app/components/workflow/skill/main.tsx
const ContentRouter = () => {
  const activeTabId = useStore(s => s.activeTabId)
  if (isArtifactTab(activeTabId))
    return <ArtifactContentPanel />
  return <FileContentPanel />
}
```

---

## 6. File Tree

### 6.1 Data

`useSkillAssetTreeData` and `useSkillAssetNodeMap` are thin wrappers around `useGetAppAssetTree(appId)`:

```19:37:web/app/components/workflow/skill/hooks/file-tree/data/use-skill-asset-tree.ts
export function useSkillAssetTreeData() {
  const appId = useSkillAppId()
  return useGetAppAssetTree(appId)
}

export function useSkillAssetNodeMap() {
  const appId = useSkillAppId()
  return useGetAppAssetTree(appId, {
    select: (data) => data?.children ? buildNodeMap(data.children) : new Map(),
  })
}
```

The **node map** (`id → AppAssetTreeView`) is a TanStack Query `select`; it is recomputed per data update but shared across subscribers.

### 6.2 Rendering (`file-tree/tree/file-tree.tsx`)

`FileTree` hosts a `react-arborist` `Tree<TreeNodeData>` with:

-   `idAccessor: 'id'`, `childrenAccessor: 'children'`.
-   Row height 24px; width measured via `ahooks/useSize` on the scroll container.
-   `initialOpenState` hydrated from `expandedFolderIds` (Zustand).
-   `handleMove` branches between **reorder** (same parent, insert-line drop) and **move** (folder drop), delegating API calls to `useNodeReorder` / `useNodeMove`.
-   `handleDisableDrop` enforces:
    1. Files are never valid drop targets.
    2. A node cannot drop onto itself.
    3. A folder cannot drop into its own descendant (uses `isDescendantOf`).
-   `searchMatch` filters nodes case-insensitively and always keeps the pending-create draft visible.

Rendering has five mutually exclusive states, chosen in order:

1. `isLoading` → spinner.
2. `error` → error message.
3. Empty tree and no pending create → empty state + drop hint.
4. Search term with zero matches → "no results" + reset button.
5. Search term with matches → `SearchResultList` (flat list with parent path).
6. Otherwise → the virtualised `Tree`.

Below the tree we render either `DragActionTooltip` (while dragging) or `UploadStatusTooltip` (progress/success/error), and always `TreeContextMenu` as a portal.

### 6.3 Tree Node (`tree-node.tsx`)

Every row mirrors two `react-arborist` flags into Zustand so the **tooltip** overlay and **cursor** UI stay in sync:

-   `node.isDragging` → `setCurrentDragType('move' | null)`.
-   `isFolder && node.willReceiveDrop` → `setDragOverFolderId(id | null)`.

Click handling is split between the "main content" (click/double-click for select/preview/pin) and the `…` button (opens `NodeMenu`). Right-click anywhere on the row opens `TreeContextMenu`.

A file node shows a dirty dot (`isDirty`) when `dirtyContents.has(id)`.

### 6.4 Sidebar header (`sidebar-search-add.tsx`)

-   Live-filters the tree by binding `SearchInput` to `fileTreeSearchTerm`.
-   The `+` menu surfaces **New File**, **New Folder**, **Upload File**, **Upload Folder**, **Import Skills** via `useFileOperations`.
-   Target folder is derived from the currently selected node: if a folder is selected, use it; if a file is selected, use its parent; otherwise `ROOT_ID` (`getTargetFolderIdFromSelection`).

### 6.5 Artifacts tree (`file-tree/artifacts/`)

`ArtifactsSection` is a collapsible panel that pulls `useSandboxFilesTree(appId)`. Selecting a file dispatches `selectArtifact(path)` which the `FileTabs` layer turns into an `artifact:<path>` tab. Downloads go through `useDownloadSandboxFile`. The tree is a bespoke recursive component (not react-arborist) because it is read-only and shallow.

### 6.6 Drag & Drop

Two **independent** DnD systems coexist:

| System              | Source            | Handled by                                          |
| ------------------- | ----------------- | --------------------------------------------------- |
| **Internal**        | tree node dragged | react-arborist → `handleMove` / `handleDisableDrop` |
| **External upload** | OS file drag      | `useUnifiedDrag` → `useFileDrop`                    |

External drag:

-   `useRootFileDrop` manages a drag counter (to cope with nested `dragenter`/`dragleave`) and highlights the whole tree when dropping to root.
-   `useFolderFileDrop` adds VSCode-style behaviour on folders: a **blink** after 1 s and **auto-expand** after 2 s, driven by the shared `isDragOver` state in Zustand. It also accepts internal drags for consistency.
-   `useFileDrop.handleDrop` filters out directories (unsupported), calls `prepareSkillUploadFile` for each file, and uploads through `useUploadFileWithPresignedUrl`.
-   After each upload batch, `useSkillTreeUpdateEmitter` broadcasts `emitTreeUpdate(appId)` so peer sessions invalidate the tree query.

### 6.7 Inline Create / Rename

`pendingCreateNode` in the store represents a **draft node** that does not yet exist server-side. `useInlineCreateNode`:

1. Splices the draft into the tree via `insertDraftTreeNode` and expands ancestors.
2. Calls `tree.edit(id)` on the next frame to open the rename input.
3. On commit:
    - Folder → `POST /folders`, emit tree update, toast.
    - File → upload an empty blob with the typed name. If the resulting extension is text-like, auto-open the tab with `autoFocusEditor: true`.
4. On blur/cancel, clears the draft from the store.

Renaming an existing node reuses the same `onRename` via `useRenameAppAssetNode`.

### 6.8 Shortcuts (`use-skill-shortcuts.ts`)

Active only when the focused element is inside `[data-skill-tree-container]` **or** the tree has a selection.

-   `Cmd/Ctrl+X` → `cutNodes(selectedIds)`.
-   `Cmd/Ctrl+V` → dispatch custom event `skill:paste`; `usePasteOperation` listens and moves the cut nodes to the current target folder.

---

## 7. Content Area

### 7.1 Tabs (`skill-body/tabs/`)

-   A **start tab** is always present (`StartTabItem`).
-   Other tabs are derived from `openTabIds`. Each tab displays dirty status (`dirtyContents` or `dirtyMetadataIds`), is "preview" until double-clicked (`pinTab`), and can close with a confirmation dialog when dirty.
-   Artifact tabs resolve their name from the path, not from `nodeMap`.

### 7.2 FileContentPanel (`skill-body/panels/file-content-panel.tsx`)

The editor/preview router for **asset** files. Decision flow:

1. If `activeTabId === START_TAB_ID` → `<StartTabContent />`.
2. If `!fileTabId` → empty hint.
3. Use `useFileNodeViewState` to classify the tab:
    - `resolving`: node map not yet settled after a tab open → spinner.
    - `missing`: node map settled and node absent → "load error".
    - `ready`: proceed.
4. `useFileTypeInfo` classifies the file (markdown / code-or-text / image / video / pdf / sqlite / other).
5. `useSkillFileData(appId, fileTabId, mode)` picks exactly one of `GetAppAssetFileContent` or `GetAppAssetFileDownloadUrl` depending on `fileDataMode`.
6. The returned `fileContent.metadata` is hydrated into the `fileMetadata` slice unless the user has a dirty metadata draft.
7. When editable:
    - Markdown → `<MarkdownFileEditor>` (Lexical).
    - Code/text → `<CodeFileEditor>` (Monaco).
    - `onChange` goes through **`useSkillMarkdownCollaboration` / `useSkillCodeCollaboration`** (see §11) which fan out to `handleEditorChange` for local state and to `skillCollaborationManager` for peers.
8. Edits update:
    - `dirtyContents[fileId]` (or clear it if equal to the server value).
    - `metadata.files`: `updateFileReferenceMetadata` scans for `§[file].[app].[<uuid>]§` tokens and rebuilds `metadata.files` so file references survive rename/move even for nodes not yet in `nodeMap`.
    - `pinTab(fileTabId)` so accidental typing does not close a preview tab.
9. `registerFallback` publishes the current original `{content, metadata}` to `SkillSaveProvider`; on unmount we `saveFileRef.current(fileTabId, fallback)` to guarantee last-write persistence.
10. Non-editable types render one of: `MediaFilePreview`, `SQLiteFilePreview` (lazy), `PdfFilePreview` (lazy), or `UnsupportedFileDownload`.

### 7.3 ArtifactContentPanel

Sandbox files are always read-only. The panel fetches a signed `download_url` via `useSandboxFileDownloadUrl` and hands off to `ReadOnlyFilePreview`, which routes to the same viewers as above.

### 7.4 Start Tab

`StartTabContent` combines `CreateImportSection` and `SkillTemplatesSection`.

-   **Templates** are declared in `start-tab/templates/registry.ts` with a lazy `loadContent()` that dynamic-imports a generated bundle (e.g. `./skills/algorithmic-art.ts`). This keeps the initial bundle small — large templates like `pptx.ts` (~1.4 MB) are only fetched on demand.
-   `useExistingSkillNames` returns root folder names so a template already present is disabled.
-   Selecting a template calls `buildUploadDataFromTemplate` + `useBatchUpload` to materialise it. Upload progress is mirrored in the upload slice.
-   **Import Skill** modal accepts a `.zip`, validates it via `extractAndValidateZip` (size, file count, path traversal, single root folder), converts it with `zip-to-upload-tree.ts`, and batch-uploads.

---

## 8. Editors

### 8.1 Markdown — `SkillEditor` (Lexical)

`editor/skill-editor/index.tsx` composes a Lexical editor with a bespoke set of nodes/plugins:

Registered nodes:

-   `CodeNode` (standard code),
-   `CustomTextNode` (replaces `TextNode` to route paste/typing through Dify's prompt-editor utilities),
-   `ToolGroupBlockNode`, `ToolBlockNode` — inline decorators representing agent tools.
-   `FileReferenceNode` — inline decorator representing a `§[file].[app].[<uuid>]§` token.

Plugins:

-   `RichTextPlugin`, `HistoryPlugin`, `OnChangePlugin`, `OnBlurBlock`, `UpdateBlock` — standard Dify prompt-editor building blocks.
-   `ToolBlock` + `ToolBlockReplacementBlock` + `ToolGroupBlockReplacementBlock` — decorate serialized tool tokens back into UI blocks and register `INSERT_TOOL_BLOCK_COMMAND` / `DELETE_TOOL_BLOCK_COMMAND`.
-   `FileReferenceReplacementBlock` — decorate `§[file]...§` tokens back into `FileReferenceNode`.
-   `FilePickerBlock` (only when `editable`): typeahead triggered by `/` opens `FilePickerPanel` which inserts a `FileReferenceNode`.
-   `ToolPickerBlock` (only when `editable`): `@` typeahead opens the tool picker, scoped by `toolPickerScope`.
-   `LocalCursorPlugin` + `SkillRemoteCursors` — emit local caret info and render remote carets (see §11).
-   `EditorAutoFocusPlugin` — programmatic focus on mount when requested via `editorAutoFocusFileId`.

The serialized text (obtained by joining top-level children's `getTextContent()`) is what we persist, so custom decorator nodes round-trip through `getTextContent()` → `buildToolToken` / `buildFileReferenceToken`.

`MarkdownFileEditor` wraps `SkillEditor` with layout (`overflow-y-auto`), the placeholder ("Press `/` to insert a file, `@` to use tools"), and guards `collaborationEnabled` off in read-only mode.

### 8.2 Code — `CodeFileEditor` (Monaco)

`editor/code-file-editor.tsx`:

-   `language` is inferred from the file name via `getFileLanguage` (`md`, `json`, `yaml`, `js/ts`, `py`, `sql`, …).
-   Theme follows the Dify app theme (`vs-dark` or `light`).
-   On mount we pin the theme and optionally auto-focus.
-   `useSkillCodeCursors({ editor, fileId, enabled })` overlays collaborative cursors and selections (hash-based per-user decorations) on top of the Monaco instance.
-   Non-text config: minimap off, word-wrap on, no unicode-highlight warnings, no sticky-scroll, 13 px font.

Monaco assets are served from `${basePath}/vs` (see `loader.config` in `FileContentPanel`) so the code editor works behind any `basePath`.

### 8.3 Viewers

Under `viewer/`:

-   `MediaFilePreview` — `<img>` / `<video>` via the presigned URL.
-   `PdfFilePreview` — lazy-loaded PDF.js-based viewer.
-   `SQLiteFilePreview` — powered by `useSQLiteDatabase(downloadUrl)` which:
    1. Lazy-imports `wa-sqlite` + `MemoryVFS` once (module-level `Promise`).
    2. Fetches the `.db`/`.sqlite` blob into a typed ArrayBuffer.
    3. Opens it read-only, lists tables, and exposes `queryTable(name, limit)` with an internal LRU-ish cache.
-   `read-only-file-preview.tsx` reuses `useFileTypeInfo` to dispatch to `ReadOnlyMarkdownPreview`, `ReadOnlyCodePreview`, media / pdf / sqlite, or `UnsupportedFileDownload`. This is what artifacts render.

---

## 9. Save Pipeline

### 9.1 SkillSaveProvider

`hooks/use-skill-save-manager.tsx` is a context provider created by `SkillMain`. It exposes:

```ts
type SkillSaveContextValue = {
    saveFile: (fileId: string, options?: SaveFileOptions) => Promise<SaveResult>
    saveAllDirty: () => void
    registerFallback: (fileId: string, entry: FallbackEntry) => void
    unregisterFallback: (fileId: string) => void
}
```

Responsibilities:

-   **Per-file queue**: `queueRef: Map<string, Promise<SaveResult>>`. `saveFile(id)` chains behind the previous promise for the same id so two writes never race.
-   **Snapshot building** (`buildSnapshot`): merges the current draft content, metadata, and a caller-provided fallback (used by `FileContentPanel` unmount cleanup).
-   **Tool-metadata normalization** (`normalizeMetadata`): walks the content with `extractToolConfigIds` and drops any `metadata.tools[id]` entry whose tool is no longer referenced, keeping `tools` in sync with what the editor currently inserts.
-   **Cache write-through**: after the API call succeeds, `patchFileContentCache` updates TanStack Query's `getFileContent` entry so subsequent reads are immediately consistent.
-   **Collaboration leader check**: if collaboration is enabled and we are **not** the leader for this file, emit `skillCollaborationManager.requestSync(fileId)` and skip the write — the leader will persist and broadcast.
-   **Broadcast after save**: when we are the leader, `emitFileSaved(fileId, content, metadata)` pushes the payload to peers; peers patch their cache and clear their dirty flags in `onAnyFileSaved`.
-   **Ctrl/Cmd+S**: a `keydown` listener on `window` saves the active tab and toasts success or failure.

### 9.2 Auto-save (`use-skill-auto-save.ts`)

```ts
useUnmount(() => saveAllDirty())
useEventListener('visibilitychange', () => {
    if (hidden) saveAllDirty()
})
useEventListener('beforeunload', () => saveAllDirty())
```

Together with the per-file unmount save in `FileContentPanel`, this guarantees that closing a tab, hiding the window, or navigating away never silently drops in-flight edits.

### 9.3 Metadata (`metadata` slice)

-   `fileMetadata[fileId]` reflects what will be persisted under the `metadata` key.
-   `dirtyMetadataIds` tracks entries that diverge from the server version.
-   The editor currently populates two keys:
    -   `files`: a snapshot of every `§[file]...§` token found in the content, keyed by `resourceId`, storing the matching `AppAssetTreeView`. This lets a file reference keep its display name even after its target moves or is deleted.
    -   `tools`: metadata for tool-block tokens, normalized on save.

---

## 10. File Operations (`hooks/file-tree/operations/`)

| Hook                   | Responsibility                                                                    |
| ---------------------- | --------------------------------------------------------------------------------- |
| `useFileOperations`    | Orchestrator used by sidebar `+` menu and `NodeMenu`.                             |
| `useCreateOperations`  | New file / folder draft, file/folder uploads (multi-file parallel or batch-tree). |
| `useModifyOperations`  | Rename, delete (closes all descendant tabs + clears drafts).                      |
| `useDownloadOperation` | Single-file download via presigned URL.                                           |
| `useNodeMove`          | Execute move after react-arborist callback.                                       |
| `useNodeReorder`       | Execute reorder (same parent).                                                    |
| `usePasteOperation`    | Handle `skill:paste` custom event from shortcuts.                                 |

Each mutation emits `useSkillTreeUpdateEmitter` on success so peer sessions invalidate their tree query.

`useFileOperations` consolidates these so consumers can destructure the whole API at once.

---

## 11. Collaboration Integration

The Skill feature hooks into the workflow-wide collaboration layer (`web/app/components/workflow/collaboration/`):

-   **Tree updates**: `skillCollaborationManager.emitTreeUpdate(appId)` after every mutation; `useSkillTreeCollaboration` subscribes in `FileTree` and invalidates the `tree` query on receipt.
-   **Markdown collab**: `useSkillMarkdownCollaboration` is invoked from `FileContentPanel` for markdown files. It mediates between Lexical local `onChange`, CRDT-style sync to peers, and a leader-sync fallback that calls `saveFile` to persist.
-   **Code collab**: `useSkillCodeCollaboration` does the same for Monaco, driving `CodeFileEditor`'s `onChange`.
-   **Remote cursors**:
    -   Lexical: `LocalCursorPlugin` maps Lexical selections to absolute text offsets (via `buildTextOffsetMap`) and publishes throttled updates; `SkillRemoteCursors` resolves other users' offsets back to DOM coordinates to render carets and selection rectangles.
    -   Monaco: `useSkillCodeCursors` uses Monaco's decorations API to paint per-user selections (colour derived from `getUserColor`) and an absolute-positioned caret overlay.
-   **Save coordination**: `SkillSaveProvider` consults `skillCollaborationManager.isLeader(fileId)` before writing and re-emits `onAnyFileSaved` to reconcile peer state (clearing dirty flags when payloads match).

Collaboration is gated by `useGlobalPublicStore(s => s.systemFeatures.enable_collaboration_mode)`; when disabled, the editors behave as single-user and all collab hooks early-return.

---

## 12. Data Flow — "Edit a markdown file"

```
User types in MarkdownFileEditor
  └ Lexical OnChangePlugin fires handleEditorChange(text)
     └ useSkillMarkdownCollaboration.handleCollaborativeChange(text)
        ├ broadcast to peers via skillCollaborationManager
        └ call onLocalChange → FileContentPanel.handleEditorChange
           ├ dirtyContents.set(fileId, newText)   (or clear if equal)
           ├ updateFileReferenceMetadata(newText) → setDraftMetadata
           └ pinTab(fileId)

Ctrl+S  (or tab close, visibility, unmount, beforeunload)
  └ SkillSaveProvider.saveFile(fileId, fallback?)
     ├ queue behind previous save for this file
     ├ leader check (if collab is on)
     ├ buildSnapshot + normalizeMetadata
     ├ useUpdateAppAssetFileContent.mutateAsync(...)
     ├ patchFileContentCache (TanStack Query)
     ├ clearDraftContent / clearDraftMetadata if still equal
     └ skillCollaborationManager.emitFileSaved(payload)
```

---

## 13. Conventions & Invariants

-   **Client ids vs server ids**: UI uses `ROOT_ID = 'root'`; never send it to the API. Always go through `toApiParentId()`.
-   **Tab id namespaces**: asset file UUIDs, `START_TAB_ID`, and `artifact:<path>` must stay disjoint. Use `isArtifactTab()` / `makeArtifactTabId()` helpers — do not hand-roll string checks.
-   **Drafts**: every in-flight edit is keyed by `fileId` in `dirtyContents` / `fileMetadata`. Closing a tab without saving deliberately clears the draft; the save provider's unmount hook is the last line of defence.
-   **Fallbacks**: every editor mount registers a fallback with `SkillSaveProvider` so unmount saves can still persist even if the TanStack Query cache has been invalidated.
-   **Tree mutations** must call `emitTreeUpdate()` after success. Failing to do so will desynchronise peer sessions until the next manual refetch.
-   **DnD separation**: never mix internal (react-arborist) and external (OS file) drag handlers on the same DOM node without going through `isFileDrag` / `isDragEvent` first — the two event streams are deliberately routed into different hooks.
-   **i18n**: every user-facing string lives under `skill*` / `skillSidebar*` / `skillEditor*` keys in `web/i18n/en-US/workflow.ts` (plus `promptEditor.*` for editor placeholders in `common.ts`). Do not hard-code copy.
-   **Types**: tree nodes use `AppAssetTreeView` (aliased as `TreeNodeData`); sandbox files use `SandboxFileTreeNode`. They are not interchangeable.

---

## 14. Extending the Module

-   **New file type** (editable): add the extension to `isTextLikeFile` or `CODE_EXTENSIONS` in `utils/file-utils.ts`, and a language mapping in `getFileLanguage`. Non-editable types: add to the relevant `is*File` set and implement a viewer, then extend `useFileTypeInfo` and the router in `FileContentPanel` / `read-only-file-preview`.
-   **New tree action**: add an operation hook under `hooks/file-tree/operations/`, expose it through `useFileOperations`, then render it in `NodeMenu` and/or `SidebarSearchAdd`. Remember to call `emitTreeUpdate()` on success.
-   **New editor plugin**: drop it under `editor/skill-editor/plugins/` and register any new Lexical nodes in the `initialConfig.nodes` array in `skill-editor/index.tsx`.
-   **New skill template**: add the bundle to `start-tab/templates/skills/` and register it in `start-tab/templates/registry.ts` (keep `loadContent` lazy).
-   **New collaboration surface**: follow the pattern of `useSkillMarkdownCollaboration` — mediate local `onChange`, peer broadcast, and `onLeaderSync → saveFile` — and gate on `systemFeatures.enable_collaboration_mode`.

---

## 15. Testing Notes

-   Most interactive hooks and components have colocated `*.spec.tsx` files under the same folder; for example: `file-tree.spec.tsx`, `use-skill-save-manager.spec.tsx`, `use-file-drop.spec.tsx`, `sidebar-search-add.spec.tsx`.
-   New tests must comply with the `frontend-testing` skill (`web/docs/test.md`): Vitest + RTL, Arrange–Act–Assert, real store composition rather than mocks where possible.
-   When adding or changing state or API-integration hooks, update the corresponding `.spec` alongside the implementation.
