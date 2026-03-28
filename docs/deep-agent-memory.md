# Deep Agent Conversation Memory

## Problem

Previously, each time a user sent a message in a Deep Agent session, the orchestrator created a **fresh agent with no memory**. It only passed the current user prompt:

```typescript
// Before — no history
agent.streamEvents({ messages: [new HumanMessage(userPrompt)] }, { version: 'v2', recursionLimit: 1000 })
```

This meant:

-   The agent had **no knowledge of previous conversation turns**
-   If the user asked "improve the introduction section", the agent didn't know what report existed
-   The existing artifact (report) was **invisible** to the agent — it couldn't read or edit it
-   Every message started a completely new research cycle from scratch

## Solution

The orchestrator now loads **conversation history** and **existing artifact content** before each agent execution, giving the agent full context of the session.

### Conversation History

Previous messages are loaded from the database and converted to LangChain message objects:

```
DB Messages (ordered by createdDate ASC):
  [user] "Research AI trends in 2026"          → HumanMessage
  [assistant] "Research completed. The report..." → AIMessage
  [user] "Improve the introduction section"     → (current prompt, appended separately)
```

The method `buildConversationHistory()` loads all messages except the last one (which is the current prompt already saved by the controller) and maps them:

| DB Role     | LangChain Type        |
| ----------- | --------------------- |
| `user`      | `HumanMessage`        |
| `assistant` | `AIMessage`           |
| `system`    | `AIMessage` (context) |
| `tool`      | `AIMessage` (context) |

### Artifact Pre-seeding

When an artifact (report) already exists in the session, its content is injected into the agent's **virtual file system** as `/final_report.md`:

```typescript
// FileData structure expected by deepagents StateBackend
{
    '/final_report.md': {
        content: artifactContent.split('\n'),  // array of lines
        created_at: '2026-03-27T...',
        modified_at: '2026-03-27T...'
    }
}
```

This means the agent can:

-   **`read_file /final_report.md`** — see the current report content
-   **`edit_file /final_report.md`** — make targeted changes (e.g., improve a section)
-   **`write_file /final_report.md`** — rewrite the entire report if needed

The orchestrator also pre-seeds `reportContent` and `artifactId` so that artifact updates from `edit_file` stream events correctly apply string replacements on top of the existing content and update the right database record.

## Architecture

```
User sends: "Improve the introduction section"
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  Controller: index.ts                        │
│  1. Save user message to DB                  │
│  2. Fire-and-forget: execute(sessionId, ...) │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  Orchestrator: orchestrator-v2.ts            │
│                                              │
│  ┌─ buildConversationHistory(sessionId) ───┐ │
│  │  Load DB messages → LangChain messages  │ │
│  │  [HumanMessage, AIMessage, ...]         │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ buildInitialFiles(artifactContent) ────┐ │
│  │  Load latest artifact → FileData        │ │
│  │  { '/final_report.md': { content } }    │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  agent.streamEvents({                        │
│    messages: [...history, currentPrompt],    │
│    files: initialFiles                       │
│  })                                          │
│                                              │
│  Agent now knows:                            │
│  ✓ Full conversation history                 │
│  ✓ Current report content (read/edit)        │
│  ✓ What the user is asking for               │
└──────────────────────────────────────────────┘
```

## User Experience

### First Message (new session)

```
User: "Research AI trends in 2026"
→ Agent: plans research → conducts search → writes final_report.md → report appears in artifact panel
```

### Follow-up Message (existing session with report)

```
User: "Improve the introduction section, add more statistics"
→ Agent: reads existing final_report.md → edits the introduction → artifact updates in-place
```

### Another Follow-up

```
User: "Add a section about quantum computing"
→ Agent: reads existing report → edits/appends new section → artifact updates
```

The agent sees the full thread and can make targeted improvements instead of starting over.

## Files Changed

| File                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/server/src/controllers/deep-agents/orchestrator-v2.ts` | Added `AIMessage` and `FileData` imports. Added `buildConversationHistory()` method to load DB messages as LangChain messages. Added `buildInitialFiles()` method to pre-seed artifact content into agent file state. Updated `runAgent()` to pass full conversation history + initial files to `agent.streamEvents()`. Pre-seeds `reportContent` and `artifactId` from existing artifact. |

## Checklist

-   [x] Load previous messages from DB via `getMessagesBySessionId()`
-   [x] Convert DB messages to LangChain `HumanMessage`/`AIMessage`
-   [x] Exclude current prompt from history (already appended separately)
-   [x] Load latest artifact via `getLatestArtifact()`
-   [x] Inject artifact content as `/final_report.md` in agent file state
-   [x] Pre-seed `reportContent` for correct `edit_file` string replacement
-   [x] Pre-seed `artifactId` for correct DB artifact updates
-   [x] TypeScript build passes with no errors
-   [x] No changes to controller API or database schema
