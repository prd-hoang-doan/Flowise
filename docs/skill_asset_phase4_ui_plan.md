Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#650-650), lines 650 to 800

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#800-800), lines 800 to 1000

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#1000-1000), lines 1000 to 1200

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#1200-1200), lines 1200 to 1441

Find API and route patterns

Searched for text `skillFilesApi` (`**/packages/ui/src/api/**`), no results

Searched for files matching `**/packages/server/src/routes/skill-nodes/index.ts`, no matches

Searched for files matching `**/packages/server/src/controllers/skill-nodes/index.ts`, no matches

Searched for files matching `**/packages/server/src/database/entities/SkillNode.ts`, 1 match

Searched for regex `skillFile|skill-file|skillfiles` (`**/packages/ui/src/api/**`), 10 results

Searched for files matching `**/skill*`, 20 matches

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/server/src/database/entities/SkillNode.ts)

Searched for files matching `**/routes/skill-*`, no matches

Searched for files matching `**/controllers/skill-*`, no matches

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/api/skillfiles.js)

Searched for regex `skill-node|skillNode|skill_node` (`**/packages/server/src/routes/**`), no results

Searched for regex `skill-node|skillNode|skill_node` (`**/packages/server/src/controllers/**`), no results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/api/skillfiles.js#1-1), lines 1 to 30

Now let me check the existing route pattern and the skill-files route to understand how to add new endpoints:

Searched for files matching `**/routes/**/skill*`, no matches

Searched for regex `skill-folders.*files.*compile-preview` (`**/packages/server/src/**`), no results

Searched for regex `compile-preview|compilePreview` (`**/packages/server/src/routes/**"`), no results

Searched for regex `compile-preview|compilePreview` (`**/packages/server/src/**"`), no results

Searched for regex `compile-preview|compilePreview` (`**/packages/server/src/**"`), no results

Searched for regex `compile.preview`, 6 results

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/server/src/routes/skill-folders/index.ts#1-1), lines 1 to 50

Now I have a complete picture of the current architecture. Let me check what icons/libraries are used in the UI:

Read [](file:///Users/hoang.doan/Personal/projects/Flowise/packages/ui/src/views/tools/SkillFolderEditorDialog.jsx#1-1), lines 1 to 70

Now I have a thorough understanding of the entire stack. Let me create a comprehensive plan.

Here's a plan for Node Visualization UI in the Skill Editor:

---

## Plan: Skill Node Visualization Tab (Phase 4 UI)

### Problem

Phase 4 added structured nodes (role, rule, behavior, knowledge, asset) with edges, priorities, and clusters — but the user has zero visibility into what the extraction pipeline produced. Without a visualization, users can't:

-   See how their markdown was decomposed into nodes
-   Verify classification is correct (e.g., a behavior misclassified as knowledge)
-   Understand which nodes will be prioritized or trimmed
-   See relationships (edges) between content pieces
-   Debug why a skill behaves unexpectedly at runtime

### Approach

Add a **"Nodes"** tab to the existing `ToggleButtonGroup` (Source | Preview | Assets | Summary → + **Nodes**). This is the lowest-friction integration point — no new dialogs, routes, or pages.

### UI Design

#### 1. New View Mode: `nodes`

Add to existing toggle: `Source | Preview | Assets | Nodes | Summary`

#### 2. Layout: Grouped Node Cards

Nodes are displayed **grouped by type** in the order: Role → Rules → Instructions → Knowledge → Assets. Each group is a collapsible section with:

```
[Role] ─────────────────────────────────────
┌─────────────────────────────────────────┐
│ 🟣 Role  P:100  cluster:identity       │
│ "You are an expert marketing copywr…"  │
│ triggers: [marketing, copy, expert]     │
└─────────────────────────────────────────┘

[Rules] ────────────────────────────────────
┌─────────────────────────────────────────┐
│ 🔴 Rule  P:95  cluster:constraint      │
│ "Never use passive voice"              │
│ triggers: [passive, voice]              │
│ ── supports → [behavior-node-xyz]       │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 🔴 Rule  P:95  cluster:constraint      │
│ "Always include a call to action"      │
│ triggers: [call, action]                │
└─────────────────────────────────────────┘

[Instructions] ─────────────────────────────
  ...

[Knowledge] ─────────────────────────────────
  ...

[Assets] ─────────────────────────────────
  ...
```

#### 3. Node Card Details

Each card shows:

-   **Type badge** — color-coded pill (role=purple, rule=red, behavior=blue, knowledge=green, asset=orange)
-   **Priority** — `P:{value}`
-   **Cluster** — if assigned
-   **Content** — truncated to ~2 lines, expandable
-   **Triggers** — keyword tags
-   **Edges** — compact list of connections (e.g., `supports → [node title]`)

#### 4. Summary Bar

At the top of the Nodes tab, a stats bar:

-   Total nodes count
-   Breakdown by type (e.g., `1 role · 3 rules · 5 behaviors · 2 knowledge · 1 asset`)
-   Edge count
-   "Re-extract" button (triggers forced re-extraction)

### Backend Changes

#### New API Endpoint

```
GET /api/v1/skill-folders/:folderId/files/:fileId/nodes
```

Returns `{ nodes: SkillNode[], edges: SkillEdge[] }` for the given file.

#### Files to Create/Modify

| File                        | Change                                        |
| --------------------------- | --------------------------------------------- |
| index.ts                    | Add `getSkillFileNodes` controller            |
| index.ts                    | Add `getSkillFileNodes` service method        |
| index.ts                    | Add route `GET /:folderId/files/:id/nodes`    |
| skillfiles.js               | Add `getSkillFileNodes(folderId, fileId)`     |
| SkillFolderEditorDialog.jsx | Add `nodes` view mode + node visualization UI |

### Implementation Checklist

**Backend:**

-   [ ] Add `getSkillFileNodes` to skill-files service — queries SkillNode + SkillEdge by fileId
-   [ ] Add `getSkillFileNodes` controller handler
-   [ ] Add route `GET /:folderId/files/:id/nodes`
-   [ ] Add `POST /:folderId/files/:id/re-extract` route for forced re-extraction

**API Client:**

-   [ ] Add `getSkillFileNodes(folderId, fileId)` to skillfiles.js
-   [ ] Add `reExtractNodes(folderId, fileId)` to skillfiles.js

**UI:**

-   [ ] Add `'nodes'` to viewMode toggle group with `IconNodes` or `IconSchema` icon
-   [ ] Add state: `nodes`, `edges`, `nodesLoading`
-   [ ] Add `loadNodes()` callback — fetches from new endpoint
-   [ ] Load nodes when switching to nodes tab
-   [ ] Render summary stats bar (total, breakdown by type, edge count)
-   [ ] Render grouped sections (Role → Rules → Instructions → Knowledge → Assets)
-   [ ] Render node cards with type badge, priority, cluster, content, triggers, edges
-   [ ] Add "Re-extract" button that calls re-extract endpoint + reloads
-   [ ] Color-coded type badges: role=purple, rule=red, behavior=blue, knowledge=green, asset=orange
-   [ ] Collapsible node content for long entries
-   [ ] Edge display: show connected node titles inline

---

All done. Here's a summary of what was built:

Backend (index.ts, index.ts, index.ts):

GET /:folderId/files/:id/nodes — returns { nodes, edges } for a skill file
POST /:folderId/files/:id/re-extract — forces re-extraction and returns updated nodes/edges
API Client (skillfiles.js):

getSkillFileNodes(folderId, fileId)
reExtractNodes(folderId, fileId)
UI (SkillFolderEditorDialog.jsx):

New "Nodes" tab with badge showing node count
Summary stats bar — color-coded chips per type (Role, Rules, Instructions, Knowledge, Assets) + edge count + Re-extract button
Grouped node cards by type (role→rule→behavior→knowledge→asset), each showing:
Color-coded type badge + priority + cluster + title + order index
Content with expand/collapse for long entries
Trigger keywords as tag chips
Edge connections with direction arrows and target node titles
