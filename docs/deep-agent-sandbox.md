# Deep Agent Sandbox — File Operation Security

## Overview

The Deep Agent orchestrator uses the **`deepagents`** LangChain framework to conduct research and generate reports. During execution, the agent uses `write_file` and `edit_file` tools to create and modify files (e.g., `question.txt`, `final_report.md`).

**Without proper sandboxing, these file operations could write directly to the host server's filesystem**, creating a serious security vulnerability — especially in multi-tenant or cloud-hosted deployments.

This document describes how file operations are sandboxed to prevent filesystem attacks.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  User Prompt (via SSE)                               │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │         DeepAgentOrchestratorV2                 │  │
│  │  (orchestrator-v2.ts)                          │  │
│  │                                                │  │
│  │  agent.streamEvents() ──► SSE events           │  │
│  └──────────────┬─────────────────────────────────┘  │
│                 │                                     │
│  ┌──────────────▼─────────────────────────────────┐  │
│  │        createResearchAgent()                    │  │
│  │  (deep-agent.ts)                               │  │
│  │                                                │  │
│  │  ChatOpenAI + Tavily + SubAgents               │  │
│  │  backend: StateBackend (in-memory)   ◄── SAFE  │  │
│  └──────────────┬─────────────────────────────────┘  │
│                 │                                     │
│  ┌──────────────▼─────────────────────────────────┐  │
│  │          StateBackend                           │  │
│  │  (from deepagents framework)                   │  │
│  │                                                │  │
│  │  • Files stored in LangGraph state (RAM)       │  │
│  │  • write_file → state update (no disk I/O)     │  │
│  │  • edit_file  → state update (no disk I/O)     │  │
│  │  • Garbage collected when session ends          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ❌ Host Filesystem — NEVER accessed                 │
└──────────────────────────────────────────────────────┘
```

## How It Works

### StateBackend (Default — In-Memory Sandbox)

The `createResearchAgent()` factory in `deep-agent.ts` explicitly configures a **`StateBackend`** as the file operations backend:

```typescript
import { createDeepAgent, StateBackend, type BackendProtocol } from 'deepagents'

const backend = config?.backend
  ?? ((runtime: { state: unknown }) => new StateBackend(runtime as any))

return createDeepAgent({
    model: new ChatOpenAI({ ... }),
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: [critiqueSubAgent, researchSubAgent],
    backend   // ← explicitly sandboxed
})
```

**Key properties of `StateBackend`:**

| Property         | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Storage location | LangGraph agent state (JavaScript heap)                            |
| Disk access      | **None** — files never touch the filesystem                        |
| Persistence      | Session-scoped — garbage collected when agent finishes             |
| Isolation        | Per-execution — each `createResearchAgent()` call gets fresh state |
| Performance      | Fast — pure in-memory reads/writes                                 |

### What Happens When the Agent Writes a File

1. Agent calls `write_file` with path `/final_report.md` and content
2. The `deepagents` framework routes this through the configured `StateBackend`
3. `StateBackend.write()` stores the file data in the LangGraph state dictionary
4. The framework returns a `WriteResult` with `filesUpdate` containing the new state
5. LangGraph merges the file data into its internal state
6. The orchestrator intercepts the `on_tool_start` stream event to extract the content for the UI artifact display

**At no point does any data touch the host filesystem.**

### Stream Event Interception

The orchestrator (`orchestrator-v2.ts`) listens for `write_file` and `edit_file` stream events to sync the report content with the database artifact:

```
on_tool_start: write_file → parse input → upsert artifact (DB) → SSE artifact_patch
on_tool_start: edit_file  → parse input → apply string replace → upsert artifact (DB) → SSE artifact_patch
```

This is a **read-only observation** of the tool call metadata — the actual file write happens entirely within the `StateBackend`.

---

## Security Model

### Threat: Arbitrary File Write

**Without sandbox:** If the agent were to use `FilesystemBackend` or `LocalShellBackend`, a `write_file` call to a path like `/etc/passwd` or `../../server/src/index.ts` would write directly to the host filesystem.

**With StateBackend:** All file paths are keys in an in-memory dictionary. Writing to `/etc/passwd` simply creates an in-memory entry — the host filesystem is never accessed.

### Threat: Path Traversal

`StateBackend` does not resolve paths against a real filesystem root. Paths like `../../etc/passwd` or `/absolute/path` are treated as opaque string keys in the state dictionary. No directory traversal is possible.

### Threat: Resource Exhaustion

Since files are stored in heap memory, an agent generating extremely large files could consume server memory. This is mitigated by:

-   LangGraph's `recursionLimit` (set to 1000 by default)
-   The natural scope of research reports (typically < 1 MB)
-   Session-scoped lifecycle — memory is freed when the agent completes

---

## Configuration

### Default (No Configuration Needed)

```bash
# StateBackend is used automatically — no env vars required for sandboxing
DEEP_AGENT_OPENAI_API_KEY=sk-...
DEEP_AGENT_MODEL=gpt-4o-mini
TAVILY_API_KEY=tvly-...
```

### Custom Backend (Advanced)

The `createResearchAgent()` factory accepts a `backend` parameter for advanced use cases:

```typescript
import { createResearchAgent, type ResearchAgentConfig } from './deep-agent'

// Example: using a custom backend
const agent = createResearchAgent({
    backend: myCustomSandboxBackend
})
```

### Available Backend Options

| Backend               | Package                 | Description                  | Use Case                          |
| --------------------- | ----------------------- | ---------------------------- | --------------------------------- |
| **StateBackend**      | `deepagents` (built-in) | In-memory, LangGraph state   | **Default** — research reports    |
| **FilesystemBackend** | `deepagents` (built-in) | Writes to disk               | ⚠️ NOT recommended for production |
| **LocalShellBackend** | `deepagents` (built-in) | Disk + shell execution       | ⚠️ NOT recommended for production |
| Modal Sandbox         | `@langchain/modal`      | Serverless Docker containers | Code execution in isolation       |
| Deno Sandbox          | `@langchain/deno`       | Linux microVMs               | Lightweight code execution        |
| Daytona Sandbox       | `@langchain/daytona`    | Cloud dev environments       | Full IDE-like sandboxing          |

To use an external sandbox, install the provider package and pass it as the `backend`:

```typescript
// Example: Modal sandbox (requires @langchain/modal)
import { ModalSandbox } from '@langchain/modal'

const sandbox = new ModalSandbox({ apiKey: process.env.MODAL_API_KEY })
const agent = createResearchAgent({ backend: sandbox })
```

---

## Files Changed

| File                                                             | Change                                                                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server/src/controllers/deep-agents/deep-agent.ts`      | Import `StateBackend`, `BackendProtocol` from `deepagents`. Added `backend` field to `ResearchAgentConfig`. Pass `StateBackend` factory as default backend to `createDeepAgent()`. |
| `packages/server/src/controllers/deep-agents/orchestrator-v2.ts` | No changes needed — the orchestrator already reads file content from stream events, not from disk. Removed debug `console.log` statements.                                         |

---

## Checklist

-   [x] `StateBackend` explicitly configured in `createResearchAgent()`
-   [x] `BackendProtocol` type exported for custom backend injection
-   [x] `ResearchAgentConfig.backend` field added for override
-   [x] No `FilesystemBackend` or `LocalShellBackend` used anywhere
-   [x] No `fs.writeFile` / `fs.readFile` calls in the orchestrator
-   [x] Debug `console.log` statements removed from orchestrator-v2.ts
-   [x] TypeScript build passes with no errors
-   [ ] (Future) Add env var `DEEP_AGENT_SANDBOX_PROVIDER` for provider selection
-   [ ] (Future) Integrate external sandbox (Modal/Deno/Daytona) for code execution use cases
