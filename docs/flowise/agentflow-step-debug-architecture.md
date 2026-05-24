# AgentFlow Step Debugger — Solution Architecture

> **Audience:** Engineering (server, agentflow, observe, ui)
> **Author:** Solution Architect, Flowise
> **Status:** Architecture v0.1 — for engineering review
> **Implements:** [`docs/flowise/agentflow-step-debug-prd.md`](./agentflow-step-debug-prd.md)
> **Scope:** AgentFlow V2 (`ChatFlow.type = 'AGENTFLOW'`). v1 Chatflow / MULTIAGENT / ASSISTANT explicitly out of scope.

---

## 1 · Purpose

Realise the PRD's *Step Debugger* by adding three things to Flowise — and **nothing more**:

1. A backend primitive that runs a single AgentFlow V2 node against a per-builder variable pool, reusing the existing `executeNode` function in `packages/server/src/utils/buildAgentflow.ts`.
2. Two new TypeORM entities, **`DebugVariable`** and **`DebugNodeExecution`**, that capture and lazy-load per-builder values.
3. An Inspector experience on the canvas that drives those endpoints and reuses the existing `packages/observe` execution viewer components.

We **do not**:

- Fork `executeAgentFlow`.
- Touch the `Execution` table.
- Introduce Dify vocabulary (`workflow`, `draft`, `sys.*`, `conversation.*`).
- Change any node `INode.run(...)` signature.

---

## 2 · Terminology

The PRD borrows several names from Dify. This document standardises them against Flowise's existing types so engineering can ship without translating in their heads.

| PRD / Dify | This architecture (Flowise-native) | Existing Flowise touch-point |
|---|---|---|
| Workflow | **AgentFlow V2** | `ChatFlow.type = 'AGENTFLOW'` |
| Workflow draft | (no equivalent — saved + unpublished is the default) | `ChatFlow.deployed` |
| Single-Step Run | **Step Run** | new |
| `WorkflowDraftVariable` | **`DebugVariable`** (entity) | new |
| `WorkflowDraftNodeExecution` | **`DebugNodeExecution`** (entity) | new (mirrors `IAgentflowExecutedData['data']`) |
| `DraftVarLoader` | **`DebugVariablePool`** + **`DebugVariableLoader`** | extends `resolveVariables` |
| `DraftVariableSaver` | **`DebugVariableSaver`** | new (called after `executeNode` in step mode) |
| Before-Run Form | **Run Step Form** | new (UI) |
| Last Run tab | **Last Step Run** tab in the **Inspector** | new (UI) |
| Variable Inspect Panel | **Inspector** (side panel, 4 tabs) | new (UI) |
| `app_id` / `user_id` / `node_id` triple | `(workspaceId, chatflowId, userId, nodeId)` quadruple | mirrors existing `Execution` scoping |
| `sys.*` namespace | the existing `$flow.*` / `$question` / `$file_attachment` / `$chat_history` namespaces — surfaced under a sentinel `__system__` row | `resolveVariables` |
| `conversation.*` namespace | the existing **Flow State** (key/value object on `agentflowRuntime.state`) — surfaced under sentinel `__flow_state__` | `updateFlowState` |
| `env.*` namespace | the existing **`Variable` entity** rows (`{{ $vars.X }}`) — read-only in the Inspector | `Variable` table |
| `formInput` / `webhook` namespaces | the existing `agentflowRuntime.form` / `agentflowRuntime.webhook` — surfaced under `__form__` / `__webhook__` | `executeAgentFlow` |

Three rules for naming new artefacts going forward:

1. Prefer **Debug** over Draft.
2. Prefer **Step Run** over Single-Step / Single-Node Run.
3. Variable scopes are spelled with the existing **`$`-prefixed namespaces** in user-visible copy (`$flow.state`, `$vars.X`, `$form.field`) — never `sys.*` / `conversation.*` / `env.*`.

---

## 3 · Primitives we reuse

A complete inventory of the Flowise primitives this feature builds on. If something here changes shape, the architecture changes with it.

### 3.1 Runtime

| Symbol | File | Role |
|---|---|---|
| `executeAgentFlow(...)` | `packages/server/src/utils/buildAgentflow.ts` | Full-graph orchestrator. **Not modified.** |
| `executeNode(...)` | `packages/server/src/utils/buildAgentflow.ts` (line ~1051) | Per-node executor: resolves variables → calls `INode.run(...)` → returns `{ result, shouldStop, humanInput }`. **Reused as-is.** |
| `resolveVariables(...)` | `packages/server/src/utils/buildAgentflow.ts` (line ~241) | Substitutes `{{ … }}` templates against the variable pool. **Reused; extended pool, same function.** |
| `updateFlowState(...)` | `packages/components/nodes/agentflow/utils.ts` (line ~801) | Mutates the global Flow State key/value object. Already invoked by LLM, Agent, Loop, Start, Tool, CustomFunction, Retriever, ExecuteFlow nodes. |
| `IAgentflowExecutedData` | `packages/server/src/Interface.ts:347` | Per-node record `{ nodeLabel, nodeId, data: { input, output, state, error, … }, previousNodeIds, status }`. **Persisted into `DebugNodeExecution.data` verbatim.** |
| `ExecutionState` | `packages/server/src/Interface.ts:23` | `'INPROGRESS' \| 'FINISHED' \| 'ERROR' \| 'TERMINATED' \| 'TIMEOUT' \| 'STOPPED'`. **Reused for Step Run status.** |
| `IFlowConfig` | `packages/server/src/Interface.ts` | `{ chatflowid, chatId, sessionId, apiMessageId, chatHistory, state, runtimeChatHistoryLength }`. |
| `agentflowRuntime` | shape in `buildAgentflow.ts` `IAgentFlowRuntime` | `{ state, chatHistory, form, webhook }`. **Synthesised per Step Run from the Debug Variable pool.** |

### 3.2 Streaming

| Symbol | File | Role |
|---|---|---|
| `SSEStreamer` | `packages/server/src/utils/SSEStreamer.ts` | Implements `IServerSideEventStreamer`. Events used by Step Debugger: `agentFlowEvent`, `nextAgentFlow`, `agentFlowExecutedData`, `action`, `token`, `usedTools`, `tool`, `agentReasoning`, `sourceDocuments`, `artifacts`, `thinking`, `error`, `abort`, `end`. **No new events added in V1.** |
| Redis pub/sub | `packages/server/src/queue/RedisEventSubscriber.ts`, `RedisEventPublisher.ts` | Cross-replica SSE fan-out in `MODE.QUEUE`. **Step Run must subscribe/unsubscribe to the synthetic Step `chatId` exactly like `/prediction/:id` does today.** |

### 3.3 Persistence & RBAC

| Symbol | File | Role |
|---|---|---|
| `Execution` entity | `packages/server/src/database/entities/Execution.ts` | Holds full-graph runs. **Never written to by Step Run.** |
| `ChatFlow` entity | `packages/server/src/database/entities/ChatFlow.ts` | Source-of-truth for flow definition + `workspaceId`. |
| `Variable` entity | `packages/server/src/database/entities/Variable.ts` | Workspace-scoped global vars (`$vars.X`). Read-only in Inspector. |
| `checkAnyPermission('agentflows:update,…')` | `packages/server/src/enterprise/rbac/PermissionCheck.ts` | RBAC middleware. **All Step Debugger routes use this.** |
| `req.user.activeWorkspaceId` | enterprise auth middleware | Workspace scoping. **Every Step Debugger query filters on it.** |
| `getMulterStorage()` | `packages/server/src/utils` | File-upload handling, reused for file Debug Variables. |

### 3.4 Frontend

| Symbol | Package / File | Role |
|---|---|---|
| `AgentFlowNode` | `packages/ui/src/views/agentflowsv2/AgentFlowNode.jsx` (legacy MUI), and the modular equivalent in `packages/agentflow/src/features/canvas/components/` | The node card. The ▶/⏹ button mounts here. |
| `flowContext` | `packages/ui/src/store/context/ReactFlowContext.js` | `reactFlowInstance` access. Read-only for Step Debugger. |
| `AgentflowState` / `agentflowReducer` | `packages/agentflow/src/infrastructure/store/agentflowReducer.ts` | Existing Zustand-style slice for canvas state. **Extended with a `stepDebug` sub-slice** (NOT a separate store, to avoid two source-of-truth problems on cross-tab navigation). |
| `packages/observe/src/features/executions/` | several files | Existing post-mortem viewer. Components reused: `NodeExecutionDetail`, `RawJsonPanel`, `ChatMessageBubble`, `ToolAccordionList`, `FulfilledConditionsBlock`, `UsedToolChips`, `HitlPanel`, `NodeContentRenderer`. |
| `useNodeData` | `packages/observe/src/features/executions/hooks/useNodeData.ts` | Derives `(input, output, state, error, isHumanInputNode, …)` from one `IAgentflowExecutedData`. **Reused verbatim.** |
| `useResizableSidebar` / `useDrawerWidths` | `packages/observe/src/features/executions/hooks/` | Drawer mechanics. **Reused for the Inspector.** |

---

## 4 · High-level architecture

```
┌──────────────────────────── Browser ──────────────────────────────────────────┐
│                                                                               │
│  Canvas (ReactFlow)              Inspector (side panel)                       │
│  ─────────────────               ─────────────────────                        │
│  AgentFlowNode card              ┌──────────────────────────┐                 │
│   • ▶/⏹ button            ──▶    │ Tabs: Last Step Run /    │                 │
│   • Last Step Run pill           │       Node Vars /        │                 │
│   • Stale / Never-Run badge      │       Flow State /       │                 │
│                                  │       Globals             │                 │
│                                  │                          │                 │
│  Run Step Form (modal,           │  Reuses `NodeExecution-  │                 │
│  only when inputs missing)       │  Detail` from observe    │                 │
│                                  └──────────────────────────┘                 │
│                                                                               │
│  Zustand: `stepDebug` slice on existing `AgentflowState`                      │
│   • pendingStepRun, runningNodeId, abortControllerByNodeId                    │
│   • lastRunByNodeId, debugVarsByScope                                         │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
              │  HTTP / SSE
              ▼
┌──────────────────────────── Server (Express) ─────────────────────────────────┐
│                                                                               │
│  Router  packages/server/src/routes/chatflows-debug/index.ts                  │
│   POST   /api/v1/chatflows/:id/debug/nodes/:nodeId/run     [step run]         │
│   GET    /api/v1/chatflows/:id/debug/nodes/:nodeId/last-run                   │
│   GET    /api/v1/chatflows/:id/debug/variables             [list, no values]  │
│   GET    /api/v1/chatflows/:id/debug/variables/:varId      [one value]        │
│   PATCH  /api/v1/chatflows/:id/debug/variables/:varId                         │
│   DELETE /api/v1/chatflows/:id/debug/variables/:varId                         │
│   PUT    /api/v1/chatflows/:id/debug/variables/:varId/reset                   │
│   GET    /api/v1/chatflows/:id/debug/nodes/:nodeId/variables                  │
│   DELETE /api/v1/chatflows/:id/debug/variables                                │
│                                                                               │
│   All gated by `checkAnyPermission('agentflows:update,chatflows:update')`     │
│   and scoped by `req.user.activeWorkspaceId` + `req.user.id`.                 │
│                                                                               │
│  Controller   packages/server/src/controllers/chatflows-debug/                │
│  Service      packages/server/src/services/chatflows-debug/                   │
│       ├─ stepRunService.ts            (runStep, abortStep)                    │
│       ├─ debugVariableService.ts      (CRUD + reset)                          │
│       └─ debugNodeExecutionService.ts (last-run lookups)                      │
│                                                                               │
│  Domain   packages/server/src/utils/agentflow-step-debug/                     │
│       ├─ StepRunner.ts          (wraps executeNode)                           │
│       ├─ DebugVariablePool.ts   (builds the per-step pool)                    │
│       ├─ DebugVariableLoader.ts (the resolveVariables-compatible loader)      │
│       └─ DebugVariableSaver.ts  (persists captured outputs)                   │
│                                                                               │
│  Persistence (TypeORM)                                                        │
│   packages/server/src/database/entities/DebugVariable.ts                      │
│   packages/server/src/database/entities/DebugNodeExecution.ts                 │
│                                                                               │
│  Streaming (reuse)                                                            │
│   SSEStreamer with a synthetic chatId = `step:<chatflowId>:<userId>:<nodeId>` │
│                                                                               │
└─────────────┬─────────────────────────────────────────────────────────────────┘
              │
              ▼
        Postgres / MySQL / SQLite / MariaDB
        (`debug_variable`, `debug_node_execution`)
```

---

## 5 · Domain design

### 5.1 `StepRunner`

A new orchestrator that does **one thing**: prepare context, call `executeNode`, persist the result.

```ts
// packages/server/src/utils/agentflow-step-debug/StepRunner.ts
export interface StepRunArgs {
    chatflow: ChatFlow                  // must be type === 'AGENTFLOW'
    nodeId: string
    userId: string
    workspaceId: string
    orgId: string
    subscriptionId: string
    productId: string
    inputs?: Record<string, unknown>    // request-body overrides
    files?: IFileUpload[]
    question?: string
    sessionId?: string                  // optional; defaults to a synthetic `step:<flow>:<user>`
    streaming: boolean                  // true → SSE; false → JSON
    abortController: AbortController
    // Existing singletons injected by controller:
    appDataSource: DataSource
    componentNodes: IComponentNodes
    cachePool: CachePool
    usageCacheManager: UsageCacheManager
    telemetry: Telemetry
    sseStreamer?: IServerSideEventStreamer
}

export interface StepRunResult {
    nodeId: string
    nodeLabel: string
    status: ExecutionState              // 'FINISHED' | 'ERROR' | 'STOPPED'
    data: IAgentflowExecutedData['data']  // exact same shape as full-flow per-node record
    durationMs: number
    capturedVariables: DebugVariableSummary[]
}
```

Implementation in three steps:

1. **Resolve the node** from `chatflow.flowData`. Reject `stickyNoteAgentflow`, reject children of `iterationAgentflow` / `loopAgentflow` (V1.0). Reject `humanInputAgentflow` and `executeFlowAgentflow` (V1.0; lifted in V1.1).
2. **Build the variable pool** via `DebugVariablePool.build(...)` (§5.2). The pool returns a constructed `agentflowRuntime` (with `state`, `form`, `webhook`, `chatHistory`) and an `availableVariables: Variable[]` array.
3. **Call `executeNode(...)`** with `isRecursive: true` (so it does NOT touch the `Execution` table — see §5.4) and `parentExecutionId: undefined`. Pass the synthetic `chatId` so existing SSE works.
4. **Persist** via `DebugVariableSaver.save(...)` (§5.3).

`StepRunner` never modifies `executeAgentFlow`, never enqueues downstream nodes, never reads or writes `Execution`.

### 5.2 `DebugVariablePool` and `DebugVariableLoader`

The pool exists to compose three sources into one cohesive input for `resolveVariables`:

```
priority HIGH ───────────────────────────────────► priority LOW
┌────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ request inputs │  │ DebugVariable rows │  │ live flow defaults │
│ (overrides)    │  │ for this (cf,user) │  │ + Variable entity  │
└────────────────┘  └────────────────────┘  └────────────────────┘
```

`DebugVariablePool` materialises the merged view into the existing shapes:

- `agentflowRuntime.state` ← rows where `nodeId = '__flow_state__'`
- `agentflowRuntime.form` ← rows where `nodeId = '__form__'`
- `agentflowRuntime.webhook` ← rows where `nodeId = '__webhook__'`
- `agentflowRuntime.chatHistory` ← rows where `nodeId = '__chat_history__'` (synthesised by the Start step)
- `agentFlowExecutedData[]` ← rows where `nodeId` is a real node id, mapped into a synthetic `IAgentflowExecutedData` so that `resolveVariables` can resolve `{{ nodeId.output.path }}` exactly as it does in a full run.

```ts
// packages/server/src/utils/agentflow-step-debug/DebugVariablePool.ts
export class DebugVariablePool {
    static async build(args: BuildArgs): Promise<{
        agentflowRuntime: IAgentFlowRuntime
        agentFlowExecutedData: IAgentflowExecutedData[]
        availableVariables: Variable[]
        missingVariables: string[]  // dependent vars with no value — caller decides to error or open Run Step Form
    }>
}
```

Concretely, `resolveVariables` is **not modified**. The pool produces inputs that look identical to a full-flow mid-execution state, so `resolveVariables` can't tell the difference.

`DebugVariableLoader` is a thin façade exposing `get(scope, name)` for the controller's "is this var missing?" pre-check (FR-2.1). The actual substitution still happens inside `resolveVariables`.

### 5.3 `DebugVariableSaver`

Mirrors what Dify's `DraftVariableSaver` does, but uses Flowise's existing namespaces. Called *after* `executeNode` returns:

```ts
// pseudocode
async save(result: ExecuteNodeResult, args: StepRunArgs) {
    const { nodeId, reactFlowNode } = ...
    const { input, output, state, error } = result.data

    // 1. Per-node outputs → real `nodeId`
    if (output && typeof output === 'object') {
        for (const [name, value] of Object.entries(output)) {
            if (EXCLUDED_OUTPUT_KEYS.has(name)) continue   // 'timeMetadata', 'usageMetadata', 'usedTools', …
            await upsert({ nodeId, name, value, editable: true })
        }
    }

    // 2. Flow State mutations → '__flow_state__'
    if (state && typeof state === 'object') {
        for (const [name, value] of Object.entries(state)) {
            await upsert({ nodeId: '__flow_state__', name, value, editable: true })
        }
    }

    // 3. Start node fan-out → '__form__', '__webhook__', '__chat_history__'
    if (reactFlowNode.data.name === 'startAgentflow') {
        if (output?.form)    await upsertMany('__form__',    output.form)
        if (output?.webhook) await upsertMany('__webhook__', output.webhook)
        if (output?.question)await upsert({ nodeId: '__system__', name: 'question', value: output.question })
    }

    // 4. Iteration/Loop *child* nodes never write — parent owns the scope
    if (reactFlowNode.parentNode) return

    // 5. Track the run itself in DebugNodeExecution
    await debugNodeExecutionRepo.upsert({
        chatflowId, userId, nodeId,
        data: result.data,
        status: result.status
    })
}
```

`EXCLUDED_OUTPUT_KEYS` mirrors today's per-node-metadata convention seen in `packages/observe/.../useNodeData.ts` (which deliberately hides `timeMetadata`, `usageMetadata`, `usedTools` from the rendered output). Centralised in one constant so future LLM/Agent additions don't leak debug rows.

### 5.4 Reusing `executeNode` without touching `Execution`

`executeNode` today is called twice from `executeAgentFlow`: top-level (creates an `Execution` via `addExecution`) and recursively for iteration children (uses `parentExecutionId`). Step Run takes a **third path** by:

- Calling `executeNode` directly (not via `executeAgentFlow`).
- Passing `parentExecutionId: undefined`, `isRecursive: true`, `agentFlowExecutedData: <synthesised from DebugVariables>`.

`executeNode` itself never writes to `Execution` — that responsibility lives in `executeAgentFlow`'s queue loop. So calling it standalone is safe and requires zero code change in `executeNode`.

The only branch in `executeNode` that does touch DB-persisted state is the iteration-recursion block (lines ~1261-1406), which calls `executeAgentFlow` for child sub-flows. **V1.0 rejects iteration Step Runs at the controller layer** so that branch is never hit during Step Run. V1.1 will reintroduce it with an opt-in flag (see §11.1).

### 5.5 SSE: synthetic `chatId` per Step Run

Full flow runs key their SSE stream by the user's `chatId`. For Step Run we want isolation: a builder may have the full chat open in one tab and be step-debugging in another. We use a synthetic key:

```
chatId = `step:${chatflowId}:${userId}:${nodeId}:${shortUuid()}`
```

This:
- Avoids collision with chat sessions.
- Lets the SSE drain into the Inspector tab and only that tab.
- Inherits `MODE.QUEUE` for free: `RedisEventSubscriber.subscribe(chatId)` works regardless of prefix.

The controller mirrors `controllers/predictions/index.ts` exactly:

```ts
const chatId = `step:${chatflowId}:${userId}:${nodeId}:${shortUuid()}`
const sseStreamer = getRunningExpressApp().sseStreamer
sseStreamer.addClient(chatId, res)
res.setHeader('Content-Type', 'text/event-stream') ; res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive') ; res.setHeader('X-Accel-Buffering', 'no')
res.flushHeaders()

if (process.env.MODE === MODE.QUEUE) {
    await getRunningExpressApp().redisSubscriber.subscribe(chatId)
}
try {
    await stepRunService.runStep({ ..., sseStreamer, chatId, streaming: true })
} finally {
    if (process.env.MODE === MODE.QUEUE) {
        await getRunningExpressApp().redisSubscriber.unsubscribe(chatId)
    }
    sseStreamer.removeClient(chatId)
}
```

### 5.6 Event vocabulary

We add **zero new SSE events**. The Inspector consumer subscribes to:

| Event | When | Source method |
|---|---|---|
| `agentFlowEvent` | step starts and ends with `'INPROGRESS' \| 'FINISHED' \| 'ERROR' \| 'STOPPED'` | `streamAgentFlowEvent` |
| `nextAgentFlow` | one frame: `{ nodeId, nodeLabel, status: 'INPROGRESS' }` | `streamNextAgentFlowEvent` |
| `agentFlowExecutedData` | one frame at end with `[<IAgentflowExecutedData>]` | `streamAgentFlowExecutedDataEvent` |
| `token` | LLM / Agent streaming | `streamTokenEvent` |
| `agentReasoning`, `usedTools`, `tool` | Agent node | existing |
| `action` | HITL (V1.1) | `streamActionEvent` |
| `end` / `abort` / `error` | terminal | existing |

### 5.7 Authorization & isolation

Every Step Debugger route resolves three identities up front:

1. `workspaceId = req.user.activeWorkspaceId` — workspace tenancy.
2. `userId = req.user.id` — per-builder isolation (the **key novelty**: existing `Execution` is workspace-shared, Step Debugger is per-user-within-workspace).
3. `chatflow = chatflowsService.getChatflowById(req.params.id, workspaceId)` — flow ownership.

Every DB query for `DebugVariable` / `DebugNodeExecution` filters `WHERE workspace_id = $1 AND chatflow_id = $2 AND user_id = $3`. There is no admin override for V1 — even an `isOrganizationAdmin` cannot read another builder's Debug Variables (the data is the builder's private working set, not a flow artefact).

Permission: `checkAnyPermission('agentflows:update,chatflows:update')`. Step debug is an *edit* action, not a *view* action — read-only viewers don't get it.

---

## 6 · Data model

### 6.1 `DebugVariable`

```ts
// packages/server/src/database/entities/DebugVariable.ts
@Entity('debug_variable')
@Index(['workspaceId', 'chatflowId', 'userId', 'nodeId'])
@Unique(['chatflowId', 'userId', 'nodeId', 'name'])
export class DebugVariable {
    @PrimaryGeneratedColumn('uuid') id: string

    @Index() @Column({ type: 'uuid' })       chatflowId: string
    @Index() @Column({ type: 'text' })       workspaceId: string
    @Index() @Column({ type: 'uuid' })       userId: string

    // Real ReactFlow node id (`llmAgentflow_2`) OR sentinel (`__flow_state__`, `__form__`,
    // `__webhook__`, `__chat_history__`, `__system__`). See §6.3.
    @Column({ type: 'text' })                nodeId: string
    @Column({ type: 'text' })                name: string

    @Column({ type: 'text' })                valueType: 'string' | 'number' | 'boolean' | 'json' | 'array' | 'file'

    // Inline payload when below the truncation threshold. Otherwise NULL and `storageRef` is set.
    @Column({ type: 'jsonb', nullable: true }) value: unknown | null

    // S3/local-storage key for offloaded payloads (> WORKFLOW_DEBUG_VAR_INLINE_MAX bytes).
    @Column({ type: 'text', nullable: true })  storageRef: string | null
    @Column({ type: 'int',  nullable: true })  sizeBytes: number | null

    @Column({ type: 'text',    nullable: true }) description: string | null
    @Column({ type: 'boolean', default: true  }) visible: boolean
    @Column({ type: 'boolean', default: true  }) editable: boolean
    @Column({ type: 'boolean', default: false }) edited: boolean       // bumped on PATCH; cleared on Step Run upsert

    @Column({ type: 'timestamp', nullable: true }) lastRunAt: Date | null

    @CreateDateColumn({ type: 'timestamp' }) createdDate: Date
    @UpdateDateColumn({ type: 'timestamp' }) updatedDate: Date

    @ManyToOne(() => ChatFlow, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow
}
```

Notes for the migration author:

- **Per-driver migrations** must be authored under `packages/server/src/database/migrations/{postgres,mysql,mariadb,sqlite}/`. SQLite has no `jsonb`; store as `TEXT` and parse in TypeORM transformer.
- The `FK on chatflowId` with `ON DELETE CASCADE` is the simplest GC story — deleting a flow wipes its Debug state.
- The composite unique index `(chatflowId, userId, nodeId, name)` is the upsert key. Use TypeORM's `repository.upsert({...}, ['chatflowId', 'userId', 'nodeId', 'name'])` — supported on Postgres + MySQL 8 + SQLite; MariaDB needs a manual `INSERT … ON DUPLICATE KEY UPDATE` path.

### 6.2 `DebugNodeExecution`

```ts
// packages/server/src/database/entities/DebugNodeExecution.ts
@Entity('debug_node_execution')
@Index(['workspaceId', 'chatflowId', 'userId', 'nodeId'])
export class DebugNodeExecution {
    @PrimaryGeneratedColumn('uuid') id: string

    @Index() @Column({ type: 'uuid' }) chatflowId: string
    @Index() @Column({ type: 'text' }) workspaceId: string
    @Index() @Column({ type: 'uuid' }) userId: string
    @Index() @Column({ type: 'text' }) nodeId: string
    @Column({ type: 'text' })          nodeLabel: string

    // Full IAgentflowExecutedData['data'] payload — input, output, state, error,
    // timeMetadata, usageMetadata, usedTools, … exactly as the full-flow viewer expects.
    @Column({ type: 'jsonb' })         data: IAgentflowExecutedData['data']

    @Column({ type: 'text' })          status: ExecutionState

    @Column({ type: 'int', nullable: true }) durationMs: number | null

    @CreateDateColumn({ type: 'timestamp' }) createdDate: Date

    @ManyToOne(() => ChatFlow, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chatflowId' })
    chatflow: ChatFlow
}
```

We **do not unique-constrain** by `(chatflowId, userId, nodeId)`: we keep the **last N=10** rows per tuple for the V2 "history scrubber" without a schema change. V1 reads only the most recent row via `ORDER BY createdDate DESC LIMIT 1`; the GC job (§7.4) trims to 10.

### 6.3 Sentinel `nodeId` values

A small enum, also exported from `packages/server/src/Interface.ts` so frontend can reference:

```ts
export const DEBUG_NODE_SENTINELS = {
    FLOW_STATE:    '__flow_state__',   // $flow.state.*
    FORM:          '__form__',         // $form.*
    WEBHOOK:       '__webhook__',      // $webhook.*
    CHAT_HISTORY:  '__chat_history__', // $chat_history
    SYSTEM:        '__system__'        // $question, $file_attachment, $current_date_time, $loop_count
} as const

export type DebugNodeSentinel = (typeof DEBUG_NODE_SENTINELS)[keyof typeof DEBUG_NODE_SENTINELS]
```

The pool maps each sentinel back to the field on `agentflowRuntime` / `flowConfig` that `resolveVariables` reads today. **The `Variable` entity (`$vars.X`) is intentionally NOT mirrored** as Debug Variables — it's already a workspace-scoped, persisted, editable concept. The Inspector "Globals → Env" tab proxies the existing `/variables` endpoint for read-only display and deep-links to the dedicated env vars page for editing.

### 6.4 Large-value offload

- Threshold: `WORKFLOW_DEBUG_VAR_INLINE_MAX` env var (default `65_536` bytes after `JSON.stringify`).
- Offload destination: existing storage abstraction (`packages/server/src/utils/getStorage` if present, otherwise the same path used by `getMulterStorage()`).
- List endpoints (`GET /debug/variables`, `GET /debug/nodes/:nodeId/variables`) **never inline `value`**. They return `{ id, name, valueType, edited, visible, sizeBytes, isTruncated }`. The detail endpoint (`GET /debug/variables/:varId`) returns `value` inline up to the threshold, or `{ storageRef, downloadUrl }` for offloaded payloads.

---

## 7 · Backend services & routes

### 7.1 Route module

```
packages/server/src/routes/chatflows-debug/index.ts
```

Mounted in `packages/server/src/routes/index.ts` as:

```ts
router.use('/chatflows', chatflowsDebugRouter)  // adds the /:id/debug/* sub-tree
```

Single permission gate for the whole module:

```ts
router.use('/:id/debug', checkAnyPermission('agentflows:update,chatflows:update'))
```

### 7.2 Controller surface

```
packages/server/src/controllers/chatflows-debug/
    ├─ stepRun.ts            POST /:id/debug/nodes/:nodeId/run
    ├─ debugVariables.ts     GET/PATCH/DELETE/PUT-reset on /:id/debug/variables[/:varId]
    └─ debugNodeExecutions.ts GET /:id/debug/nodes/:nodeId/last-run
```

Controller responsibilities only:

- Validate params (`id` is uuid, `nodeId` exists in `chatflow.flowData`, body schema).
- Resolve `chatflow` via `chatflowsService.getChatflowById(id, workspaceId)`; 404 if missing.
- Reject if `chatflow.type !== 'AGENTFLOW'` (400).
- Set up SSE iff `Accept: text/event-stream`; otherwise return JSON.
- Delegate to service. Translate `InternalFlowiseError` to HTTP.

### 7.3 Service surface

```
packages/server/src/services/chatflows-debug/
    ├─ stepRunService.ts
    ├─ debugVariableService.ts
    └─ debugNodeExecutionService.ts
```

`stepRunService.runStep({ … })` is the thinnest possible wrapper over `StepRunner.run(...)`:

```ts
export async function runStep(args: StepRunServiceArgs): Promise<StepRunResult> {
    const runner = new StepRunner(args)
    try {
        const result = await runner.run()
        return result
    } catch (err) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: stepRunService.runStep - ${getErrorMessage(err)}`
        )
    }
}
```

`debugVariableService` exposes:

- `list({ chatflowId, userId, page, limit })` — defers `value` column (TypeORM `select: false` or explicit `addSelect` omit) for cheap pagination.
- `get(varId, { userId, workspaceId })` — loads `value`, resolves `storageRef` into a signed URL when offloaded.
- `update(varId, { name?, value? })` — sets `edited = true`, bumps `updatedDate`.
- `reset(varId)` — re-reads the latest `DebugNodeExecution` for `(chatflow, user, node)`, re-derives the value from `data.output[name]` (or sentinel-mapped fields), upserts; if the underlying source no longer exists, deletes the row.
- `delete(varId)` — removes one row.
- `wipe({ chatflowId, userId })` — removes all rows.

`debugNodeExecutionService.getLastRun({ chatflowId, userId, nodeId })` — `ORDER BY createdDate DESC LIMIT 1`.

### 7.4 Garbage collection

A new entry in the existing schedule infrastructure:

```ts
// packages/server/src/schedule/ScheduleBeat.ts  (existing file)
beat.schedule('debug-vars-gc', '@nightly', async () => {
    await debugVariableService.gc({ idleDays: 30 })
    await debugNodeExecutionService.gc({ keepLastN: 10 })  // per (chatflow,user,node) tuple
})
```

GC tunables come from env vars: `DEBUG_VAR_TTL_DAYS=30`, `DEBUG_NODE_EXEC_KEEP_LAST_N=10`.

### 7.5 Queue mode

`MODE.QUEUE` is supported transparently. The only requirement is the SSE subscribe/unsubscribe block in the controller (see §5.5). No new Bull queue is introduced — Step Runs are short-lived and synchronous in the request lifecycle, just like `/internal-prediction`.

### 7.6 Rate limiting & cost accounting

- The `RateLimiterManager` middleware from `controllers/predictions/index.ts` is mirrored for `POST /chatflows/:id/debug/nodes/:nodeId/run`.
- LLM token usage flows through `UsageCacheManager` exactly like a full-flow run: `executeNode` already calls `runParams.usageCacheManager.*` via the node's `INode.run(...)`.
- Telemetry events are emitted with `flow.type = 'AGENTFLOW'`, `flow.mode = 'step_debug'` to distinguish from full runs in dashboards.

---

## 8 · End-to-end sequences

### 8.1 First Step Run on a node with no captured upstream

```
Builder              Canvas         Inspector       useStepDebug    Server                Postgres
   │ click ▶            │              │               │              │                      │
   ├───────────────────▶│              │               │              │                      │
   │                    │ stepDebug.setPending(nodeId,'run')          │                      │
   │                    │              │               │              │                      │
   │                    │ select node, mount Inspector                │                      │
   │                    │              ├──────────────▶│ resolve deps │                      │
   │                    │              │               ├─────────────▶│ GET /debug/variables (heads)
   │                    │              │               │◀── list     │ debugVariableService.list
   │                    │              │               │              │                      │
   │                    │  missing deps detected → open Run Step Form │                      │
   │                    │              │               │              │                      │
   │ fills form, Run                   │               │              │                      │
   ├──────────────────────────────────▶│ submit        │              │                      │
   │                    │              │               ├─────────────▶│ POST /debug/nodes/:id/run
   │                    │              │               │              │ stepRunService.runStep
   │                    │              │               │              │  → DebugVariablePool.build
   │                    │              │               │              │     (merge: body → DB → flow)
   │                    │              │               │              │  → executeNode(...)
   │                    │              │               │              │     → INode.run → SSE tokens
   │                    │              │               │              │  → DebugVariableSaver.save  ──▶ upsert DebugVariable rows
   │                    │              │               │              │  → debugNodeExec.insert(...) ──▶ insert DebugNodeExecution
   │                    │              │               │◀── 200 / SSE │                      │
   │                    │              │ inspector.setLastRun(result) │                      │
   │                    │              │ Inspector: Last Step Run tab │                      │
   │◀───────────────────────── shown ──┤              │               │                      │
```

### 8.2 Re-run with all captures present (streamed LLM)

```
Builder    Canvas    Inspector   useStepDebug      Server                              Postgres
   ▶          │         │            │                │                                    │
   ├─────────▶│ setPending(nodeId,'run')              │                                    │
   │          │         │ deps complete (no form)     │                                    │
   │          │         │            ├───────────────▶│ POST /debug/nodes/:id/run (SSE)    │
   │          │         │            │                │ event: agentFlowEvent 'INPROGRESS' │
   │          │         │            │◀── token …     │ event: nextAgentFlow {nodeId,...}  │
   │          │         │            │◀── token …     │ event: token "Hi"                  │
   │          │         │            │◀── token …     │ event: token " there!"             │
   │          │ Inspector streams tokens into Last Run│                                    │
   │          │         │            │◀── executed    │ event: agentFlowExecutedData [...] │
   │          │         │            │◀── done        │ event: agentFlowEvent 'FINISHED'   │
   │          │         │            │                │ DebugVariableSaver.save ──────────▶ upsert / insert
```

### 8.3 Edit a Flow State value and re-run a Condition

```
Builder         Inspector              Server                                 Postgres
  ✎ edit          │                       │                                       │
  ───────────────▶│ PATCH /debug/variables/:id { value: "pro" }                   │
                  ├──────────────────────▶│ debugVariableService.update           │
                  │                       │   set edited=true, updated_date=NOW   │
                  │                       │   ──────────────────────────────────▶ UPDATE debug_variable
                  │◀── 200 {edited: true} │                                       │
  ▶ run Condition │                       │                                       │
                  ├──────────────────────▶│ POST /debug/nodes/:cond/run           │
                  │                       │   pool.build: '__flow_state__' row with edited=true overrides
                  │                       │   executeNode → condition picks branch B
                  │                       │   saver upserts → edited=false (refreshed by run)
                  │◀── 200 (branch B)     │                                       │
```

### 8.4 Abort an in-flight run

```
Builder         Inspector       useStepDebug                Server
  ⏹ click        │                  │                          │
  ──────────────▶│ abortControllerByNodeId[nodeId].abort()      │
                 │                  │ fetch is cancelled        │
                 │                  │ pending SSE drains; server detects req.aborted
                 │                  │                          │ executeNode raises 'Aborted'
                 │                  │                          │ stepRunService catches → status='STOPPED'
                 │                  │                          │ DebugVariableSaver.save SKIPPED (status STOPPED)
                 │                  │                          │ debugNodeExec.insert with status='STOPPED'
                 │ runningNodeId[nodeId] = null
                 │ inspector shows banner "Previous Step Run aborted"
```

Aborting **never overwrites** the previous successful Last Step Run.

---

## 9 · Frontend design

### 9.1 Package layout

```
packages/agentflow/src/features/step-debug/
    ├─ index.ts
    ├─ store/
    │   ├─ stepDebugSlice.ts          (lives inside AgentflowState — single store)
    │   └─ stepDebugSlice.test.ts
    ├─ hooks/
    │   ├─ useStepRun.ts              (orchestration: intent → form → API → inspector)
    │   ├─ useDependentVars.ts        (computes the variables a node references)
    │   ├─ useDebugVariables.ts       (CRUD + cache)
    │   └─ useStepRunStream.ts        (SSE consumer; reuses existing AgentFlow event parser)
    ├─ api/
    │   ├─ stepRun.ts                 (POST /chatflows/:id/debug/nodes/:nodeId/run)
    │   └─ debugVariables.ts          (CRUD)
    ├─ components/
    │   ├─ NodeStepRunControl.tsx     (▶/⏹ button on AgentFlowNode action bar)
    │   ├─ RunStepForm/
    │   │   ├─ RunStepForm.tsx
    │   │   ├─ MissingVarField.tsx
    │   │   └─ types.ts
    │   └─ Inspector/
    │       ├─ Inspector.tsx
    │       ├─ tabs/
    │       │   ├─ LastStepRunTab.tsx    (wraps observe's NodeExecutionDetail)
    │       │   ├─ NodeVarsTab.tsx
    │       │   ├─ FlowStateTab.tsx
    │       │   └─ GlobalsTab.tsx
    │       └─ shared/
    │           ├─ VariableRow.tsx       (inline edit, copy-as-ref, reset, delete)
    │           ├─ ValueCell.tsx         (truncation + offloaded download)
    │           └─ ScopeFilter.tsx
    └─ utils/
        ├─ dependentVarExtractor.ts   (parses {{ … }} templates on a node)
        └─ valueTypeInfer.ts          (boolean/number/json/file detection)
```

### 9.2 Zustand slice (single store, sub-slice pattern)

To avoid two sources of truth on node selection, we extend `AgentflowState` rather than create a separate `debugStore`:

```ts
// packages/agentflow/src/core/types/store.ts (extended)
export interface StepDebugSlice {
    pendingRun: { nodeId: string; action: 'run' | 'stop' } | null
    runningNodeId: string | null
    abortControllers: Record<string, AbortController>
    lastRunByNodeId: Record<string, DebugNodeExecutionSummary>
    debugVarsByScope: Record<string, DebugVariableSummary[]>  // scope = nodeId or sentinel
    isInspectorOpen: boolean
    inspectorTab: 'lastRun' | 'nodeVars' | 'flowState' | 'globals'
    inspectorWidthPx: number
}

export interface AgentflowState extends ... {
    // existing fields …
    stepDebug: StepDebugSlice
}
```

Actions live on `agentflowReducer.ts` and follow the existing pattern (`SET_*`, `MERGE_*`).

### 9.3 Canvas affordance

`NodeStepRunControl` is injected into the existing `AgentFlowNode` card via composition:

```tsx
// packages/ui/src/views/agentflowsv2/AgentFlowNode.jsx (legacy MUI)
import { NodeStepRunControl } from '@flowise/agentflow/features/step-debug'

// In the action bar:
{canStepRun(data.name, isChildNode) && <NodeStepRunControl nodeId={id} />}
```

`canStepRun(nodeName, isChildNode)` is the single source of truth (mirrors Dify's `canRunBySingle`) and lives in `packages/agentflow/src/features/step-debug/utils/canStepRun.ts`. V1.0 allowlist:

```
['startAgentflow', 'llmAgentflow', 'agentAgentflow', 'conditionAgentflow',
 'conditionAgentAgentflow', 'httpAgentflow', 'retrieverAgentflow',
 'customFunctionAgentflow', 'toolAgentflow', 'directReplyAgentflow']
```

Children of `iterationAgentflow` / `loopAgentflow` are rejected by `isChildNode`. `humanInputAgentflow`, `iterationAgentflow`, `loopAgentflow`, `executeFlowAgentflow` are V1.1.

### 9.4 Run Step Form

`useDependentVars(nodeId)` returns the **dependent variable set** the node references. Computation:

1. Scan all `INodeData.inputs[*]` string fields for `{{ … }}` matches.
2. Classify each by namespace (`$vars`, `$flow`, `$form`, `$webhook`, `$iteration`, `$loop_count`, `$question`, `$file_attachment`, or `nodeId(.output.path)?`).
3. Add **all incoming edges** of the node as implicit `<sourceNodeId>` deps (because nodes that take no template variables still read their predecessors' output via `combineNodeInputs`).
4. Cross-reference against `debugVarsByScope` from the store.
5. Return `{ all, missing, present }`.

The Run Step Form renders **only missing** deps as fields (FR-2.5). Each field's type is inferred from the `InputParam` declaration (when the dep is a direct input) or defaults to string with a JSON-editor fallback. Submitting POSTs each value to `PATCH /debug/variables/:id` (or `POST`-creates if no row exists yet — implemented in V1.0 as a single bulk `PUT /debug/variables` for atomicity).

### 9.5 Inspector

```
┌──────────────────────────────────────────────────┐
│  Inspector — `llmAgentflow_2`                   ⌃│
│  ────────────────────────────────────────────────│
│  [ Last Step Run ✓ ] [ Node Vars 4 ] [ Flow State 2 ] [ Globals ]
│  ────────────────────────────────────────────────│
│                                                  │
│  ▼ Output                                        │
│    { "content": "Hello!", … }                    │
│  ▶ Input                                         │
│  ▶ Used tools (2)                                │
│  ▶ State diff                                    │
│  ▶ Raw JSON                                      │
│                                                  │
│  [ Re-run ▶ ]                                    │
└──────────────────────────────────────────────────┘
```

- **Last Step Run** tab uses `<NodeExecutionDetail>` from `packages/observe/src/features/executions/components/`. The `agentflowId` / `sessionId` props are passed through. The `onHumanInput` prop is wired to a V1.1 HITL handler; in V1.0 it's `undefined`, which hides the HITL controls.
- **Node Vars** tab lists rows for `nodeId === selectedNodeId`. Each row is a `<VariableRow>`: name, type badge, value (truncated), edit / copy-as-`{{ … }}` / reset / delete actions.
- **Flow State** tab lists rows for `nodeId === '__flow_state__'`. Same affordances. An "Add key" affordance creates a row (e.g. for testing a state value the flow has not produced yet).
- **Globals** tab is collapsible:
  - **System** (sentinel `__system__`): read-only.
  - **Form** (sentinel `__form__`): editable.
  - **Webhook** (sentinel `__webhook__`): editable.
  - **Env (`$vars`)**: proxied from `GET /variables`; read-only here, "Edit in Settings →" deep-link to `/variables` route.
- **Tree filter** (`<ScopeFilter>`): debounced search across name, scope, type.

### 9.6 Shared modules

The `packages/observe/src/features/executions/components/` set is currently consumed only by the post-mortem executions route. Step Debugger imports the same components without modification. If a component grows feature-specific behaviour later (e.g. an "edit" toggle on Last Step Run), we will lift it into `packages/observe-shared/` rather than fork.

### 9.7 Legacy UI vs. agentflow package

Flowise has two canvas implementations today: the legacy MUI one at `packages/ui/src/views/agentflowsv2/Canvas.jsx` and the modular Vite-based `packages/agentflow/src/Agentflow.tsx`. **Step Debugger ships first in the legacy canvas** because that's what production users see; the agentflow package mounts the same exported components behind a feature flag and is the long-term home.

Concretely:
- `packages/agentflow/src/features/step-debug/` is the **source of truth** for the feature.
- `packages/ui/src/views/agentflowsv2/AgentFlowNode.jsx` imports `NodeStepRunControl` and `Inspector` from there via a named export.
- The MUI/Berry theme is honoured by passing `useTheme()` results into the imported components (they're styled with sx-prop-friendly defaults).

---

## 10 · Concurrency, isolation, edge cases

| Case | Behaviour |
|---|---|
| Two builders Step Run the same node concurrently | Each gets a private SSE chatId; Debug Variable rows are uniquely keyed by `userId`; no DB contention. |
| One builder triggers two Step Runs on the same node in parallel | UI prevents this (the ▶ becomes ⏹ for the in-flight one). Backend would let it happen — last write wins on `DebugNodeExecution`; both runs' SSE streams are independent. |
| Builder edits a Debug Variable mid-Step-Run | The edit lands in the table immediately. The in-flight run uses the pool snapshot it took at request time; the next run sees the edit. |
| Builder deletes the node from canvas | Debug Variables and Debug Node Executions for that nodeId are **not** auto-deleted (preserves history if the user undoes). GC trims them after 30 idle days, or instantly when the flow is deleted (FK cascade). |
| Builder renames a node | Node IDs are stable (Flowise uses `<nodeName>_<seq>` once assigned). Debug rows survive label changes. If the node is removed and a new one with the same id is created (rare), the rows attach to the new node. We accept this footgun in V1. |
| Flow is published while a Step Run is in flight | `chatflowsService.updateChatflow` does not touch `debug_*` tables. The run completes against the in-memory `flowData` it loaded at the start of the request. |
| Token cap exceeded by Tool node | The Tool node throws upstream; `executeNode` catches and returns a `data.error`. `DebugVariableSaver` still persists `data.error` so the Inspector can show it. |
| LLM node uses a Memory node that writes to chat history | Step Run uses an isolated chat history seeded only from `__chat_history__` sentinel rows. We do not pollute the user's real `ChatMessage` table. (V1.0: synthesise a fresh in-memory history; do not persist.) |
| Iteration / Loop / HumanInput / ExecuteFlow runs | Rejected with HTTP 422 in V1.0; controller returns `{ code: 'STEP_RUN_UNSUPPORTED_NODE', message: 'Step Run for this node lands in V1.1.' }`. The UI hides the ▶ button for those nodes. |

---

## 11 · Roadmap-aware extension points

### 11.1 V1.1 — Iteration, Loop, HumanInput, ExecuteFlow

- **Iteration / Loop**: re-enable the recursion branch of `executeNode` for Step Run by passing a stubbed `parentExecutionId` and a guard that prevents writes to the `Execution` table (`isStepRun: true` flag plumbed through one extra arg). The `MAX_LOOP_COUNT` override (`DEBUG_MAX_LOOP_COUNT=3`, default) is read at the controller layer.
- **HumanInput**: keep the existing `'STOPPED'` status semantics. The controller returns the partial `IAgentflowExecutedData` with `status: 'STOPPED'`. The Inspector's HITL panel (already present in `packages/observe`) submits the user's decision via a new `POST /chatflows/:id/debug/nodes/:nodeId/resume` endpoint that re-enters `StepRunner` with `humanInput: {...}`.
- **ExecuteFlow**: introduce a `stubChildFlow: true` switch that bypasses the inner `executeAgentFlow` call and returns a user-provided synthetic output. Without the switch, sub-flows really execute (consistent with V1.0's side-effect honesty).

### 11.2 V2 — Run-up-to-here / step-over / time-travel

- "Run up to here" reuses `executeAgentFlow` directly, but with a stop-after-`nodeId` flag and writes to `DebugNodeExecution` instead of `Execution`. This requires *one* surgical change to `executeAgentFlow` (a new `stopAfterNodeId?: string` parameter); guard tests in `packages/server/src/utils/buildAgentflow.test.ts` enforce zero behaviour change when the flag is absent.
- Time-travel falls out for free if we keep N=10 `DebugNodeExecution` rows per (chatflow, user, node) tuple: the Inspector exposes a scrubber that loads any of the last N.

### 11.3 V2 — Debug-safe annotation

Each `INode` definition gains an optional `isDebugSafe: boolean` flag (default `false`). The Inspector renders a "Side-effect" warning banner on the ▶ button for `!isDebugSafe` nodes. Existing nodes flagged safe in V2: LLM (without tools), Condition, ConditionAgent, DirectReply, CustomFunction (`isDebugSafe` configurable per function).

---

## 12 · Testing strategy

### 12.1 Backend

- **Unit**: `StepRunner.run` against a fake `executeNode` (verify pool composition, saver invocation, status propagation, abort handling).
- **Unit**: `DebugVariablePool.build` exhaustive scope merge tests (request override > DB > flow defaults).
- **Unit**: `DebugVariableSaver.save` per node type (LLM, Condition, Start, child of Iteration → no-op).
- **Integration**: real `executeNode` with `componentNodes` mocked. One test per V1.0 node type. Asserts shapes of persisted rows.
- **Integration**: SSE smoke test on `POST /debug/nodes/:id/run` — confirm event vocabulary identical to a full flow run.
- **Regression**: snapshot test the existing `executeAgentFlow` output on the three flagship marketplace flows (`Agentic RAG`, `Plan and Execute`, `Customer Support Team Agents`). Step Debugger code must not alter these snapshots.
- **Migration**: one round-trip migration test per driver (postgres, mysql, mariadb, sqlite).

### 12.2 Frontend

- `dependentVarExtractor` — table-driven tests over template fragments.
- `useStepRun` — mocked API + SSE source; cover form fallback, all-deps-present, abort, error, HITL placeholder.
- `Inspector` — Storybook stories per tab; visual diffs.
- `RunStepForm` — type-aware fields per `valueType`.

### 12.3 E2E

Add three Playwright flows under `packages/agentflow/e2e/`:

1. Single LLM Step Run with all upstream missing → Run Step Form → success.
2. Edit a Flow State value → re-run Condition → opposite branch.
3. Abort a running Agent Step Run → previous Last Run preserved.

---

## 13 · Observability

- **Telemetry** (existing `Telemetry` singleton) emits per Step Run:
  - `agentflow.debug.step_run.start` `{ chatflowId, nodeName, valueOverridesCount }`
  - `agentflow.debug.step_run.finish` `{ chatflowId, nodeName, status, durationMs, tokensIn, tokensOut }`
  - `agentflow.debug.variable.update` `{ scope, valueType }`
  - `agentflow.debug.variable.reset` `{ scope }`
- **Logs** (`logger`): one structured entry per Step Run start/finish, prefixed `[step-debug]`.
- **Tracing** (`AnalyticHandler`): tag spans with `flowise.debug.step_run = true`. This lets LangSmith / Langfuse / Opik dashboards filter debug noise from production traces.

---

## 14 · Backwards compatibility

| Surface | Risk | Mitigation |
|---|---|---|
| `executeAgentFlow` public contract | Must not change. | No code touched in V1.0. V2 adds `stopAfterNodeId?` (optional, default no-op) guarded by tests. |
| `Execution` table | Must not be polluted with debug rows. | Separate `debug_node_execution` table; never call `addExecution` from `StepRunner`. |
| `IAgentflowExecutedData` shape | Inspector and observe viewer depend on it. | `DebugNodeExecution.data` is typed exactly as `IAgentflowExecutedData['data']`. Any field change ripples to both. CI snapshot test guards this. |
| `INode.run(...)` signature | Hundreds of node implementations. | Untouched. |
| RBAC `agentflows:*` permissions | Existing roles already include them. | No new permission; reuse `agentflows:update`. |
| OSS self-host upgrade | Migrations must work on all four DB drivers. | Migration tests in CI per driver. Migrations are additive (CREATE TABLE only); no schema changes to existing tables. |

---

## 15 · File map (delta inventory)

New files this feature creates:

```
packages/server/src/
    database/entities/
        DebugVariable.ts                            [+]
        DebugNodeExecution.ts                       [+]
    database/migrations/postgres/<ts>-AddDebugTables.ts       [+]
    database/migrations/mysql/<ts>-AddDebugTables.ts          [+]
    database/migrations/mariadb/<ts>-AddDebugTables.ts        [+]
    database/migrations/sqlite/<ts>-AddDebugTables.ts         [+]
    utils/agentflow-step-debug/
        StepRunner.ts                               [+]
        DebugVariablePool.ts                        [+]
        DebugVariableLoader.ts                      [+]
        DebugVariableSaver.ts                       [+]
        constants.ts                                [+]   (sentinel ids, excluded output keys)
    routes/chatflows-debug/
        index.ts                                    [+]
    controllers/chatflows-debug/
        stepRun.ts                                  [+]
        debugVariables.ts                           [+]
        debugNodeExecutions.ts                      [+]
    services/chatflows-debug/
        stepRunService.ts                           [+]
        debugVariableService.ts                     [+]
        debugNodeExecutionService.ts                [+]

packages/server/src/
    Interface.ts                                    [~]   (export DEBUG_NODE_SENTINELS)
    database/entities/index.ts                      [~]   (register new entities)
    routes/index.ts                                 [~]   (mount /chatflows-debug router)
    schedule/ScheduleBeat.ts                        [~]   (add nightly GC)

packages/agentflow/src/features/step-debug/        [+]   (whole tree per §9.1)
packages/agentflow/src/core/types/store.ts          [~]   (add StepDebugSlice)
packages/agentflow/src/infrastructure/store/agentflowReducer.ts [~]   (handle new actions)

packages/ui/src/views/agentflowsv2/AgentFlowNode.jsx [~]  (mount <NodeStepRunControl/>)
packages/ui/src/views/agentflowsv2/Canvas.jsx       [~]   (mount <Inspector/>)
```

No deletions.

---

## 16 · Open architectural questions

1. **Should `DebugVariableSaver` write under sentinel `__chat_history__` when LLM/Agent nodes mutate runtime memory?** Today they don't surface this in `data.state`; we'd need a small change in those nodes to publish a `chatHistoryDelta`. Recommendation: defer to V1.1; in V1.0 the chat history Inspector tab shows whatever the Start step seeded plus nothing more.
2. **Per-flow vs. workspace-scoped throttling on Step Runs.** The PRD says "reuse existing org quotas." Concretely: should we add a per-flow concurrency cap to prevent one builder from spamming ▶ across 14 nodes? Recommendation: yes, a soft semaphore of 4 concurrent Step Runs per `(chatflowId, userId)` enforced in `stepRunService`.
3. **TypeORM `jsonb` portability.** SQLite stores it as `TEXT`. We must add a class-validator transformer on `DebugVariable.value` and `DebugNodeExecution.data` to JSON-stringify on write and parse on read for SQLite. Confirmed already done for `Execution.executionData` (which is `text`, stringified). We can adopt the same pattern.
4. **Streaming response codec.** Flowise's SSE format is custom (`message:\ndata:<json>\n\n`) rather than standard `event:\ndata:\n\n`. The Inspector's SSE consumer must use the same parser as the chat SSE consumer. Confirmed reusable from `packages/ui/src/api/internal-chatmessage` (existing parser).
5. **MCP & external API parity.** Should we expose `POST /chatflows/:id/debug/nodes/:nodeId/run` over the `/mcp` surface? Recommendation: no in V1.0 — keeps the blast radius bounded; revisit when MCP-driven dev loops emerge.

---

## 17 · Appendix — API contract

### 17.1 Run a step (JSON response)

```http
POST /api/v1/chatflows/1f3…/debug/nodes/llmAgentflow_2/run
Content-Type: application/json

{
  "inputs": {
    "llmAgentflow_1.output.content": "{\"intent\":\"refund\",\"orderId\":\"A-42\"}"
  },
  "question": "what's my refund status?",
  "sessionId": "step:1f3…:user-9:llmAgentflow_2"
}
```

```http
200 OK
Content-Type: application/json

{
  "nodeId": "llmAgentflow_2",
  "nodeLabel": "Triage",
  "status": "FINISHED",
  "durationMs": 812,
  "data": {
    "input":  { "messages": [...] },
    "output": { "content": "...", "usageMetadata": {...} },
    "state":  { "userPlan": "pro", "lastIntent": "refund" }
  },
  "capturedVariables": [
    { "id": "...", "scope": "node",       "nodeId": "llmAgentflow_2", "name": "content",       "valueType": "string", "edited": false, "isTruncated": false, "sizeBytes": 412 },
    { "id": "...", "scope": "flow_state", "nodeId": "__flow_state__", "name": "userPlan",      "valueType": "string", "edited": false, "isTruncated": false, "sizeBytes": 3 }
  ]
}
```

### 17.2 Run a step (SSE)

```http
POST /api/v1/chatflows/1f3…/debug/nodes/llmAgentflow_2/run
Accept: text/event-stream
```

Reuses the same line-delimited format the chat SSE uses today:

```
message:
data: {"event":"agentFlowEvent","data":"INPROGRESS"}

message:
data: {"event":"nextAgentFlow","data":{"nodeId":"llmAgentflow_2","nodeLabel":"Triage","status":"INPROGRESS"}}

message:
data: {"event":"token","data":"Hi"}

message:
data: {"event":"agentFlowExecutedData","data":[{ ... IAgentflowExecutedData ... }]}

message:
data: {"event":"agentFlowEvent","data":"FINISHED"}

message:
data: {"event":"end","data":"[DONE]"}
```

### 17.3 List Debug Variables (paginated, no value column)

```http
GET /api/v1/chatflows/1f3…/debug/variables?page=1&limit=50&scope=node&nodeId=llmAgentflow_2
```

```http
200 OK
{
  "page": 1,
  "limit": 50,
  "total": 4,
  "items": [
    { "id": "...", "scope": "node", "nodeId": "llmAgentflow_2", "name": "content",       "valueType": "string", "edited": false, "sizeBytes": 412,  "isTruncated": false },
    { "id": "...", "scope": "node", "nodeId": "llmAgentflow_2", "name": "usageMetadata", "valueType": "json",   "edited": false, "sizeBytes": 87,   "isTruncated": false }
  ]
}
```

### 17.4 Get / edit / reset / delete one variable

```http
GET    /api/v1/chatflows/1f3…/debug/variables/9c2…     → { ..., "value": "..." | { "storageRef": "...", "downloadUrl": "..." } }
PATCH  /api/v1/chatflows/1f3…/debug/variables/9c2…     { "value": "pro" }            → 200 { ..., "edited": true }
DELETE /api/v1/chatflows/1f3…/debug/variables/9c2…                                    → 204
PUT    /api/v1/chatflows/1f3…/debug/variables/9c2…/reset                              → 200 { ..., "edited": false, "value": <last-step-run-value> }
DELETE /api/v1/chatflows/1f3…/debug/variables                                         → 204  (wipe builder's debug state for this flow)
```

### 17.5 Last Step Run for a node

```http
GET /api/v1/chatflows/1f3…/debug/nodes/llmAgentflow_2/last-run

200 OK
{
  "id": "...",
  "nodeId": "llmAgentflow_2",
  "nodeLabel": "Triage",
  "status": "FINISHED",
  "durationMs": 812,
  "createdDate": "2026-05-23T02:46:00Z",
  "data": { "input": { ... }, "output": { ... }, "state": { ... } }
}
```

### 17.6 Per-node variables (refresh after a step run)

```http
GET /api/v1/chatflows/1f3…/debug/nodes/llmAgentflow_2/variables  →  same shape as 17.3 filtered to nodeId
```

---

## 18 · One-paragraph summary for the engineering kickoff

> Step Debugger ships as a thin **runtime wrapper** (`StepRunner`) over the already-extracted `executeNode` primitive, two **new TypeORM entities** (`DebugVariable`, `DebugNodeExecution`), one **new Express router** mounted under `/chatflows/:id/debug/`, and a **new `step-debug` feature** in `packages/agentflow/` that mounts a side-panel **Inspector** reusing every `packages/observe` execution-viewer component. We do not touch `executeAgentFlow`, `Execution`, `INode.run`, or the SSE protocol. We use Flowise's existing namespaces (`$flow.state`, `$form`, `$webhook`, `$vars`, `nodeId.output.path`) and persist them under sentinel `nodeId` values (`__flow_state__`, `__form__`, `__webhook__`, `__system__`). All data is scoped `(workspaceId, chatflowId, userId)` so two builders on the same flow never see each other's debug state. V1.0 covers Start / LLM / Agent / Condition / ConditionAgent / HTTP / Retriever / CustomFunction / Tool / DirectReply; Iteration / Loop / HumanInput / ExecuteFlow land in V1.1.

