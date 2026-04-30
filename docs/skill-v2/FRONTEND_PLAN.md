# Skill v2 — Frontend Implementation Plan (Dify-Style Tree Authoring)

> Scope: design the **frontend** for the Skill v2 feature, consuming the
> `/api/v1/skills-v2/**` REST surface documented in `docs/skill-v2/PLAN.md`
> (already implemented — see PLAN.md §Appendix B).
>
> Reference architectures:
>
> -   Dify skill authoring UI (`docs/dify_project/dify_front_end_ARCHITECTURE.md`).
> -   Current Flowise v1 Skills tab (`packages/ui/src/views/tools/index.jsx`).
> -   Current Flowise v1 editor drawer (`packages/ui/src/views/tools/SkillFolderEditorDialog.jsx`).
>
> **Hard constraints (user-supplied)**
>
> 1. **Do not modify** the legacy v1 Skills tab, its dialogs, its API modules or
>    its cards. v2 must live side-by-side as a **new tab** in the same Tools
>    page: `Custom Tools | Custom MCP Servers | Skills | Skills V2`.
> 2. v2 authoring must match **Dify's file-tree model**: folders + files
>    (`md` / `txt` / `json` / `csv` / `py` / `js` / `pdf` / `png` / …) inside a
>    single skill, all persisted through the backend's `fileTree` JSON column
>    (§3.3 of PLAN.md).
> 3. The authored artifact is still a **Markdown file** (the skill prompt lives
>    in one or more `.md` nodes of the tree). Everything else is supporting
>    context.
> 4. Build on v1's UX idioms where it helps (TipTap markdown editor, Drawer
>    layout, toolbar with name/icon/color/Save/Delete/Close) but adopt Dify's
>    tree-first navigation for hierarchical files.
> 5. No feature flag — the new "Skills V2" tab is always visible. It is tagged
>    as "Preview" in the UI copy until Phase C ships.

---

## Table of Contents

1. [Design Goals](#1-design-goals)
2. [Concept Mapping: Dify Frontend → Flowise Frontend](#2-concept-mapping-dify-frontend--flowise-frontend)
3. [Tab Integration](#3-tab-integration-in-toolsindexjsx)
4. [Directory Layout](#4-directory-layout--new-files)
5. [API Client Layer](#5-api-client-layer)
6. [Component Architecture](#6-component-architecture)
7. [State Management](#7-state-management)
8. [File Tree UX](#8-file-tree-ux)
9. [Editor Panels per File Kind](#9-editor-panels-per-file-kind)
10. [Placeholder Insertion Helpers](#10-placeholder-insertion-helpers-tool--file-references)
11. [Publish / Bundle / Dependencies UX](#11-publish--bundle--dependencies-ux)
12. [Validation & Error Surfacing](#12-validation--error-surfacing)
13. [Permissions & RBAC](#13-permissions--rbac)
14. [Phased Rollout](#14-phased-rollout)
15. [Testing Strategy](#15-testing-strategy)
16. [Open Questions / Design Decisions](#16-open-questions--design-decisions)
17. [Appendix A — Example User Flows](#appendix-a--example-user-flows)

---

## 1. Design Goals

| Goal                              | How the v2 UI achieves it                                                                                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dify-style authoring**          | File-tree-first navigation: a single skill holds many files and folders, users navigate a virtualised tree, click any file to open a purpose-built viewer/editor.                                                                                                       |
| **Markdown-first output**         | `.md` nodes open in the same TipTap/Markdown editor v1 uses (with TipTap starter-kit + code-block-lowlight + Markdown extension). The compiled/resolved output is viewable via the Preview tab and via the "draft bundle" mode.                                         |
| **Zero collision with v1**        | All new files live under `packages/ui/src/views/skills-v2/` and `packages/ui/src/api/skillsv2.js`. No existing file is renamed or removed. Only `tools/index.jsx` gains one additional tab body.                                                                        |
| **Reuse what's portable from v1** | Reuse `MainCard`, `ItemCard`, `ViewHeader`, `PermissionButton`, `StyledPermissionButton`, `TablePagination`, `ConfirmDialog`, `Dropdown`, snackbar helpers, theme tokens. Re-skin v1's editor scaffold rather than introducing Lexical/Monaco (keeps bundle size flat). |
| **Match the backend API 1:1**     | Every route in `packages/server/src/routes/skills-v2/index.ts` has a matching client function in `@/api/skillsv2`. No hidden endpoint fan-out in components.                                                                                                            |
| **Local-first draft state**       | Mirror v1: autosave with 1.5 s debounce on the active file; confirm-on-close when dirty; per-file dirty indicator in the tree. No cross-file/collaborative CRDT in v1 — keep parity.                                                                                    |
| **Predictable publish model**     | Explicit "Publish" button in the header. UI never silently republishes. Draft bundle is accessible via the Preview/Dependencies tabs with `mode=draft`.                                                                                                                 |
| **Readable dependency insight**   | A Dependencies tab renders the bundle's `dependencyGraph` and per-node tool/file deps as a lightweight adjacency list view (Phase B) and optionally ReactFlow graph in Phase E. No need to import the full `reactflow` canvas for the MVP.                              |

Non-goals (explicitly excluded):

-   Real-time multi-user collaboration (no `skillCollaborationManager`).
-   Monaco-based code editor for `.py` / `.js` (use a lightweight textarea with
    monospaced font + basic highlighting via `lowlight` under fenced code).
-   SQLite preview, PDF viewer, wa-sqlite, Lexical. PDFs/binaries are
    download-only. Images render via presigned asset URL.
-   Start-tab "template gallery" (deferred to a later phase).

---

## 2. Concept Mapping: Dify Frontend → Flowise Frontend

| Dify FE concept                              | Flowise v2 FE equivalent                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkillMain` orchestrator                     | `SkillV2Workspace.jsx` (tab body) + `SkillV2EditorDrawer.jsx` (open-per-skill drawer)                                                                                                                                                                                                                             |
| `SkillSaveProvider` context                  | Local hook `useSkillV2Autosave(skillId, nodeId)` using `useCallback` + `setTimeout(1500)` debounce (same idiom as v1's `autoSave` in `SkillFolderEditorDialog`)                                                                                                                                                   |
| `AppAssetFileTree`                           | `SkillV2.fileTree` JSON (§3.3 of PLAN.md) — stored as a flat array of `{ id, node_type, name, parent_id, order, extension, size }` nodes                                                                                                                                                                          |
| `react-arborist` virtualised tree            | `SkillV2FileTree.jsx`, built on a small custom recursive component backed by `@mui/material/List` (see §8.2). **We intentionally avoid introducing `react-arborist` to the FE bundle**; skills are small (soft cap 200 MiB, which is ~hundreds of files, not tens of thousands) so virtualisation is unnecessary. |
| `FileContentPanel` router                    | `SkillV2ContentRouter.jsx` — dispatches on extension (`md` → markdown editor, `txt/json/csv/yaml` → plain-text editor, `py/js/ts` → code editor, `png/jpg/jpeg/gif/webp` → media preview, `pdf` → download, other → download)                                                                                     |
| Lexical `SkillEditor` with typeahead plugins | `SkillV2MarkdownEditor.jsx` — TipTap editor (same stack v1 already ships) with two **insertion toolbars** for tool refs (`{{tool.*}}`) and file refs (`{{skill.<nodeId>}}`). No typeahead plugin — dropdown menu + file picker dialog.                                                                            |
| `ArtifactContentPanel` (sandbox outputs)     | Not applicable — Flowise has no sandbox artifacts to show                                                                                                                                                                                                                                                         |
| `StartTabContent`                            | A small **empty-state** panel shown when the skill has no files yet: "Create your first file" + quick-create buttons for `.md`, `.txt`, `.py`.                                                                                                                                                                    |
| `skillCollaborationManager`                  | Not applicable in this release                                                                                                                                                                                                                                                                                    |
| `useSkillSaveManager` with per-file queue    | Kept simple: a ref to the last debounce timer + a promise for the in-flight save. One file at a time is the active edit, matches v1 behaviour.                                                                                                                                                                    |
| `SKILL_TEMPLATES` registry                   | **Deferred.** Initial cut has no templates. A "Copy from existing skill" action is sufficient.                                                                                                                                                                                                                    |
| `toApiParentId(ROOT_ID)`                     | Same idea: use `null` as the wire representation of "root"; a JS constant `SKILL_V2_ROOT_ID = 'root'` is used UI-side only.                                                                                                                                                                                       |
| TanStack Query cache                         | Not used — v1 relies on `useApi` from `@/hooks/useApi` + local state. v2 follows the same convention to stay consistent across the Tools page.                                                                                                                                                                    |

---

## 3. Tab Integration (in `tools/index.jsx`)

The fourth tab already exists at `packages/ui/src/views/tools/index.jsx:586`.
This plan only adds the **tab body** for `tabValue === 3`. **Line 585–590 is
the only area that needs modification in `tools/index.jsx`.** The change is
surgical and reviewer-friendly.

### 3.1 Minimal additions to `tools/index.jsx`

```1:3:packages/ui/src/views/tools/index.jsx
// (existing imports)
```

Add the following at the top of the file alongside existing imports:

```jsx
// New v2 imports (add, do not remove any existing import)
import SkillV2Workspace from '@/views/skills-v2/SkillV2Workspace'
```

Add a search-placeholder branch in the existing `searchPlaceholder` ternary:

```jsx
searchPlaceholder={
    tabValue === 0 ? 'Search Tools'
    : tabValue === 1 ? 'Search Custom MCP Servers'
    : tabValue === 2 ? 'Search Skill Folders'
    : 'Search Skills V2'
}
```

Add the tab-body render after `{tabValue === 2 && renderSkillsTab()}`:

```jsx
{
    tabValue === 3 && <SkillV2Workspace search={search} />
}
```

Everything else in the new tab's workflow — list, card, create dialog, editor
drawer, publish flow — lives inside `SkillV2Workspace` and its children, so
the existing `Tools` component stays lean.

### 3.2 What stays untouched

-   `SkillFolderDialog.jsx`, `SkillFolderEditorDialog.jsx`, `SkillNodeGraph.jsx`
    are **read-only reference material** — not imported by v2, not renamed,
    not modified.
-   `skillfolders.js`, `skillfiles.js`, `skillassets.js` API modules untouched.
-   `SkillFolderCard.jsx` untouched.
-   v1 tab body (`renderSkillsTab`) keeps its existing behaviour.

---

## 4. Directory Layout — New Files

All new frontend files live under a single top-level directory under the UI
package (no collisions with the `skill-v2` used in the server package).

```
packages/ui/src/
├── api/
│   └── skillsv2.js                     # NEW — REST client for /api/v1/skills-v2
├── views/skills-v2/                    # NEW module (mirrors legacy views/tools structure)
│   ├── SkillV2Workspace.jsx            # Tab body (list + "Create" button + card grid)
│   ├── SkillV2CreateDialog.jsx         # Small modal: name/description/color/icon, creates the row
│   ├── SkillV2EditorDrawer.jsx         # Main drawer — hosts tree + content router + toolbar
│   ├── SkillV2FileTree.jsx             # Recursive tree (folders + files), inline rename, context menu
│   ├── SkillV2FileTreeNode.jsx         # Row renderer (icon per extension, dirty dot, menu)
│   ├── SkillV2ContentRouter.jsx        # Switch-by-extension: markdown / text / code / media / binary
│   ├── SkillV2MarkdownEditor.jsx       # TipTap-based editor (ported from v1, simplified)
│   ├── SkillV2CodeEditor.jsx           # Plain textarea + monospaced font + language hint
│   ├── SkillV2MediaViewer.jsx          # <img>/<video> via /download endpoint (blob URL)
│   ├── SkillV2BinaryViewer.jsx         # Download-only card for pdf/zip/unknown
│   ├── SkillV2PreviewPanel.jsx         # Right-hand preview: compiled markdown via draft bundle
│   ├── SkillV2DependenciesPanel.jsx    # Tool/file deps list (uses /dependencies endpoint)
│   ├── SkillV2PublishBar.jsx           # Publish button, bundleId, last built, validate button
│   ├── SkillV2UploadDialog.jsx         # Multipart upload for binaries + drag/drop root
│   ├── SkillV2DeleteConfirm.jsx        # Small confirm modal (reuses ConfirmDialog)
│   ├── SkillV2Settings.jsx             # Name/description/icon/color form (shown via toolbar)
│   ├── constants.js                    # SKILL_V2_ROOT_ID, EXT_KIND_MAP, ICON_MAP
│   ├── utils/
│   │   ├── treeUtils.js                # buildNodeMap, childrenOf, pathOf, isAncestor, flattenForSearch
│   │   ├── extUtils.js                 # classifyExtension, isMarkdown/Text/Code/Image/Binary
│   │   ├── placeholderUtils.js         # buildToolPlaceholder, buildSkillPlaceholder, scanPlaceholders
│   │   └── nameValidator.js            # validateFileName, validateFolderName (same rules as backend)
│   └── README.md                       # Pointer to this plan
├── ui-component/cards/
│   └── SkillV2Card.jsx                 # NEW — card for the workspace grid (like SkillFolderCard)
└── store/context/ (none needed)
```

No changes to redux, routing, hooks, or theme files.

### 4.1 Dependency budget

Zero new npm dependencies. We reuse everything v1 already has:

-   `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-placeholder`, `@tiptap/extension-code-block-lowlight` — all already in v1's editor.
-   `react-markdown`, `remark-gfm` — already in v1.
-   `@mui/material`, `@tabler/icons-react` — already used everywhere.
-   `lowlight` + `common` — already in v1.
-   `prop-types`, `lodash` — already present.

---

## 5. API Client Layer

All routes of the backend router (`packages/server/src/routes/skills-v2/index.ts`)
are exposed one-to-one by the new client module:

```js
// packages/ui/src/api/skillsv2.js
import client from './client'

// helper: build the workspace-scoped prefix. The caller passes `wsId` explicitly
// because `SkillV2Workspace` obtains it from the user store.
const base = (wsId) => `/skills-v2/workspaces/${wsId}/skills`

// --- skill-level ---
const listSkills = (wsId, params) => client.get(base(wsId), { params })
const getSkill = (wsId, skillId) => client.get(`${base(wsId)}/${skillId}`)
const createSkill = (wsId, body) => client.post(base(wsId), body)
const updateSkill = (wsId, skillId, body) => client.put(`${base(wsId)}/${skillId}`, body)
const deleteSkill = (wsId, skillId) => client.delete(`${base(wsId)}/${skillId}`)
const publishSkill = (wsId, skillId) => client.post(`${base(wsId)}/${skillId}/publish`)
const getBundle = (wsId, skillId, mode) => client.get(`${base(wsId)}/${skillId}/bundle`, { params: mode ? { mode } : undefined })
const validateSkill = (wsId, skillId) => client.post(`${base(wsId)}/${skillId}/validate`)
const getSkillDependencies = (wsId, skillId, nodeId) =>
    client.get(`${base(wsId)}/${skillId}/dependencies`, { params: nodeId ? { nodeId } : undefined })

// --- node-level ---
const createNode = (wsId, skillId, body) => client.post(`${base(wsId)}/${skillId}/nodes`, body)
const getNode = (wsId, skillId, nodeId) => client.get(`${base(wsId)}/${skillId}/nodes/${nodeId}`)
const updateNode = (wsId, skillId, nodeId, body) => client.put(`${base(wsId)}/${skillId}/nodes/${nodeId}`, body)
const deleteNode = (wsId, skillId, nodeId, recursive) =>
    client.delete(`${base(wsId)}/${skillId}/nodes/${nodeId}`, {
        params: recursive ? { recursive: 'true' } : undefined
    })
const uploadNodeBinary = (wsId, skillId, nodeId, formData) =>
    client.post(`${base(wsId)}/${skillId}/nodes/${nodeId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })
const downloadNodeBinaryUrl = (wsId, skillId, nodeId) => `/api/v1${base(wsId)}/${skillId}/nodes/${nodeId}/download`
const getNodeDependencies = (wsId, skillId, nodeId) => client.get(`${base(wsId)}/${skillId}/nodes/${nodeId}/dependencies`)

export default {
    listSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    publishSkill,
    getBundle,
    validateSkill,
    getSkillDependencies,
    createNode,
    getNode,
    updateNode,
    deleteNode,
    uploadNodeBinary,
    downloadNodeBinaryUrl,
    getNodeDependencies
}
```

Notes:

-   `client.js` already prefixes everything with `/api/v1`, so the base path
    given above is correct.
-   `downloadNodeBinaryUrl` returns a URL string (not a `client.get`) because
    `<img>` and `<video>` tags need a direct URL.
-   `wsId` is provided by the caller from `@/store/slices/user` (same pattern as
    v1's workspace-scoped requests).

---

## 6. Component Architecture

Top-down view (each box is a new file under `views/skills-v2/`):

```
SkillV2Workspace (tab body)
├── Header row: Create button + search counter + view toggle (card/list)
├── Card grid:  SkillV2Card[]   ← per-skill card with name / description / fileCount
│                  └── onClick → open drawer
├── TablePagination
├── SkillV2CreateDialog           ← modal: name / description / color / icon
└── SkillV2EditorDrawer           ← drawer (50vw, right-anchored, persistent)
    ├── Top toolbar
    │     Breadcrumbs: [SkillName]  →  [Path chain]  →  [file.md]
    │     Status chip (Saving…/Unsaved/Saved)
    │     Actions: Save | Validate | Publish | Settings | Delete | Close
    ├── Left sidebar (220 px)
    │     SkillV2FileTree
    │         ├─ root: [New] [Upload] buttons
    │         └─ SkillV2FileTreeNode*  (folder or file row)
    │              ├─ Icon (folder / .md / .py / .json / .png / binary)
    │              ├─ Name (inline rename on F2 / double-click)
    │              └─ "⋮" menu: Rename / Delete / New File / New Folder / Duplicate / Move to Root
    ├── Right content area
    │     ToggleButtonGroup: Source | Preview | Dependencies
    │     SkillV2ContentRouter   (only in Source mode)
    │         ├─ .md            → SkillV2MarkdownEditor
    │         ├─ .txt/.json/...  → SkillV2CodeEditor (language='plaintext'|'json'|...)
    │         ├─ .py/.js/.ts    → SkillV2CodeEditor (language=<ext>)
    │         ├─ image ext      → SkillV2MediaViewer
    │         └─ pdf/unknown    → SkillV2BinaryViewer
    │     SkillV2PreviewPanel      (only in Preview mode — compiled draft markdown)
    │     SkillV2DependenciesPanel (only in Dependencies mode)
    └── Bottom bar: SkillV2PublishBar
          [Draft: 3 files changed]   bundleId: abc123…   built 2m ago   [Publish]
```

Every component accepts only `{ props }` — no implicit context — so each can
be unit-tested in isolation.

### 6.1 `SkillV2Workspace.jsx` — responsibilities

-   Load skills with `skillsV2Api.listSkills(wsId, {page, limit})` via `useApi`.
-   Filter in-memory by `search` prop (same as v1 — case-insensitive name/description match).
-   Render card grid + `TablePagination`.
-   Open `SkillV2CreateDialog` on Create click.
-   Open `SkillV2EditorDrawer` with the selected skill on card click.
-   Refresh the list after create/delete/rename.

### 6.2 `SkillV2CreateDialog.jsx`

Minimal form — no three-step wizard needed (v1's wizard exists because modes
differ; v2 has one mode):

-   `name` (required, 1–255 chars, unique per workspace — surface the backend
    `UNIQUE(workspaceId, name)` error).
-   `description` (optional).
-   `color` (12 preset swatches — reuse `PRESET_COLORS` from v1's
    `SkillFolderDialog`).
-   `iconSrc` (optional — file upload to workspace file store; deferred behind
    the same mechanism v1 already has).

On submit, POST to `createSkill`, close dialog, re-open newly created skill in
the editor drawer with an empty tree.

### 6.3 `SkillV2EditorDrawer.jsx`

Copies v1's Drawer scaffold (right-anchored, 50vw, persistent) but replaces the
"flat file list" sidebar with `SkillV2FileTree`. Top-level responsibilities:

-   Track `activeNodeId` (nullable), `viewMode` ('source' | 'preview' | 'dependencies').
-   Track `draftContent` (per-node local string), `dirtyMap` (`Set<nodeId>`).
-   Debounced autosave (1500 ms; identical cadence to v1).
-   Flush debounced save on tab switch / node switch / drawer close (`beforeunload` listener).
-   Listen for `Cmd/Ctrl+S` → manual save.
-   Hold the in-memory `fileTree` (to avoid refetching on every rename) and push
    updates to the server via `updateNode` / `createNode` / `deleteNode`.
-   After every mutating call, refresh the skill row (`getSkill`) to resync
    `fileTree` + `contentDigest` from the server (prevents tree drift).

### 6.4 `SkillV2FileTree.jsx` + `SkillV2FileTreeNode.jsx`

-   Pure recursive render driven by the local `fileTree.nodes` array.
-   Sort siblings by `(order, name)`.
-   Expand/collapse state is kept in local React state (`Set<folderId>`), not persisted.
-   Selection highlights the current `activeNodeId`.
-   Right-click / `⋮` menu exposes:
    -   **New file here** (opens name prompt; creates a node with `parent_id = this folder`).
    -   **New folder here**.
    -   **Rename** (inline `TextField`, Enter to commit, Esc to cancel).
    -   **Duplicate** (client-side: reads content, creates a new node with `name + "-copy"`).
    -   **Move to root** (`parent_id = null`).
    -   **Delete** (confirm modal; recursive if folder has children).
-   Drag/drop (Phase E): accepts OS file drops on the tree root → creates a
    binary-upload node via `uploadNodeBinary`. Internal drag-to-move is Phase E.

### 6.5 `SkillV2ContentRouter.jsx`

Dispatches on extension → one of the four editor/viewer components.
Classification constants (mirror the backend's `classifyKind` in
`services/skills-v2/utils/tree.ts`):

```js
export const EXT_KIND = {
    md: 'skill',
    markdown: 'skill',
    txt: 'data',
    json: 'data',
    csv: 'data',
    yaml: 'data',
    yml: 'data',
    py: 'code',
    js: 'code',
    ts: 'code',
    tsx: 'code',
    mjs: 'code',
    png: 'binary',
    jpg: 'binary',
    jpeg: 'binary',
    gif: 'binary',
    webp: 'binary',
    svg: 'binary',
    pdf: 'binary'
    /* everything else → binary */
}
```

---

## 7. State Management

No Redux, no Zustand, no TanStack Query — everything is component-local.
Pattern mirrors v1:

### 7.1 Per-drawer state (owned by `SkillV2EditorDrawer`)

```js
const [skill, setSkill] = useState(/* SkillV2 row */)
const [fileTree, setFileTree] = useState({ nodes: [] }) // lives on skill row; kept in sync
const [activeNodeId, setActiveNodeId] = useState(null)
const [activeContent, setActiveContent] = useState('') // loaded from getNode(nodeId)
const [viewMode, setViewMode] = useState('source') // source | preview | dependencies
const [draftContent, setDraftContent] = useState('') // live editor buffer
const [dirty, setDirty] = useState(false) // active node dirty?
const [saving, setSaving] = useState(false)
const [expandedFolders, setExpandedFolders] = useState(new Set())
const [renamingId, setRenamingId] = useState(null)
const [showSettings, setShowSettings] = useState(false)
const [publishing, setPublishing] = useState(false)
const [lastBundle, setLastBundle] = useState(null) // { bundleId, builtAt, ... }
```

### 7.2 Autosave

```js
const saveTimer = useRef(null)
const onEditorChange = (next) => {
    setDraftContent(next)
    setDirty(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSave(next), 1500)
}

const flushSave = async (content) => {
    if (!activeNodeId) return
    setSaving(true)
    try {
        await skillsV2Api.updateNode(wsId, skillId, activeNodeId, { content })
        setDirty(false)
        // backend recomputes contentDigest; refresh the skill row so fileTree.size matches
        const resp = await skillsV2Api.getSkill(wsId, skillId)
        setSkill(resp.data)
        setFileTree(JSON.parse(resp.data.fileTree))
    } finally {
        setSaving(false)
    }
}
```

### 7.3 Switching files

Same pattern as v1 `selectFile` (`SkillFolderEditorDialog.jsx:520`):

1. If dirty, flush the current file.
2. Load the target file's content via `getNode(nodeId)`.
3. Reset `draftContent`, `dirty`, switch `activeNodeId`.

### 7.4 Unmount / close safeguards

-   `useEffect` cleanup flushes any pending save.
-   `beforeunload` window listener flushes.
-   `handleClose` calls `flushSave` before calling `onCancel`.

---

## 8. File Tree UX

### 8.1 Tree node model (UI)

```ts
type UiNode = {
    id: string
    node_type: 'file' | 'folder'
    name: string
    parent_id: string | null
    order: number
    extension: string
    size: number
    // derived:
    children?: UiNode[] // built via treeUtils.childrenOf
    path?: string // '/' joined, debug-only
}
```

`treeUtils.js` provides:

-   `buildNodeMap(nodes) → Map<id, UiNode>`.
-   `childrenOf(nodes, parentId) → UiNode[]` (sorted by `order` then `name`).
-   `pathOf(nodes, nodeId) → string[]` (list of node names from root to node).
-   `isAncestor(nodes, ancestorId, descendantId) → boolean` — used to prevent
    dragging a folder into its own subtree.
-   `nextOrder(nodes, parentId) → number` — `(max sibling order) + 1`, used on
    create.

### 8.2 Why custom recursion (no `react-arborist`)

Dify ships thousands of files because apps are whole IDE workspaces. Flowise
skills are prompt-centric with a soft cap of ~200 MiB (PLAN.md §3.5), which in
practice is a few dozen files. An unvirtualised recursive render keeps the
bundle lean and plays nicely with SSR/hydration rules in the existing MUI
tree. If we ever hit scale limits, swap the row-level render for
`react-arborist` behind the same `SkillV2FileTree` API.

### 8.3 Create/rename/move UX

Operations → API:

| UI action                   | API call                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| New file under folder F     | `createNode({ parent_id: F, node_type: 'file', name, extension, order: nextOrder(nodes, F) })` |
| New folder under F          | `createNode({ parent_id: F, node_type: 'folder', name, extension: '', order: ... })`           |
| Rename node N               | `updateNode(N, { name: newName })`                                                             |
| Move node N → folder G      | `updateNode(N, { parentId: G, order: nextOrder(newTree, G) })`                                 |
| Reorder N within siblings   | `updateNode(N, { order })`                                                                     |
| Delete file N               | `deleteNode(N)`                                                                                |
| Delete folder F (non-empty) | confirm → `deleteNode(F, recursive=true)`                                                      |
| Duplicate file N            | `getNode(N).content` → `createNode({ …same parent, name: copyName, content })`                 |
| Upload binary               | `createNode({ node_type: 'file', extension })` then `uploadNodeBinary(nodeId, formData)`       |

After every mutation:

1. Reload the skill row (`getSkill`) → `setSkill` + `setFileTree`.
2. If a tree mutation affected the active node (rename/move/delete), update
   `activeNodeId` / clear as needed.
3. Mark the drawer "unpublished" (show a dot next to the Publish button).

### 8.4 Empty state (no files yet)

Instead of Dify's Start Tab template gallery:

-   Centered card: "This skill has no files yet."
-   Three quick-create buttons: "New `main.md`", "New `data.txt`", "New folder".
-   A tip: "Publish after you've authored at least one `.md` file."

---

## 9. Editor Panels per File Kind

### 9.1 `SkillV2MarkdownEditor.jsx`

Direct port of v1's TipTap setup (`SkillFolderEditorDialog.jsx:266-287`):

-   Extensions: `StarterKit({ codeBlock: false })`, `TiptapMarkdown`,
    `Placeholder`, `CodeBlockLowlight`.
-   Reads `content` markdown (via `editor.setContent`), emits updated markdown
    on change (`editor.getMarkdown()`).
-   Adds **two insertion affordances** on top of v1:
    -   Toolbar button **Insert file reference** → opens a small file-picker
        dialog showing the current `fileTree`; on select, inserts
        `{{skill.<nodeId>}}` at the caret.
    -   Toolbar button **Insert tool reference** → opens a popover listing the
        workspace's registered tools (fetched via existing `@/api/tools`
        `getAllTools`); on select, inserts `{{tool.<provider>.<toolName>.<uuid>}}`
        and appends the tool's metadata to the node's `metadata.tools` map on the
        next save (§10).
-   Placeholder text:  
    `# Start writing your skill in Markdown\n\nPress the 📎 button to reference another file,\nthe 🧰 button to call a tool.`

### 9.2 `SkillV2CodeEditor.jsx`

A deliberately minimal editor for `.py`, `.js`, `.ts`, `.json`, `.txt`, `.csv`,
`.yaml`:

-   `<textarea>` with `font-family: Menlo, Consolas, monospace`, `white-space: pre`,
    tab-size 2. Same pattern Flowise uses for `CustomTool`'s `javascriptFunction`.
-   On change, runs the same autosave path as markdown.
-   No syntax highlighting in the editor itself (keeps bundle small), but the
    **Preview tab** renders the file in a fenced `ReactMarkdown` code block with
    `remark-gfm` + `lowlight` for highlighting.

### 9.3 `SkillV2MediaViewer.jsx`

-   `<img src={downloadNodeBinaryUrl(wsId, skillId, nodeId)}>` for images.
-   `<video controls src={…}>` for video (`.mp4`, `.webm`).
-   Shows filename, MIME, size, "Download" button, "Replace" button (opens file
    picker → `uploadNodeBinary`).
-   Handles auth: the `client.get` axios instance already carries credentials;
    `<img>` tags use the same cookie path — so a direct URL works without extra
    headers.

### 9.4 `SkillV2BinaryViewer.jsx`

-   Generic download card for `.pdf`, `.zip`, unknown extensions.
-   Filename + icon + size + **Download** button (creates an anchor with the
    download URL) + **Replace** button.

---

## 10. Placeholder Insertion Helpers (tool + file references)

The backend compiler recognises two skill-specific placeholders inside `.md`
content (see PLAN.md §5.1):

-   `{{skill.<nodeId>}}` — reference another tree node (any kind).
-   `{{tool.<provider>.<toolName>.<uuid>}}` — reference a workspace tool.

The editor helps users type these correctly.

### 10.1 File picker (inserts `{{skill.<nodeId>}}`)

-   Click 📎 in the editor toolbar → opens a small popover backed by the
    current `fileTree`.
-   Renders the same recursive tree as the sidebar but in select mode.
-   Selecting a node inserts the token and stores a lightweight label the
    editor prints as decoration (see §10.3 below).

### 10.2 Tool picker (inserts `{{tool.*}}` + registers metadata)

-   Click 🧰 → opens a popover backed by `@/api/tools` `getAllTools` (all
    tools the workspace can see) plus static entries for built-ins, MCP tools,
    and HTTP requests (from existing registries).
-   Selecting a tool:
    1. Inserts `{{tool.<provider>.<toolName>.<uuid>}}` at the caret, where
       `<uuid>` is generated via `crypto.randomUUID()` so the same tool used
       twice yields two distinct references.
    2. Updates a per-node `metadata.tools` map kept in drawer state; on the
       next autosave, the metadata is sent alongside `content` to `updateNode`
       (the node-level `PUT` already accepts a `metadata` body — see the
       controller at `packages/server/src/controllers/skills-v2/index.ts:216`).
-   The metadata entry shape matches the backend's `ToolReference` (§6.1 of
    PLAN.md):

    ```js
    { type: 'custom', provider: 'hr_platform', toolName: 'candidate_lookup',
      uuid: '<uuid>', credentialId: null, enabled: true, config: {} }
    ```

### 10.3 Visual decoration (optional, Phase B)

The raw TipTap buffer stores `{{skill.<id>}}` / `{{tool.*}}` verbatim so
round-trips are lossless. For display, a tiny TipTap **input rule** matches
the two placeholder patterns and renders them as inline chips:

-   `{{skill.<id>}}` → chip "📎 `interview-questions.md`" (clickable; navigates
    to that node in the sidebar).
-   `{{tool.<p>.<n>.<u>}}` → chip "🧰 `candidate_lookup`" (clickable; opens the
    tool-metadata popover).

When the user types raw text, it stays raw; chip rendering is purely a display
pass. Switching to the Preview tab hides chips and shows the underlying
resolved output via the draft bundle.

---

## 11. Publish / Bundle / Dependencies UX

### 11.1 Publish flow

`SkillV2PublishBar` renders at the bottom of the drawer:

```
┌──────────────────────────────────────────────────────────────┐
│  3 changes since last publish   bundle: abc123…   2 min ago  │
│                         [Validate] [Publish]                 │
└──────────────────────────────────────────────────────────────┘
```

-   **Changes since last publish** — computed by comparing the current
    `skill.contentDigest` against `skill.publishedBundleId`'s stored digest.
    If equal → "Up to date".
-   **Validate** — POST `/skills/:id/validate`; on non-empty `broken` list,
    expand a panel with the list and jump buttons that select the offending
    node.
-   **Publish** — POST `/skills/:id/publish`; on 202, update `lastBundle`, show a
    "Published" toast, collapse the change badge.

### 11.2 Preview tab (draft bundle)

When `viewMode === 'preview'`:

-   Call `getBundle(wsId, skillId, 'draft')` lazily on tab activation.
-   If `activeNodeId` is a skill-kind node, render its `entries[activeNodeId].content`
    (the resolved markdown) via `ReactMarkdown + remarkGfm`.
-   If it is a data/code node, render the raw content inside a fenced code
    block.
-   If it is an image/binary node, render the viewer (same as Source mode).

The draft bundle endpoint is cheap (recompiles only when digests change — see
PLAN.md §6.4). Re-fetching on every Preview click is acceptable; a small 1 s
client cache (`useRef`) is sufficient.

### 11.3 Dependencies tab

When `viewMode === 'dependencies'`:

-   If `activeNodeId` is null, call `getSkillDependencies(wsId, skillId)` →
    aggregate across all nodes.
-   Else call `getNodeDependencies(wsId, skillId, nodeId)` → direct +
    transitive.
-   Render two collapsible sections:
    -   **Tools** — table with columns: provider | toolName | credentialId | enabled.
    -   **Files** — list with icon + path + kind; click to open that node in the
        editor.

Phase E may upgrade this tab to a ReactFlow graph using the same data feed.

---

## 12. Validation & Error Surfacing

-   **Name collisions** (`UNIQUE(workspaceId, name)`): Create dialog submit
    catches the 409 and shows an inline error beneath the name field.
-   **Invalid file name** (reserved chars, empty, length > 255): caught
    client-side in `nameValidator.js` before the API call.
-   **Tree invariants** (cycles, missing parent): the backend's `beforeUpdate`
    hook throws; frontend shows a snackbar with the error message and reverts
    the local tree from the last `getSkill` response.
-   **Broken placeholder** (`SKILL_V2_BROKEN_REFERENCE`): shown in the Preview
    tab inline (the compiled output literally contains that marker — we do not
    strip it). A bright yellow warning chip above the preview counts broken
    references and links to the Validate panel.
-   **Upload failures**: snackbar with the HTTP error body; failed uploads leave
    the tree unchanged.
-   **Oversized skill** (> `MAX_SKILL_BYTES`): backend 413 → explicit snackbar
    telling the user to delete files.

All errors use the existing `@/store/actions` snackbar dispatch (same as v1,
no new notification primitives).

---

## 13. Permissions & RBAC

-   The backend routes gate every mutating call with `tools:update,tools:create`
    and read calls with `tools:view` (see `routes/skills-v2/index.ts`).
-   Frontend wraps action buttons with `PermissionButton` / `StyledPermissionButton`
    using the matching permission IDs, identical to how v1 does it in
    `tools/index.jsx`.
-   The top-level tab itself is visible to everyone who can see the Tools page.
    A user without `tools:view` will hit the backend's 403 on the first list
    request and the tab body will render an empty error state (re-using
    `ErrorBoundary` already in `MainCard`).

---

## 14. Phased Rollout

Each phase is independently shippable and mirrors the backend phases (PLAN.md §13).

### Phase F-A — Workspace + CRUD (mirrors backend Phase A)

-   [ ] `skillsv2.js` API module.
-   [ ] `SkillV2Workspace.jsx`, `SkillV2Card.jsx`.
-   [ ] `SkillV2CreateDialog.jsx`.
-   [ ] `SkillV2EditorDrawer.jsx` scaffold (toolbar, empty sidebar, empty body).
-   [ ] `SkillV2FileTree.jsx` + `SkillV2FileTreeNode.jsx` with create/rename/delete/move.
-   [ ] `SkillV2MarkdownEditor.jsx` + `SkillV2CodeEditor.jsx` (no preview/deps yet).
-   [ ] Autosave + dirty tracking + close safeguards.
-   **Outcome**: users can author skills, author `.md` and text files, organise
    them in folders. No compile/preview/publish yet.

### Phase F-B — Preview + Publish (mirrors backend Phase B)

-   [ ] `SkillV2PreviewPanel.jsx` (draft bundle).
-   [ ] `SkillV2PublishBar.jsx` (Publish button + bundleId chip + last built).
-   [ ] `SkillV2DependenciesPanel.jsx` (adjacency-list view).
-   [ ] Validate button + broken-ref panel.
-   [ ] Placeholder-insertion toolbar in the markdown editor (file picker + tool picker).
-   **Outcome**: users can inspect the compiled output and publish a bundle the
    runtime can consume.

### Phase F-C — Binary assets + helper-tool UX (mirrors backend Phase C/D)

-   [ ] `SkillV2MediaViewer.jsx`, `SkillV2BinaryViewer.jsx`.
-   [ ] `SkillV2UploadDialog.jsx` (multi-file, drag/drop on tree root).
-   [ ] Display the helper-tool list (`read_skill_asset`, `exec_skill_code`, etc.)
        in the Dependencies tab.
-   **Outcome**: authors can attach data files, code files, and images; the
    drawer renders each kind appropriately.

### Phase F-D — Dependency graph (mirrors backend Phase E)

-   [ ] Upgrade `SkillV2DependenciesPanel.jsx` to render a ReactFlow graph
        (reuse the same graph library v1's `SkillNodeGraph.jsx` uses).
-   [ ] Tree drag-and-drop to reorder/move nodes across folders.
-   [ ] Optional: template quick-start for a "blank skill", "recruiting sample",
        "research sample".
-   **Outcome**: parity with Dify's skill IDE for the 95% case.

---

## 15. Testing Strategy

(Deferred in alignment with PLAN.md §14, but the hooks are explicit so that
later test authors have a cheap target list.)

-   **Unit**: `utils/treeUtils.js`, `utils/extUtils.js`, `utils/placeholderUtils.js`
    are pure — table-driven Jest cases.
-   **Component**: React Testing Library for:
    -   `SkillV2CreateDialog` — validation, submit path.
    -   `SkillV2FileTree` — expand/collapse, inline rename, delete confirm.
    -   `SkillV2MarkdownEditor` — insert-file / insert-tool toolbar buttons
        produce the expected placeholder text.
-   **Integration** (MSW): `SkillV2EditorDrawer` end-to-end — create skill, add
    files, rename, autosave, publish, inspect dependencies.
-   **E2E** (Cypress, after backend Phase D): create skill → author → publish →
    attach to a chatflow `SkillV2Tool` node → run a prediction → assert the
    resolved prompt text.

---

## 16. Open Questions / Design Decisions

1. **Drag-and-drop scope.**  
   Phase F-A leaves DnD out (inline "Move to…" menu items only). Phase F-D adds
   tree-internal DnD. Do we want Dify-style "auto-expand folder on 2 s hover"
   behaviour, or is a simpler "drop on a folder name" enough? Recommend the
   latter initially.

2. **Chip decoration for placeholders.**  
   A TipTap input rule + render-HTML decorator is ~80 LoC. If it turns out
   too fragile for the markdown round-trip, we can fall back to plain
   monospace-highlighted placeholder text (lowest-risk option).

3. **Start tab / template gallery.**  
   Out of scope for MVP. If we later add it, pattern the UI after Dify's
   `StartTabContent` with lazy-loaded template bundles under
   `views/skills-v2/templates/registry.js`.

4. **Workspace scoping.**  
   Currently we read `activeWorkspaceId` from the existing user store
   (matches v1). Do we need to expose a per-drawer "change workspace" control,
   or is the active-workspace contract sufficient? Recommend the latter —
   v1 has no workspace switcher in the drawer either.

5. **`iconSrc` upload.**  
   v2 can reuse v1's upload path (the backend route `updateSkill` accepts
   `iconSrc` as a string; v1's UI already knows how to upload and obtain a
   URL). If the icon-upload dialog is tightly coupled to v1, we defer to
   Phase F-B and ship MVP with color-only branding.

6. **Mobile / narrow-viewport layout.**  
   The drawer at 50 vw is not usable under ~800 px. v1 inherits this limit;
   v2 follows. If we need mobile support, Phase F-D can fold the tree into
   an overlay sheet.

7. **Node-level deps vs skill-level deps default view.**  
   When a file is selected, we show that node's deps. When no file is
   selected, we show the aggregate (whole-skill) deps. Confirm this default
   with the product owner.

8. **Removing a referenced tool via the toolbar.**  
   If the user deletes all occurrences of a `{{tool.…}}` placeholder from a
   `.md` file, do we drop the matching `metadata.tools[uuid]` entry on save?
   Recommend yes (mirrors Dify's `normalizeMetadata`).

---

## Appendix A — Example User Flows

### A.1 Create a skill + author a single prompt

1. User clicks **Tools → Skills V2 → Create**.
2. Dialog: enters `recruiting`, description, picks a color. Saves.
3. Drawer opens with empty tree. Clicks **New file** → `resume-screener.md`.
4. Types the prompt; clicks 📎 toolbar → inserts `{{skill.n-jd}}` after adding a
   `job-description.txt` via **New file**.
5. Autosave flushes every 1.5 s.
6. Clicks **Publish** → bundle `abc123` is created; the Publish bar updates.

### A.2 Reorganise files into folders

1. User selects `assets` folder (or creates one via **New folder**).
2. For each image, selects its row's `⋮` menu → **Move to…** → picks `assets`.
3. Each `updateNode({ parentId })` is followed by a `getSkill` to resync the
   tree.

### A.3 Validate + fix a broken placeholder

1. User deletes `job-description.txt`.
2. Clicks **Validate** → panel shows "1 broken reference in `resume-screener.md`".
3. Clicks the jump button → editor navigates to the line containing
   `{{skill.<deleted-id>}}`.
4. User inserts a new `{{skill.…}}` via the file picker → save → Validate →
   clean.

### A.4 Publish and attach to a chatflow

1. User publishes the skill.
2. In a chatflow, drops a `SkillV2Tool` node from the palette (Phase F-C —
   outside this FE plan but consumes the same API).
3. The node reads the published bundle via `loadBundle(…, 'published')`.

---

## Appendix B — File-by-file Impact on the Existing Codebase

| File                                                                                                                                 | Touch type             | Why                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------- |
| `packages/ui/src/views/tools/index.jsx`                                                                                              | **edit** (~4 lines)    | Add import + tab-body conditional + one `searchPlaceholder` ternary branch. |
| `packages/ui/src/api/skillsv2.js`                                                                                                    | **create**             | New client module.                                                          |
| `packages/ui/src/ui-component/cards/SkillV2Card.jsx`                                                                                 | **create**             | Mirror of v1's `SkillFolderCard`.                                           |
| `packages/ui/src/views/skills-v2/**`                                                                                                 | **create (~17 files)** | New module tree (see §4).                                                   |
| All v1 files (`SkillFolder*.jsx`, `skillfolders.js`, `skillfiles.js`, `skillassets.js`, `SkillNodeGraph.jsx`, `SkillFolderCard.jsx`) | **no change**          | Hard constraint from the user.                                              |

No changes to: routes, redux, theme, ui-components other than `cards/`,
hooks, or store contexts.

---

**End of plan.** Once approved, Phase F-A delivers the minimum usable surface
(workspace + CRUD + markdown authoring) in about the same complexity budget as
v1's `SkillFolderEditorDialog.jsx`, which is already the single largest file
in the Tools views. We should aim to keep no new file above ~600 LoC; split
editor/router/toolbar concerns aggressively.
