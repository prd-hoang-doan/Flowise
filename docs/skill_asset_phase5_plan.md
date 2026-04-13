# Skill Asset — Phase 5 Plan

## Overview

Phase 5 has two major tracks:

1. **Backend** — Embedding-based semantic retrieval and node-first runtime (from `skill_asset_phase5_requirement.md`)
2. **UI** — Folder Creation Wizard and enhanced folder setup UX (from `skill_asset_phase5_ui_discussion.md`)

This plan reconciles both tracks, maps discussion ideas to the current codebase state, and defines what to build, what to skip, and the implementation order.

---

## Current State (What Exists)

### Backend (Phase 1–4 Complete)

-   `SkillFolder` and `SkillFile` entities with CRUD
-   `SkillNode` and `SkillEdge` entities with node extraction pipeline
-   `SkillCompileCache` for compiled prompt caching
-   Keyword-based retriever (`compiler/retriever.ts`)
-   `compileFromNodes()` produces monolithic text blob at runtime
-   `captionModelConfig` on `SkillFolder` for vision LLM config
-   `SkillNode.embeddingText` field exists but is **never populated**

### UI (Current)

-   **Tools page** with 3 tabs: Custom Tools | Custom MCP Servers | Skills
-   **SkillFolderDialog** — flat dialog with: Name, Description, Color picker (12 presets + hex), Icon URL
-   **SkillFolderCard** — colored card showing folder name, icon, description
-   **SkillFolderEditorDialog** — right-side drawer with:
    -   Left sidebar: file list (create/rename/delete)
    -   View modes: Source | Preview | Assets | Nodes | Summary
    -   Caption model config
    -   Auto-save with dirty state tracking

---

## Track 1: Backend — Embedding & Semantic Retrieval

### Implementation Order

```
WI-P5-1  SkillNodeEmbedding Entity + Migration
    ↓
WI-P5-2  Embedding Model Configuration (column + migration)
    ↓
WI-P5-3  Embedding Generation Service
    ↓
WI-P5-8  Populate embeddingText on SkillNode
    ↓
WI-P5-4  Semantic Retrieval Engine  ←→  WI-P5-5  Node-First Runtime  [parallel]
    ↓                                       ↓
WI-P5-7  SkillTool Integration (wires retrieval + runtime)
    ↓
WI-P5-6  Embedding Lifecycle Management
    ↓
WI-P5-9  Performance Optimizations
```

### Work Items Summary

| ID      | Title                                 | Priority | Effort | Status      |
| ------- | ------------------------------------- | -------- | ------ | ----------- |
| WI-P5-1 | SkillNodeEmbedding Entity + Migration | P0       | Low    | DONE        |
| WI-P5-2 | Embedding Model Configuration         | P1       | Low    | DONE        |
| WI-P5-3 | Embedding Generation Service          | P0       | High   | DONE        |
| WI-P5-4 | Semantic Retrieval Engine             | P0       | High   | Not Started |
| WI-P5-5 | Node-First Runtime Architecture       | P1       | Medium | Not Started |
| WI-P5-6 | Embedding Lifecycle Management        | P1       | Medium | Not Started |
| WI-P5-7 | SkillTool Integration                 | P0       | Medium | Not Started |
| WI-P5-8 | Populate embeddingText                | P2       | Low    | Not Started |
| WI-P5-9 | Performance Optimizations             | P2       | Low    | Not Started |

### Key Backend Decisions

1. **JSON-serialized vectors** — portable across SQLite/MySQL/Postgres/MariaDB (no pgvector dependency)
2. **Hybrid scoring** — 60% semantic + 25% keyword + 15% priority (graceful fallback to keyword-only)
3. **Node-first runtime** — `[ROLE]`, `[RULE]`, `[DO]`, `[KNOW]`, `[ASSET]` tags instead of compiled blob
4. **Opt-in semantics** — no `embeddingModelConfig` → keyword-only mode (Phase 4 behavior preserved)
5. **Incremental embedding** — `contentHash` comparison skips unchanged nodes

---

## Track 2: UI — Folder Creation Wizard

### Discussion vs. Reality Analysis

The discussion proposes a **3-step wizard** for folder creation. Here's the gap analysis against the current UI:

| Discussion Proposal                                   | Current State                         | Decision                                                   |
| ----------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Step 1: Choose Goal (Simple / Advanced / Dedicated)   | No goal selection — flat dialog       | **Adapt** — add execution mode selector, not a wizard step |
| Step 2: Folder Setup (Name, Description, Color, Icon) | Already exists in `SkillFolderDialog` | **Keep** — already implemented                             |
| Step 3: Review & Create                               | No review step                        | **Skip** — unnecessary for a 4-field form                  |
| Right panel contextual help                           | No help panel                         | **Skip** — over-engineering for current scope              |
| Post-creation empty states                            | Basic empty state exists              | **Enhance** — improve empty state messaging                |
| "Advanced Settings" toggle for power users            | No execution mode exposed in UI       | **Build** — add to folder editor dialog                    |

### Key UI Decisions

#### 1. No Full Wizard — Enhance Existing Dialog Instead

**Why:** The current `SkillFolderDialog` already handles Name/Description/Color/Icon. A 3-step wizard adds friction for what is fundamentally a simple form. The "goal" (execution mode) is better placed in the folder editor after creation, not at creation time.

**What to do:**

-   Keep `SkillFolderDialog` as-is for folder creation (fast, simple)
-   Add execution mode and embedding config to `SkillFolderEditorDialog` (the editor drawer)
-   Users create a folder quickly, then configure advanced features when needed

#### 2. Add Execution Mode Selector to Folder Editor

The discussion's "Choose Goal" maps to the existing `executionMode` concept:

| Discussion Term          | Backend Concept      | Description                        |
| ------------------------ | -------------------- | ---------------------------------- |
| "Write content only"     | `summary` mode       | Markdown-only, no media processing |
| "Add media with AI"      | `multimodal` mode    | Upload assets, AI captioning       |
| "Build full AI workflow" | Future (not Phase 5) | Node-based execution (deferred)    |

**Implementation:** Add an execution mode selector to the `SkillFolderEditorDialog` settings area, beside the caption model config.

#### 3. Add Embedding Model Config to Folder Editor

This is the primary Phase 5 UI requirement — let users select and configure the embedding model for semantic retrieval.

**Implementation:** Create `EmbeddingModelInputHandler` (mirror `CaptionModelInputHandler` pattern) and add it as a section in `SkillFolderEditorDialog`.

---

## UI Work Items

### WI-P5-UI-1: Embedding Model Config UI

**Priority:** P1 (blocks embedding generation UX)

Add embedding model configuration section to the folder editor dialog.

**What to build:**

-   `EmbeddingModelInputHandler.jsx` component
    -   Provider dropdown (OpenAI, Cohere, HuggingFace, Ollama, etc.)
    -   Model name input
    -   Credential selector (reuse existing credential picker)
    -   Dimensions override (optional, advanced)
    -   Batch size (optional, advanced)
-   Section in `SkillFolderEditorDialog` under model configuration area

**Pattern to follow:** `CaptionModelInputHandler` — same provider/model/credential pattern

**Files to create:**
| File | Purpose |
|------|---------|
| `packages/ui/src/views/tools/EmbeddingModelInputHandler.jsx` | Embedding model config UI |

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Add embedding model config section |
| `packages/ui/src/api/skillfolders.js` | Save `embeddingModelConfig` on update |

---

### WI-P5-UI-2: Execution Mode Selector

**Priority:** P2 (UX improvement, not blocking)

Add a user-friendly mode selector to the folder editor.

**What to build:**

-   Mode selector with 2 options:
    -   **Content Only** (`summary`) — "Focus on writing markdown skills"
    -   **Content + Media** (`multimodal`) — "Upload files with AI-powered captions"
-   Visual cards or radio group with descriptions
-   Placed in the folder editor settings area

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Add execution mode selector |

---

### WI-P5-UI-3: Enhanced Empty States

**Priority:** P3 (polish)

Improve the empty state when a folder has no files, guiding users based on the folder's configuration.

**What to build:**

-   If no embedding model configured → hint: "Configure an embedding model for smarter skill retrieval"
-   If no files → clear CTA: "Create your first skill" with action button
-   If files exist but no nodes → hint: "Write markdown content to enable AI-powered features"

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Enhanced empty states |

---

### WI-P5-UI-4: Embedding Status Indicator

**Priority:** P2 (visibility into embedding state)

Show users whether embeddings are generated for their skill files.

**What to build:**

-   Small badge/indicator in the Nodes tab showing:
    -   "Embedded" (green) — embeddings exist and are current
    -   "Not embedded" (gray) — no embedding model configured
    -   "Outdated" (yellow) — content changed since last embedding
    -   "Embedding..." (spinner) — generation in progress
-   Embedding stats in Summary tab:
    -   Total nodes with embeddings
    -   Embedding model name
    -   Last embedded timestamp

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Embedding status in Nodes/Summary tabs |

---

### WI-P5-UI-5: Re-embed Action

**Priority:** P2 (admin capability)

Allow users to force re-embed all nodes in a folder (e.g., after model change).

**What to build:**

-   "Re-embed All" button in folder settings/model config area
-   Confirmation dialog: "This will re-generate embeddings for all nodes. Continue?"
-   Progress indication during re-embedding

**API endpoint needed:**

```
POST /api/v1/skill-folders/:folderId/reembed
```

**Files to create:**
| File | Purpose |
|------|---------|
| None — reuse existing API pattern | |

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui/src/api/skillfolders.js` | Add `reembedFolder(folderId)` API call |
| `packages/ui/src/views/tools/SkillFolderEditorDialog.jsx` | Re-embed button + confirmation |
| `packages/server/src/routes/skill-folders/index.ts` | Add `POST /:id/reembed` route |
| `packages/server/src/controllers/skill-folders/index.ts` | Add reembed handler |
| `packages/server/src/services/skill-folders/index.ts` | Call `reembedFolder()` |

---

## Combined Implementation Order

### Phase 5A — Foundation (Backend)

```
1. WI-P5-1  SkillNodeEmbedding Entity + Migration          ✅ DONE
2. WI-P5-2  Embedding Model Configuration (column)         ✅ DONE
3. WI-P5-3  Embedding Generation Service                   ✅ DONE
4. WI-P5-8  Populate embeddingText                         → Build next
```

### Phase 5B — Core Engine (Backend + UI)

```
5. WI-P5-4     Semantic Retrieval Engine                   → Build
6. WI-P5-5     Node-First Runtime Architecture             → Build (parallel with 5)
7. WI-P5-UI-1  Embedding Model Config UI                   → Build (parallel with 5-6)
```

### Phase 5C — Integration (Backend + UI)

```
8. WI-P5-7     SkillTool Integration                       → After 5+6
9. WI-P5-6     Embedding Lifecycle Management              → After 8
10. WI-P5-UI-2 Execution Mode Selector                     → After 7
11. WI-P5-UI-4 Embedding Status Indicator                  → After 7
12. WI-P5-UI-5 Re-embed Action                             → After 9
```

### Phase 5D — Polish

```
13. WI-P5-9    Performance Optimizations                   → After system is functional
14. WI-P5-UI-3 Enhanced Empty States                       → Anytime
```

---

## What We're NOT Building (Discussion Items Deferred)

| Discussion Idea                                        | Reason for Deferral                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| 3-step folder creation wizard                          | Over-engineered for a 4-field form; current dialog is sufficient |
| Right panel contextual help                            | Adds complexity without proportional value at this stage         |
| Review & Create step                                   | Unnecessary confirmation for simple folder creation              |
| "Build full AI workflow" mode                          | No backend support for node-based execution in Phase 5           |
| Post-creation redirect with mode-specific empty states | Current empty state is adequate; enhance incrementally           |
| "AI Not Connected" edge state dialogs                  | Handle in-line with existing error patterns instead              |

---

## Testing Strategy

### Backend Unit Tests

-   `cosineSimilarity()` — correctness with known vectors
-   `computeHybridScore()` — weight application, fallback behavior
-   `retrieveRelevantNodes()` — semantic ranking, mandatory node inclusion, edge expansion
-   `formatNodesForLLM()` — type tag formatting, ordering, empty types omitted
-   `prepareEmbeddingText()` — prefix application, trigger appending
-   Incremental embedding — skip unchanged nodes, re-embed changed ones
-   Lifecycle — cascade delete, model change detection

### Integration Tests

-   Full flow: save file → extract nodes → generate embeddings → retrieve → format
-   Graceful degradation: no embedding config → keyword-only retrieval
-   Model change: update config → re-embed all nodes
-   File delete → embeddings cleaned up

### UI Tests

-   Embedding model config: select provider → enter model → save → verify persisted
-   Re-embed action: click → confirm → verify completion
-   Embedding status: shows correct state (embedded/not/outdated)

---

## Risk Assessment

| Risk                                  | Mitigation                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Embedding API latency slows file save | Embedding is async and non-blocking; extraction succeeds even if embedding fails |
| JSON vector storage too slow at scale | Sufficient for hundreds–low thousands of nodes; pgvector migration path exists   |
| Hybrid scoring weights not optimal    | Fixed defaults (0.6/0.25/0.15) with future auto-tuning path                      |
| Users confused by embedding config    | Opt-in semantics — system works without it; config is in advanced settings area  |
| Breaking existing skill behavior      | Full backward compatibility — no embedding config = Phase 4 keyword mode         |

---

## Success Criteria

1. **Semantic retrieval works** — "write concisely" retrieves node containing "keep it brief"
2. **No regression** — skills without embedding config behave identically to Phase 4
3. **Node-first format** — LLM receives `[ROLE]`/`[RULE]`/`[DO]`/`[KNOW]` tagged content
4. **UI configurable** — users can select embedding model and see embedding status
5. **Lifecycle managed** — embeddings stay in sync across all mutation paths (save/delete/model change)
6. **Performance** — cosine similarity < 5ms for 1000 nodes; query embedding < 100ms
