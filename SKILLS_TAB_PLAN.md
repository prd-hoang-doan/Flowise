# Skills Tab — Plan & Requirements

## Overview

Add a **Skills** tab to the existing Tools page (`/tools`). Skills are markdown-based instructions that agents can use alongside Custom Tools and Custom MCP Servers. Skills are organized into **folders** (displayed as colored cards with icons), and each folder contains one or more **markdown files** (flat, no nesting). Each markdown file represents a single skill.

---

## Data Model

### `SkillFolder` entity

| Column        | Type                | Notes                               |
| ------------- | ------------------- | ----------------------------------- |
| `id`          | `uuid` (PK)         | Auto-generated                      |
| `name`        | `varchar`           | Folder display name                 |
| `color`       | `varchar`           | Hex color for the folder card       |
| `iconSrc`     | `varchar`, nullable | Optional icon URL/data URI          |
| `description` | `text`, nullable    | Short description shown on the card |
| `createdDate` | `datetime`          | Auto                                |
| `updatedDate` | `datetime`          | Auto                                |
| `workspaceId` | `text`              | Tenant scoping                      |

### `SkillFile` entity

| Column        | Type                      | Notes                             |
| ------------- | ------------------------- | --------------------------------- |
| `id`          | `uuid` (PK)               | Auto-generated                    |
| `folderId`    | `uuid` (FK → SkillFolder) | Parent folder                     |
| `name`        | `varchar`                 | File name (e.g. `greeting-skill`) |
| `content`     | `text`                    | Markdown content                  |
| `createdDate` | `datetime`                | Auto                              |
| `updatedDate` | `datetime`                | Auto                              |
| `workspaceId` | `text`                    | Tenant scoping                    |

---

## API Endpoints

### Skill Folders

| Method   | Path                        | Description                         |
| -------- | --------------------------- | ----------------------------------- |
| `GET`    | `/api/v1/skill-folders`     | List all folders (paginated)        |
| `GET`    | `/api/v1/skill-folders/:id` | Get a folder by ID                  |
| `POST`   | `/api/v1/skill-folders`     | Create a folder                     |
| `PUT`    | `/api/v1/skill-folders/:id` | Update a folder (name, color, icon) |
| `DELETE` | `/api/v1/skill-folders/:id` | Delete a folder (cascades to files) |

### Skill Files

| Method   | Path                                        | Description                  |
| -------- | ------------------------------------------- | ---------------------------- |
| `GET`    | `/api/v1/skill-folders/:folderId/files`     | List files in a folder       |
| `GET`    | `/api/v1/skill-folders/:folderId/files/:id` | Get a single file            |
| `POST`   | `/api/v1/skill-folders/:folderId/files`     | Create a file in a folder    |
| `PUT`    | `/api/v1/skill-folders/:folderId/files/:id` | Update a file (name/content) |
| `DELETE` | `/api/v1/skill-folders/:folderId/files/:id` | Delete a file                |

---

## Server-Side Implementation

Following the existing pattern: **route → controller → service → entity**.

### Files to create

| Layer                | Path                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Entity               | `packages/server/src/database/entities/SkillFolder.ts`                                    |
| Entity               | `packages/server/src/database/entities/SkillFile.ts`                                      |
| Interface            | Add `ISkillFolder` and `ISkillFile` to `packages/server/src/Interface.ts`                 |
| Migration (SQLite)   | `packages/server/src/database/migrations/sqlite/1767000000000-AddSkillFolderAndFile.ts`   |
| Migration (Postgres) | `packages/server/src/database/migrations/postgres/1767000000000-AddSkillFolderAndFile.ts` |
| Migration (MySQL)    | `packages/server/src/database/migrations/mysql/1767000000000-AddSkillFolderAndFile.ts`    |
| Migration (MariaDB)  | `packages/server/src/database/migrations/mariadb/1767000000000-AddSkillFolderAndFile.ts`  |
| Service              | `packages/server/src/services/skill-folders/index.ts`                                     |
| Service              | `packages/server/src/services/skill-files/index.ts`                                       |
| Controller           | `packages/server/src/controllers/skill-folders/index.ts`                                  |
| Controller           | `packages/server/src/controllers/skill-files/index.ts`                                    |
| Route                | `packages/server/src/routes/skill-folders/index.ts`                                       |
| Register route       | Update `packages/server/src/routes/index.ts`                                              |
| Register entity      | Update `packages/server/src/database/entities/index.ts`                                   |

---

## UI Implementation

### Files to create / modify

| Action | Path                                                      | Description                                             |
| ------ | --------------------------------------------------------- | ------------------------------------------------------- |
| Create | `packages/ui/src/api/skillfolders.js`                     | API client for skill folders                            |
| Create | `packages/ui/src/api/skillfiles.js`                       | API client for skill files                              |
| Create | `packages/ui/src/views/tools/SkillFolderDialog.jsx`       | Dialog for create/edit folder (name, icon, color)       |
| Create | `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Full-screen dialog: file list + tiptap editor + preview |
| Create | `packages/ui/src/ui-component/cards/SkillFolderCard.jsx`  | Card for folder display (reuse `ItemCard` pattern)      |
| Modify | `packages/ui/src/views/tools/index.jsx`                   | Wire up `tabValue === 2` to render Skills tab content   |

### Skills Tab (folder list view)

-   Reuse existing toggle between card/list view.
-   Display folders as cards (`SkillFolderCard`) showing: colored circle icon, folder name, file count, description.
-   **Create** button opens `SkillFolderDialog` in ADD mode.
-   Clicking a folder card opens `SkillFolderEditorDialog`.
-   Support search filtering by folder name/description.
-   Paginated (reuse `TablePagination` component).

### `SkillFolderDialog` (create/edit folder metadata)

-   Fields: **Name** (required), **Description** (optional), **Color** picker, **Icon** upload.
-   Modes: ADD, EDIT.
-   On EDIT, show a **Delete** button.
-   Same dialog pattern as `ToolDialog` / `CustomMcpServerDialog`.

### `SkillFolderEditorDialog` (full-screen file editor)

This is the main editor dialog opened when a user clicks on a folder card.

```
┌─────────────────────────────────────────────────────────────┐
│  [Folder Name]                              [Edit] [Close]  │
├──────────────┬──────────────────────────────────────────────┤
│              │  Toolbar: [Edit | Preview | Split]           │
│  File List   │──────────────────────────────────────────────│
│              │                                              │
│  • file-1 ✎ │   Tiptap Editor  |  Markdown Preview         │
│  • file-2   │   (or full editor / full preview)             │
│  • file-3   │                                              │
│              │                                              │
│  [+ New File]│                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│                                            [Save] [Cancel]  │
└─────────────────────────────────────────────────────────────┘
```

#### Left Panel — File List

-   Lists all markdown files in the folder (flat, no nesting).
-   Click a file to load it in the editor.
-   **"+ New File"** button at the bottom to create a new file.
-   Right-click or icon menu on each file for **Rename** / **Delete**.
-   Active file is highlighted.

#### Right Panel — Editor + Preview

-   **Three view modes** toggled by toolbar buttons:
    -   **Edit**: Full tiptap markdown editor.
    -   **Preview**: Rendered markdown (read-only).
    -   **Split**: Editor on left, live preview on right (default).
-   Tiptap is already installed (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, etc.). Reuse existing tiptap setup from `RichInput.jsx` as a starting point but extend for full-page editing.
-   Auto-save on blur or debounced (e.g., 1 second after last keystroke).
-   Show unsaved indicator (dot/asterisk on file name) when content has changed.

---

## Permissions

Reuse the existing `tools:create`, `tools:view`, `tools:update`, `tools:delete` permissions, or introduce new ones:

| Permission     | Used for                     |
| -------------- | ---------------------------- |
| `tools:view`   | View skill folders and files |
| `tools:create` | Create folders and files     |
| `tools:update` | Edit folders and files       |
| `tools:delete` | Delete folders and files     |

> **Decision**: Reuse `tools:*` permissions to avoid migration complexity. Can be split later if needed.

---

## UX Details

-   **Color picker**: Use a simple preset palette (8-12 colors) with an optional custom hex input.
-   **Icon**: Allow upload of a small image (< 100KB). Store as data URI in `iconSrc`, same as Tools/MCP.
-   **Empty state**: Show illustration + "No Skills Created Yet" message (reuse `ToolEmptySVG` or create new).
-   **Search**: Filter folders by name/description in the Skills tab. Filter files by name in the editor dialog.
-   **Responsive**: The editor dialog should be near full-screen on desktop (`maxWidth: 'xl'` or `fullScreen`).

---

## Technical Notes

1. **Tiptap already installed** — v3.20.4 with extensions: `starter-kit`, `markdown`, `code-block-lowlight`, `mention`, `placeholder`. The `RichInput.jsx` component can be referenced for setup patterns.
2. **Migration pattern**: Single migration file per DB dialect creating both tables. Foreign key from `skill_file.folderId` → `skill_folder.id` with `ON DELETE CASCADE`.
3. **Existing patterns to follow**:
    - API client: `packages/ui/src/api/tools.js` (simple `client.get/post/put/delete`)
    - Entity: `packages/server/src/database/entities/Tool.ts` (TypeORM decorators)
    - Service: `packages/server/src/services/tools/index.ts` (repository queries)
    - Route: `packages/server/src/routes/tools/index.ts` (express router + RBAC guards)
4. **No nesting**: Files are always direct children of a folder. No subdirectories.

---

## Out of Scope (Future)

-   Skill versioning / history.
-   Skill sharing across workspaces.
-   Importing/exporting skills as `.zip` bundles.
-   Agent runtime integration (actually _using_ skills during agent execution) — this plan covers only the CRUD UI and backend.
-   Skill templates / marketplace.
