# Deep Agents — Feature Requirement Document

> **Version:** 1.0  
> **Status:** Draft  
> **Last Updated:** 2026-03-23

---

## Table of Contents

1. [System Vision](#1-system-vision)
2. [Core Product Requirements](#2-core-product-requirements)
    - [Functional Requirements](#functional-requirements)
    - [Non-Functional Requirements](#non-functional-requirements)
3. [Architecture Requirements](#3-architecture-requirements)
4. [Data Model](#4-data-model)
5. [API Design](#5-api-design)
6. [UI/UX Specification](#6-uiux-specification)
7. [Security Requirements](#7-security-requirements)
8. [V1 Scope Definition](#8-v1-scope-definition)
9. [Future Extensions](#9-future-extensions)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. System Vision

Build a **Deep Agents** capability inside Flowise that allows users to interact through chat to trigger deep research workflows producing structured deliverables.

### Technology Stack

-   **LangChain Deep Agents** — core agent orchestration framework
-   **Deno runtime** via `@langchain/deno` — secure sandboxed tool execution
-   **Sandbox backends** — Daytona, E2B, Runloop, or Modal for isolated code execution

### Reference Implementation

```js
import 'dotenv/config'
import { DaytonaSandbox } from '@langchain/daytona'
import { createDeepAgent } from 'deepagents'

const sandbox = await DaytonaSandbox.create()

const agent = createDeepAgent({
    backend: sandbox,
    systemPrompt: 'You are a coding assistant with sandbox access. You can create and run code in the sandbox.'
})

try {
    const result = await agent.invoke({
        messages: [
            {
                role: 'user',
                content: 'Create a hello world Python script and run it'
            }
        ]
    })
    const lastMessage = result.messages[result.messages.length - 1]
    console.log(typeof lastMessage.content === 'string' ? lastMessage.content : String(lastMessage.content))
} finally {
    await sandbox.close()
}
```

### Goal

Allow users to interact through chat to trigger deep research workflows that produce structured deliverables:

-   Markdown (`.md`)
-   Text (`.txt`)
-   HTML (`.html`)

The generated artifact is displayed in a **split interface**:

| Left Panel        | Right Panel                         |
| ----------------- | ----------------------------------- |
| Chat conversation | Generated document/artifact preview |

### Example Use Cases

-   "Research AI regulation in Japan"
-   "Compare Redis vs Cassandra for audit logs"
-   "Generate architecture proposal for SCIM sync"
-   "Create a hello world Python script and run it"

---

## 2. Core Product Requirements

### Functional Requirements

#### FR-1: Chat-driven Research Execution

Users submit natural language prompts to initiate deep research workflows.

**System must:**

1. Understand task intent from the user prompt
2. Plan multi-step execution automatically
3. Call tools as needed (web search, fetch URL, summarize, etc.)
4. Accumulate findings across tool executions
5. Generate a final structured artifact

**Acceptance Criteria:**

-   [ ] User can type a research prompt and receive a structured artifact
-   [ ] Agent decomposes complex prompts into actionable steps
-   [ ] Progress is visible to the user during execution
-   [ ] Results are persisted and retrievable after completion

---

#### FR-2: Deep Agent Planning Layer

The agent must support autonomous multi-step planning and execution.

**Planning pipeline:**

```
User Request → Planner → Tool Executor → Memory Accumulator → Artifact Generator
```

**Agent capabilities:**

| Capability          | Description                                      |
| ------------------- | ------------------------------------------------ |
| Task decomposition  | Break user request into ordered sub-tasks        |
| Iterative reasoning | Refine plan based on intermediate results        |
| Step tracking       | Track and display each step's status             |
| Retry on failure    | Automatically retry failed tool calls            |
| Long-running state  | Maintain execution state across async operations |

**Acceptance Criteria:**

-   [ ] Agent produces a visible execution plan before running tools
-   [ ] Each step status is tracked (pending → running → completed/failed)
-   [ ] Failed steps are retried up to a configurable limit (default: 3)
-   [ ] Agent adapts plan based on tool outputs (iterative reasoning)

---

#### FR-3: Tool Execution Runtime

Tool execution is isolated using `@langchain/deno` for security and reliability.

**Why Deno:**

-   Sandboxed execution with permission control
-   Secure file handling
-   Runtime isolation per task
-   Network permission restrictions

**Built-in tools (V1):**

| Tool               | Description                            |
| ------------------ | -------------------------------------- |
| `web_search`       | Search the web for information         |
| `fetch_url`        | Fetch and parse content from a URL     |
| `parse_document`   | Extract structured data from documents |
| `summarize_source` | Summarize fetched content using LLM    |
| `generate_file`    | Generate content to an artifact        |

**Acceptance Criteria:**

-   [ ] Tools execute in an isolated Deno sandbox
-   [ ] Each tool has explicit permission grants (net, read, write)
-   [ ] Tool failures do not crash the agent — graceful fallback
-   [ ] Tool execution logs are captured and stored per session

---

#### FR-4: Artifact Output Generation

The system produces versioned, structured output artifacts.

**Supported output formats (V1):**

| Format     | Extension | Renderer                                   |
| ---------- | --------- | ------------------------------------------ |
| Markdown   | `.md`     | Markdown renderer with syntax highlighting |
| Plain Text | `.txt`    | Plain text viewer                          |
| HTML       | `.html`   | HTML renderer (sandboxed iframe)           |

**Artifact metadata schema:**

| Field         | Type      | Description                         |
| ------------- | --------- | ----------------------------------- |
| `artifact_id` | UUID      | Unique artifact identifier          |
| `session_id`  | UUID      | Parent session reference            |
| `type`        | enum      | `markdown`, `text`, `html`          |
| `content`     | text      | The artifact content body           |
| `version`     | integer   | Incremental version number          |
| `status`      | enum      | `drafting`, `updating`, `completed` |
| `created_at`  | timestamp | Creation time                       |
| `updated_at`  | timestamp | Last update time                    |

**Acceptance Criteria:**

-   [ ] Artifact is generated after task completes
-   [ ] Artifact versions are stored (not overwritten)
-   [ ] Previous versions are retrievable
-   [ ] Re-generation from same session is supported
-   [ ] Artifact content can be streamed incrementally

---

#### FR-5: Split UI Workspace

A dedicated split-panel interface for Deep Agents sessions.

**Left Panel — Chat:**

-   User prompt input
-   Agent intermediate updates (step-by-step progress)
-   Progress logs and status indicators
-   Follow-up prompt capability

**Right Panel — Artifact Preview:**

-   Markdown renderer with syntax highlighting
-   HTML renderer in sandboxed iframe
-   Plain text viewer
-   Version selector dropdown

**UI Behavior:**

-   Chat updates stream in real-time while artifact updates incrementally
-   Artifact panel shows "Drafting..." / "Updating..." / "Completed" status
-   Resizable split pane with drag handle
-   Artifact panel collapses gracefully on mobile

**Acceptance Criteria:**

-   [ ] Split panel layout renders with chat left, artifact right
-   [ ] Chat messages stream in real-time
-   [ ] Artifact content streams incrementally (not only on completion)
-   [ ] User can send follow-up prompts during or after generation
-   [ ] Split pane is resizable
-   [ ] Loading/progress states are clearly indicated

---

#### FR-6: Incremental Draft Updates

Artifacts should update progressively, not wait for full completion.

**Version lifecycle:**

| Phase   | Status      | User Sees                              |
| ------- | ----------- | -------------------------------------- |
| Phase 1 | `drafting`  | "Drafting..." — partial outline        |
| Phase 2 | `updating`  | "Adding sources..." — expanded content |
| Phase 3 | `completed` | "Completed" — final artifact           |

**Streaming behavior:**

-   LLM token stream → visible in chat panel
-   Tool progress stream → visible as step-by-step updates
-   Artifact patch stream → visible as incremental content updates in artifact panel

**Acceptance Criteria:**

-   [ ] Artifact shows partial content during generation
-   [ ] Status indicator transitions through drafting → updating → completed
-   [ ] Content appends smoothly without layout jumps
-   [ ] User can read partial artifact while generation continues

---

#### FR-7: Session Persistence

Each research session is fully persisted and recoverable.

**Persisted data:**

```
Session
 ├── Messages (user prompts + agent responses)
 ├── Agent Steps (plan, execution trace)
 ├── Tool Results (inputs, outputs, errors per tool call)
 └── Artifact Versions (all versions of generated content)
```

**Acceptance Criteria:**

-   [ ] Sessions are listed on the Deep Agents index page
-   [ ] User can reopen a completed session and view all history
-   [ ] Session data includes full message history
-   [ ] Session data includes all tool execution results
-   [ ] Artifact versions are browsable within a session
-   [ ] Sessions can be deleted by the user

---

#### FR-8: File Export

Users can download generated artifacts.

**V1 export formats:**

-   Download as Markdown (`.md`)
-   Download as HTML (`.html`)
-   Download as Plain Text (`.txt`)

**Future export formats (post-V1):**

-   PDF (`.pdf`)
-   DOCX (`.docx`)

**Acceptance Criteria:**

-   [ ] Export button is visible in artifact panel toolbar
-   [ ] Each supported format downloads correctly
-   [ ] Downloaded file name includes session context (e.g., `research-ai-regulation-japan.md`)
-   [ ] Export works for all artifact versions, not just the latest

---

### Non-Functional Requirements

#### NFR-1: Long-running Execution Support

Deep research tasks may run for several minutes.

**Requirements:**

| Capability      | Implementation                                                |
| --------------- | ------------------------------------------------------------- |
| Async execution | Agent runs as a background job, not blocking the HTTP request |
| Resumable jobs  | If server restarts, pending jobs can resume                   |
| Cancel support  | User can cancel a running session                             |
| Queue-based     | Use BullMQ (already available in Flowise infrastructure)      |

**Acceptance Criteria:**

-   [ ] Agent execution runs asynchronously via job queue
-   [ ] User can navigate away and return to see results
-   [ ] Cancel button stops execution and marks session as cancelled
-   [ ] Server restart does not lose in-progress job state

---

#### NFR-2: Streaming

Real-time streaming across all layers.

**Streaming layers:**

| Layer                 | Transport       | Content                      |
| --------------------- | --------------- | ---------------------------- |
| LLM token stream      | SSE / WebSocket | Chat response tokens         |
| Tool progress stream  | SSE / WebSocket | Step status + tool outputs   |
| Artifact patch stream | SSE / WebSocket | Incremental artifact content |

**Acceptance Criteria:**

-   [ ] Chat messages stream token-by-token
-   [ ] Agent step progress updates in real-time
-   [ ] Artifact content streams as it's generated
-   [ ] Connection drop triggers automatic reconnect with state recovery

---

#### NFR-3: Secure Sandbox

All tool execution must run in a restricted sandbox.

**Deno permission model per task:**

| Permission | Flag            | Scope                                |
| ---------- | --------------- | ------------------------------------ |
| Network    | `--allow-net`   | Restricted to allowed domains        |
| Read       | `--allow-read`  | Restricted to task working directory |
| Write      | `--allow-write` | Restricted to task working directory |

**Security rules:**

-   Never expose unrestricted execution
-   Each task gets its own isolated sandbox instance
-   Sandbox is destroyed after task completion
-   No access to host filesystem outside working directory
-   Network requests logged for audit

**Acceptance Criteria:**

-   [ ] Tools execute in Deno with explicit permission flags
-   [ ] Sandbox instance is isolated per task
-   [ ] Sandbox is cleaned up after task completion
-   [ ] No unrestricted `--allow-all` is ever used
-   [ ] Network access is restricted to an allowlist

---

#### NFR-4: Multi-tenant Isolation

For Flowise production environments, full tenant isolation is required.

**Isolation boundaries:**

| Scope          | Purpose                |
| -------------- | ---------------------- |
| `workspace_id` | Tenant-level isolation |
| `user_id`      | User-level ownership   |
| `session_id`   | Session-level context  |
| `artifact_id`  | Artifact-level access  |

**Acceptance Criteria:**

-   [ ] Users can only access sessions in their own workspace
-   [ ] Session data is scoped by workspace_id and user_id
-   [ ] API endpoints enforce workspace/user authorization
-   [ ] No cross-workspace data leakage in queries

---

#### NFR-5: Failure Recovery

The agent must be resilient to tool failures.

**Recovery strategy:**

```
Tool failed → retry (up to max_retries) → fallback tool → skip & continue plan → report partial results
```

**Acceptance Criteria:**

-   [ ] Agent retries failed tool calls (configurable, default: 3)
-   [ ] Agent can skip non-critical steps and continue
-   [ ] Partial results are delivered if some tools fail
-   [ ] All failures are logged with error details

---

## 3. Architecture Requirements

### High-Level Architecture

```
┌─────────────────────── Frontend ───────────────────────┐
│                                                         │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │   Chat Panel     │    │   Artifact Panel          │  │
│  │                  │    │                           │  │
│  │  - User input    │    │  - Markdown renderer      │  │
│  │  - Agent steps   │    │  - HTML renderer          │  │
│  │  - Progress log  │    │  - Text viewer            │  │
│  │  - Follow-ups    │    │  - Version selector       │  │
│  │                  │    │  - Export toolbar          │  │
│  └──────────────────┘    └───────────────────────────┘  │
│                                                         │
└───────────────────────────┬─────────────────────────────┘
                            │ SSE / WebSocket
                            ▼
┌──────────────────── Backend API ────────────────────────┐
│                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │  Session      │  │  Agent         │  │  Artifact    │  │
│  │  Service      │  │  Orchestrator  │  │  Service     │  │
│  └──────────────┘  └───────────────┘  └──────────────┘  │
│                                                         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌──────────────── Execution Layer ────────────────────────┐
│                                                         │
│  ┌───────────────────┐    ┌──────────────────────────┐  │
│  │  LangChain         │    │  Deno Tool Runner        │  │
│  │  DeepAgent         │    │  (sandboxed execution)   │  │
│  └───────────────────┘    └──────────────────────────┘  │
│                                                         │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌──────────────── Persistence Layer ──────────────────────┐
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ PostgreSQL│  │ Redis / Queue│  │  File Storage    │   │
│  │ (sessions,│  │ (BullMQ jobs)│  │  (artifacts)     │   │
│  │ artifacts)│  │              │  │                  │   │
│  └──────────┘  └──────────────┘  └──────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Backend Services

#### Session Service

| Responsibility | Details                              |
| -------------- | ------------------------------------ |
| Create session | Initialize a new deep agent session  |
| Load session   | Retrieve session with full history   |
| Update session | Append messages, steps, tool results |
| List sessions  | Paginated list for the index page    |
| Delete session | Remove session and associated data   |

#### Agent Orchestrator

| Responsibility         | Details                            |
| ---------------------- | ---------------------------------- |
| Create execution graph | Build the LangChain DeepAgent plan |
| Invoke tools           | Execute tools via Deno sandbox     |
| Collect outputs        | Gather intermediate results        |
| Stream updates         | Push real-time updates to frontend |
| Handle failures        | Retry and fallback logic           |

#### Artifact Service

| Responsibility     | Details                             |
| ------------------ | ----------------------------------- |
| Create artifact    | Initialize artifact for a session   |
| Update content     | Append/patch artifact content       |
| Version management | Create new version on major updates |
| Export             | Generate downloadable files         |

### Execution Flow

```
1. User sends prompt
2. Session created (or resumed)
3. DeepAgent creates execution plan
4. Tool runner executes plan steps in sandbox
5. Intermediate steps streamed to frontend
6. Artifact updated incrementally
7. Final output persisted
8. Session marked as completed
```

---

## 4. Data Model

### Entity Relationship

```
┌──────────────────┐       ┌──────────────────────┐
│  DeepAgentSession │───1:N──│  DeepAgentMessage     │
│──────────────────│       │──────────────────────│
│  id (PK)         │       │  id (PK)             │
│  workspace_id    │       │  session_id (FK)     │
│  user_id         │       │  role (enum)         │
│  title           │       │  content (text)      │
│  status (enum)   │       │  created_at          │
│  created_at      │       └──────────────────────┘
│  updated_at      │
└──────┬───────────┘
       │
       ├───1:N──┐
       │        ▼
       │  ┌──────────────────────┐
       │  │  DeepAgentStep        │
       │  │──────────────────────│
       │  │  id (PK)             │
       │  │  session_id (FK)     │
       │  │  step_index (int)    │
       │  │  description (text)  │
       │  │  status (enum)       │
       │  │  tool_name (varchar) │
       │  │  tool_input (json)   │
       │  │  tool_output (json)  │
       │  │  error (text)        │
       │  │  started_at          │
       │  │  completed_at        │
       │  └──────────────────────┘
       │
       └───1:N──┐
                ▼
          ┌──────────────────────┐
          │  DeepAgentArtifact    │
          │──────────────────────│
          │  id (PK)             │
          │  session_id (FK)     │
          │  type (enum)         │
          │  content (text)      │
          │  version (int)       │
          │  status (enum)       │
          │  created_at          │
          │  updated_at          │
          └──────────────────────┘
```

### Enums

| Enum             | Values                                                  |
| ---------------- | ------------------------------------------------------- |
| `SessionStatus`  | `active`, `running`, `completed`, `failed`, `cancelled` |
| `MessageRole`    | `user`, `assistant`, `system`, `tool`                   |
| `StepStatus`     | `pending`, `running`, `completed`, `failed`, `skipped`  |
| `ArtifactType`   | `markdown`, `text`, `html`                              |
| `ArtifactStatus` | `drafting`, `updating`, `completed`                     |

---

## 5. API Design

### REST Endpoints

#### Sessions

| Method   | Endpoint                                  | Description                      |
| -------- | ----------------------------------------- | -------------------------------- |
| `POST`   | `/api/v1/deep-agents/sessions`            | Create a new session             |
| `GET`    | `/api/v1/deep-agents/sessions`            | List all sessions (paginated)    |
| `GET`    | `/api/v1/deep-agents/sessions/:id`        | Get session detail with messages |
| `DELETE` | `/api/v1/deep-agents/sessions/:id`        | Delete a session                 |
| `POST`   | `/api/v1/deep-agents/sessions/:id/cancel` | Cancel a running session         |

#### Messages

| Method | Endpoint                                    | Description                         |
| ------ | ------------------------------------------- | ----------------------------------- |
| `POST` | `/api/v1/deep-agents/sessions/:id/messages` | Send a new message (triggers agent) |
| `GET`  | `/api/v1/deep-agents/sessions/:id/messages` | Get all messages in session         |

#### Artifacts

| Method | Endpoint                                                             | Description                   |
| ------ | -------------------------------------------------------------------- | ----------------------------- |
| `GET`  | `/api/v1/deep-agents/sessions/:id/artifacts`                         | List artifact versions        |
| `GET`  | `/api/v1/deep-agents/sessions/:id/artifacts/:version`                | Get specific artifact version |
| `GET`  | `/api/v1/deep-agents/sessions/:id/artifacts/latest/export?format=md` | Export artifact               |

#### Streaming

| Method | Endpoint                                  | Description                      |
| ------ | ----------------------------------------- | -------------------------------- |
| `GET`  | `/api/v1/deep-agents/sessions/:id/stream` | SSE stream for real-time updates |

### SSE Event Types

```
event: message        // Chat message token
event: step_update    // Agent step status change
event: artifact_patch // Incremental artifact content update
event: status         // Session status change
event: error          // Error notification
```

---

## 6. UI/UX Specification

### Sidebar Navigation

-   **Label:** "Deep Agents"
-   **Icon:** `IconBrain` (from @tabler/icons-react)
-   **URL:** `/deep-agents`
-   **Permission:** `deepAgents:view`
-   **Position:** Primary navigation group, after Document Stores

### Pages

#### 1. Deep Agents Index Page (`/deep-agents`)

-   Header with "Deep Agents" title and "New Session" button
-   List/grid of existing sessions showing:
    -   Session title (auto-generated from first prompt)
    -   Status badge (active / running / completed / failed / cancelled)
    -   Created date
    -   Last updated date
-   Click to open a session
-   Delete session action

#### 2. Deep Agent Session Page (`/deep-agents/:id`)

Split panel layout:

**Left Panel — Chat:**

-   Message input at bottom
-   Scrollable message history
-   Agent step indicators (collapsible)
-   Typing/thinking indicators during generation
-   Cancel button during execution

**Right Panel — Artifact:**

-   Toolbar: version selector, export button, copy button
-   Content area with format-appropriate renderer
-   Status indicator (drafting / updating / completed)
-   Empty state with placeholder when no artifact yet

**Resizable split:** Drag handle between panels, default 50/50

---

## 7. Security Requirements

| Requirement                           | Description                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| **SR-1: Sandbox isolation**           | All tool execution must occur in a Deno sandbox with explicit permission flags |
| **SR-2: No arbitrary code execution** | Users cannot execute arbitrary code on the host                                |
| **SR-3: Network allowlist**           | Sandbox network access restricted to configured allowed domains                |
| **SR-4: Input sanitization**          | User prompts validated and sanitized before processing                         |
| **SR-5: HTML rendering sandbox**      | Artifact HTML rendered in sandboxed iframe with CSP                            |
| **SR-6: Authorization**               | All API endpoints enforce workspace and user authorization                     |
| **SR-7: Rate limiting**               | Limit concurrent sessions per user to prevent resource exhaustion              |
| **SR-8: Audit logging**               | All session creation, tool execution, and exports are logged                   |

---

## 8. V1 Scope Definition

**V1 is designed to be narrow and mergeable.**

### In Scope (V1)

-   [x] Sidebar navigation item "Deep Agents"
-   [ ] Session list page (`/deep-agents`)
-   [ ] Session detail page with split panel (`/deep-agents/:id`)
-   [ ] Markdown output only (single format)
-   [ ] One artifact per session
-   [ ] Streaming updates (chat + artifact)
-   [ ] Basic tool set: `web_search`, `fetch_url`, `summarize_source`, `generate_file`
-   [ ] Session CRUD (create, read, delete)
-   [ ] File export (markdown only)
-   [ ] BullMQ-based async execution
-   [ ] Basic Deno sandbox integration

### Out of Scope (V1)

-   HTML/text artifact renderers (V2)
-   PDF/DOCX export (V2)
-   Source citation panel (V2)
-   Research tree explorer (V2)
-   Artifact diff viewer (V2)
-   Collaborative editing (V3)
-   Rerun selected section (V3)
-   Multiple artifacts per session (V3)

### Product Decision

**Artifact generation mode: Option A — Agent writes continuously**

The agent streams artifact content as it generates, providing the best UX with incremental visibility. This is more complex on the backend but significantly more powerful for Flowise.

---

## 9. Future Extensions

| Version | Feature                | Description                              |
| ------- | ---------------------- | ---------------------------------------- |
| V2      | Source citation panel  | Side panel showing referenced sources    |
| V2      | HTML/text renderers    | Support for additional artifact formats  |
| V2      | PDF/DOCX export        | Additional export formats                |
| V2      | Research tree explorer | Visual tree of agent's research path     |
| V3      | Artifact diff viewer   | Compare artifact versions side-by-side   |
| V3      | Collaborative editing  | Multiple users can view/edit artifacts   |
| V3      | Section rerun          | Re-execute specific sections of research |
| V3      | Multiple artifacts     | Multiple outputs per session             |

---

## 10. Implementation Checklist

### Phase 1: Foundation (Backend)

-   [ ] **1.1** Create database entities: `DeepAgentSession`, `DeepAgentMessage`, `DeepAgentStep`, `DeepAgentArtifact`
-   [ ] **1.2** Create database migrations for all entities
-   [ ] **1.3** Implement Session Service (CRUD operations)
-   [ ] **1.4** Implement Artifact Service (create, update, version, export)
-   [ ] **1.5** Add `deepAgents:view` permission to the RBAC system
-   [ ] **1.6** Register REST API routes under `/api/v1/deep-agents/`
-   [ ] **1.7** Implement session list endpoint (paginated, workspace-scoped)
-   [ ] **1.8** Implement session detail endpoint
-   [ ] **1.9** Implement session delete endpoint
-   [ ] **1.10** Implement message send endpoint (triggers agent execution)

### Phase 2: Agent Orchestration

-   [ ] **2.1** Integrate LangChain DeepAgent (`createDeepAgent`)
-   [ ] **2.2** Set up Deno sandbox runner with permission control
-   [ ] **2.3** Implement BullMQ job for agent execution
-   [ ] **2.4** Implement tool: `web_search`
-   [ ] **2.5** Implement tool: `fetch_url`
-   [ ] **2.6** Implement tool: `summarize_source`
-   [ ] **2.7** Implement tool: `generate_file` (writes to artifact)
-   [ ] **2.8** Implement agent planning and step tracking
-   [ ] **2.9** Implement retry/fallback logic for tool failures
-   [ ] **2.10** Implement session cancellation

### Phase 3: Streaming

-   [ ] **3.1** Set up SSE endpoint for session streaming
-   [ ] **3.2** Stream chat message tokens in real-time
-   [ ] **3.3** Stream agent step status updates
-   [ ] **3.4** Stream artifact content patches incrementally
-   [ ] **3.5** Implement reconnection with state recovery
-   [ ] **3.6** Implement session status change events

### Phase 4: Frontend — Index Page

-   [ ] **4.1** Add sidebar item "Deep Agents" with `IconBrain` icon
-   [ ] **4.2** Create route `/deep-agents` in `MainRoutes.jsx`
-   [ ] **4.3** Create `views/deepagents/index.jsx` — session list page
-   [ ] **4.4** Implement session list with status badges and timestamps
-   [ ] **4.5** Implement "New Session" button
-   [ ] **4.6** Implement session delete with confirmation dialog
-   [ ] **4.7** Add empty state for no sessions

### Phase 5: Frontend — Session Page

-   [ ] **5.1** Create route `/deep-agents/:id` in `MainRoutes.jsx`
-   [ ] **5.2** Create `views/deepagents/DeepAgentSession.jsx` — split panel layout
-   [ ] **5.3** Implement chat panel with message input and history
-   [ ] **5.4** Implement agent step progress indicators
-   [ ] **5.5** Implement artifact panel with markdown renderer
-   [ ] **5.6** Implement resizable split pane
-   [ ] **5.7** Connect SSE for real-time streaming
-   [ ] **5.8** Implement incremental artifact rendering
-   [ ] **5.9** Implement version selector in artifact toolbar
-   [ ] **5.10** Implement export button (download as `.md`)
-   [ ] **5.11** Implement copy-to-clipboard for artifact
-   [ ] **5.12** Implement cancel button for running sessions
-   [ ] **5.13** Implement follow-up prompt support
-   [ ] **5.14** Add loading/empty states and error handling

### Phase 6: Security & Production Readiness

-   [ ] **6.1** Enforce workspace-scoped authorization on all endpoints
-   [ ] **6.2** Validate and sanitize user input on message endpoint
-   [ ] **6.3** Configure Deno sandbox with restrictive permissions (no `--allow-all`)
-   [ ] **6.4** Implement network allowlist for sandbox
-   [ ] **6.5** Sandbox HTML artifact rendering with CSP and iframe
-   [ ] **6.6** Add rate limiting for session creation and message sending
-   [ ] **6.7** Add audit logging for session and tool execution events
-   [ ] **6.8** Implement sandbox cleanup after task completion

### Phase 7: Testing & QA

-   [ ] **7.1** Unit tests for Session Service
-   [ ] **7.2** Unit tests for Artifact Service
-   [ ] **7.3** Unit tests for Agent Orchestrator
-   [ ] **7.4** Integration tests for API endpoints
-   [ ] **7.5** Integration tests for SSE streaming
-   [ ] **7.6** E2E test: create session → send prompt → receive artifact
-   [ ] **7.7** E2E test: cancel running session
-   [ ] **7.8** E2E test: export artifact as markdown
-   [ ] **7.9** Security test: sandbox isolation verification
-   [ ] **7.10** Security test: cross-workspace access prevention
-   [ ] **7.11** Performance test: concurrent sessions under load
