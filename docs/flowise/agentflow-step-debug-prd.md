# AgentFlow Step Debugger — Product Requirements (Deck)

> **Audience:** Engineering, Design, Founding PM
> **Author:** PM, AgentFlow
> **Status:** Draft v0.1 — for review
> **Reference:** [`docs/dify/single-node-debug-architecture.md`](../dify/single-node-debug-architecture.md)
> **Format:** One H2 (`##`) = one slide. Code/diagram blocks belong to the slide above them.

---

## 1 · TL;DR

Builders cannot iterate on AgentFlow today without re-running the **entire** flow and reading server logs or the post-mortem execution viewer. We will ship a **Step Debugger** that lets a builder:

1. **Run a single node** from the canvas with one click.
2. **Stub upstream inputs** when prior nodes have not run yet (the *Before-Run Form*).
3. **Inspect** the node's inputs, outputs, errors, traces, and the global **Flow State** in a side panel — live, like Redux DevTools.
4. **Edit and persist** captured values per builder, so the next single-step run reuses them.

The MVP is **node-level only** (no time-travel, no full graph replay), reuses the existing `executeAgentFlow` graph engine, and is gated to draft (unpublished) flows.

---

## 2 · Why now

| Pain | Evidence | Cost |
|---|---|---|
| "I changed one LLM prompt and had to re-run the whole 12-node flow." | Discord/support threads; common Loom complaints | High iteration latency, builder fatigue |
| "I can't see *why* my Condition node took the wrong branch." | `FulfilledConditionsBlock` only shows after a full run | Trial-and-error tuning of routing logic |
| "My HTTP node spent 30s for nothing because the prompt before it was wrong." | All upstream nodes re-charge tokens on every run | Wasted spend on every iteration |
| "I want to mock the Retriever result and see what Agent does." | No way to inject a fake upstream value today | Forces builders to build throwaway flows |
| Dify and n8n already ship per-node debug. | Competitor screenshots / docs | Feature gap on a now-table-stakes builder UX |

A **per-node debug loop** is the single highest-leverage builder productivity feature we can ship.

---

## 3 · Today's state in Flowise

What we already have (and will reuse):

- **Execution model** (`packages/server/src/utils/buildAgentflow.ts`)
  - The runtime queues nodes, resolves variables, and emits `IAgentflowExecutedData` per node:
    ```ts
    { nodeLabel, nodeId, data: { input, output, state, error, ... }, previousNodeIds, status }
    ```
  - Persisted as `Execution.executionData` (JSON) with `state: 'INPROGRESS' | 'FINISHED' | 'ERROR' | 'STOPPED' | …`.
- **Variable namespaces** already supported by `resolveVariables`:
  - `{{ $vars.X }}`, `{{ $flow.X }}`, `{{ $form.X }}`, `{{ $webhook.X }}`, `{{ $iteration.X }}`, `{{ $loop_count }}`, `{{ $question }}`, `{{ $file_attachment }}`, `{{ $current_date_time }}`, and direct `{{ nodeId.output.path }}` refs.
- **Global flow state** — key/value object initialised on the `Start` node, mutated by `updateFlowState`, snapshotted into `data.state` per executed node.
- **Pause/resume primitive** — `humanInputAgentflow` already persists an `Execution`, returns `STOPPED`, and reuses the same `executeAgentFlow` to resume. This is conceptually close to a breakpoint.
- **Post-mortem viewer** — `packages/observe/src/features/executions/` already renders a node tree, per-node detail (input/output/state/error/metrics), HITL controls, rendered/raw toggle, used-tools, fulfilled conditions, and chat bubbles.

What we do **not** have:

- No way to start execution from anywhere other than `startAgentflow`.
- No place to seed/mock upstream variables.
- No per-builder "draft variable" persistence.
- No live, in-canvas inspector — the executions viewer is a separate post-mortem route.
- No way to edit a captured value and feed it into the next step.

---

## 4 · How Dify does it (1-slide recap)

The reference doc summarises the Dify model. The two ideas we will steal verbatim:

1. **`POST /workflows/draft/nodes/:node_id/run`** — one HTTP call runs one node against a builder-private variable pool. Upstream values come from `DraftVarLoader`, which reads previously captured per-node outputs scoped by `(app_id, user_id, node_id)`.
2. **A `WorkflowDraftVariable` table** keyed by `(app_id, user_id, node_id, name)` with three reserved `node_id` sentinels for `sys.*`, `conversation.*`, `env.*`. The **Variable Inspect** panel reads this table; the **PATCH** / **reset** endpoints write to it.

The rest — play button, BeforeRunForm, Last Run tab, per-user isolation, the four-tab inspector — are the UX consequences of those two backend decisions.

---

## 5 · Vision

> **Every node on an AgentFlow draft is a self-contained, runnable, inspectable unit of work — like a cell in a Jupyter notebook.**

A builder hovers a node, clicks ▶, sees inputs they can edit, runs it in <1s of UI latency, and watches the inputs, outputs, error, and the Flow State diff update live in a docked Inspector. They can edit a captured value, re-run, and the change propagates to the next node they debug. None of this affects production traffic, other builders, or the published version of the flow.

---

## 6 · Personas & top jobs

| Persona | Job-to-be-done | Frequency |
|---|---|---|
| **Flow Author** (primary) | "Tweak one prompt and verify the LLM output without burning the whole flow." | Hourly during build |
| **Tool Integrator** | "Confirm my HTTP/Tool node returns the JSON shape downstream agents expect." | Per integration |
| **Routing Tuner** | "Why did `Condition_2` pick branch B? Show me the values it compared." | Per release |
| **State Engineer** | "I assigned `state.userPlan = 'pro'` upstream — is it actually there when the Agent reads it?" | Per stateful flow |
| **Reviewer / Support** | "Repro a customer's bad run by stepping through their captured variables." | On-call |

---

## 7 · Primary user journeys (MVP)

### J1 — Tweak a prompt and run only the LLM node

1. Builder runs the full flow once (existing chat tab) → all nodes get a Last Run.
2. They edit the LLM node's system prompt in the side panel.
3. They click ▶ on the LLM node card.
4. Because every upstream variable already has a captured value, the run starts immediately. The Inspector switches to **Last Run** and shows the new output streaming in.
5. They iterate (edit prompt → ▶) without ever touching the chat tab again.

### J2 — Test a node in isolation, mid-build

1. Builder drops a new `HTTP` node into a half-built flow. No upstream node has ever run.
2. They click ▶. The **Before-Run Form** appears: the inspector enumerates the variables this node references (`{{ llm_1.output.content }}`, `{{ $vars.API_KEY }}`, `{{ $flow.sessionId }}`) and asks for a value for each missing one.
3. They paste a JSON blob for `llm_1.output.content`, fill `$vars.API_KEY` from the secrets dropdown, hit **Run**.
4. The values are saved as draft variables. The HTTP node runs, captures its output, and shows the response.

### J3 — Mock a global state value and re-run a router

1. Builder opens the **Inspector → State** tab.
2. They click ✎ next to `userPlan`, change it from `'free'` to `'pro'`, hit Save.
3. They click ▶ on the `Condition` node. It re-evaluates with the new state and shows which branch fulfilled.

### J4 — Reset to last actual run

1. After J3, the builder wants to confirm production-like behaviour.
2. In the State tab, the edited variable shows an "edited" badge. They click **Reset**. The value reverts to what the last real execution produced.

---

## 8 · Scope — MVP vs. Fast-Follow vs. Later

### MVP (V1, 1 release)

- ▶ / ⏹ button on every supported node card.
- Right-click → "Run this step" in the node context menu.
- Before-Run Form with type-aware inputs for missing upstream variables.
- Inspector side panel with four tabs: **Last Run**, **Node Vars**, **Flow State**, **Globals** (env + system + form/webhook).
- Per-builder draft variable persistence (new table).
- Edit, reset, and delete captured values.
- Streaming (SSE) for `LLM`, `Agent`, `Iteration`, `Loop` single-step runs.
- Supported nodes (V1): **Start, LLM, Agent, Condition, ConditionAgent, HTTP, Retriever, CustomFunction, Tool, DirectReply**.

### Fast-Follow (V1.1)

- **Iteration / Loop** single-step: stream child executions; allow stubbing the iteration input array.
- **HumanInput** single-step: open the HITL pane in "listening" mode and accept a synthetic decision.
- **ExecuteFlow** single-step with a child-flow stub option.
- "Run up to here" — execute all upstream ancestors then the selected node.

### Later (V2+)

- Multi-step "Run from here" with breakpoints and step-over.
- Time-travel: rewind to any previous single-step snapshot.
- Diff view: compare two captured values side-by-side.
- Collaborative debugging (presence on the node being debugged).
- Step Debugger inside `ExecuteFlow` sub-flows from the parent canvas.

---

## 9 · Functional requirements

### 9.1 Entry points

- **FR-1.1** Every debuggable node renders a ▶ button on its action bar when hovered or selected. It is hidden on non-draft (published) flows.
- **FR-1.2** The button toggles to ⏹ while a single-step run is in flight; clicking ⏹ aborts the request via `AbortController`.
- **FR-1.3** Right-click menu on the node exposes the same **Run this step** entry.
- **FR-1.4** A flow-level allowlist (`canRunBySingle`) is the single source of truth. Children of `Iteration` / `Loop` are excluded until V1.1.
- **FR-1.5** A keyboard shortcut (`⌘ / Ctrl + Enter` while a node is selected) runs that node.

### 9.2 Before-Run Form

- **FR-2.1** When the builder triggers a run, the system computes the node's **dependent variables** (templates + connected input edges).
- **FR-2.2** For each dependent variable that has no captured value, render a form field. Types mirror the variable's declared type (string, number, JSON, file, enum).
- **FR-2.3** Reference values from previous captures are pre-filled and read-only-toggleable.
- **FR-2.4** Form submission persists each value as a `DraftVariable` row, then triggers the run.
- **FR-2.5** If all variables are already captured, **skip the form** and run immediately.

### 9.3 Single-step execution

- **FR-3.1** New endpoint:
  `POST /api/v1/agentflows/:flowId/draft/nodes/:nodeId/run`
  Body: `{ inputs?: Record<string, any>, files?: IFileUpload[], question?: string, sessionId?: string }`
- **FR-3.2** Server seeds a `VariablePool` from:
  1. The submitted `inputs` (overrides everything).
  2. The builder's `DraftVariable` rows for this flow.
  3. The flow's environment variables.
  4. Computed system variables (`sys.*`).
- **FR-3.3** Server runs **exactly one** node through the existing `executeAgentFlow` engine, with a `singleNodeMode: true` switch that:
  - Skips queueing downstream nodes.
  - Skips writing to the shared `Execution` table; instead writes to a new `DraftNodeExecution` row (see §11).
- **FR-3.4** Server returns the same shape as today's per-node executed payload (`{ data: { input, output, state, error, … }, status }`), plus a list of newly captured variables.
- **FR-3.5** For streaming-capable nodes (LLM, Agent), the endpoint accepts `Accept: text/event-stream` and emits the existing `token`, `tool_use`, `agent_step`, `end` SSE events.
- **FR-3.6** Iteration and Loop (V1.1) stream nested node executions, one frame per child finish.
- **FR-3.7** Abort: the request is cancellable; cancelling marks the captured run as `STOPPED` and never overwrites the previous Last Run.

### 9.4 Variable persistence ("Draft Variables")

- **FR-4.1** New table `agentflow_draft_variable`:
  | column | type | notes |
  |---|---|---|
  | `id` | uuid | pk |
  | `flow_id` | uuid | fk → `chat_flow.id` |
  | `workspace_id` | uuid | tenancy |
  | `user_id` | uuid | per-builder isolation |
  | `node_id` | text | logical node id; reserved sentinels for `flow`, `system`, `conversation`, `env` |
  | `name` | text | variable name |
  | `value_type` | enum | `string \| number \| boolean \| json \| file \| array` |
  | `value` | jsonb | typed payload (offloaded to storage above N bytes) |
  | `description` | text | optional |
  | `visible` | bool | inspector visibility |
  | `editable` | bool | inspector edit-ability |
  | `edited` | bool | "user-edited since last run" flag |
  | `created_at`, `updated_at`, `last_run_at` | timestamp |
- **FR-4.2** Unique on `(flow_id, user_id, node_id, name)`. Re-running a node upserts rows; the old `edited=true` flag is cleared.
- **FR-4.3** Large values (`> 64 KiB`, configurable) spill to the existing file storage abstraction. The list endpoint returns metadata + a signed download URL instead of the raw value.
- **FR-4.4** Deleting the flow cascades. Deleting a node from the canvas garbage-collects its draft variables lazily.

### 9.5 New backend endpoints

| Verb | Path | Purpose |
|---|---|---|
| `POST` | `/agentflows/:flowId/draft/nodes/:nodeId/run` | Single-step run (FR-3.1). |
| `GET` | `/agentflows/:flowId/draft/nodes/:nodeId/last-run` | Re-fetch the last single-step record for one node. |
| `GET` | `/agentflows/:flowId/draft/variables` | List all of *this builder's* captured variables (no `value`, paginated). |
| `GET` | `/agentflows/:flowId/draft/variables/:varId` | Fetch one value (lazy-load for the inspector tree). |
| `PATCH` | `/agentflows/:flowId/draft/variables/:varId` | Edit `value` and/or `name`. |
| `DELETE` | `/agentflows/:flowId/draft/variables/:varId` | Remove an inspector value. |
| `PUT` | `/agentflows/:flowId/draft/variables/:varId/reset` | Restore the value from the most recent `DraftNodeExecution.outputs`. |
| `GET` | `/agentflows/:flowId/draft/nodes/:nodeId/variables` | Per-node variant — used right after a single-step run. |
| `DELETE` | `/agentflows/:flowId/draft/variables` | Wipe this builder's whole inspector state for the flow. |

All endpoints require the existing `chatflow.edit` permission, scope by `workspaceId`, and double-check `userId` to prevent cross-tenant ID guessing.

### 9.6 Inspector panel (frontend)

The Inspector is a docked, resizable side panel that lives next to the canvas (reusing the resizable drawer pattern from `packages/observe/.../useResizableSidebar`).

Tabs:

1. **Last Run** (default after a single-step run) — node metadata, status, latency, token usage, rendered + raw input/output, error stack, used tools, fulfilled conditions. **This is the existing `NodeExecutionDetail` component, reused.**
2. **Node Vars** — flat list of every variable captured for the currently-selected node. Inline edit, copy reference, copy value, reset, delete.
3. **Flow State** — the global key/value `state` object as a tree. Edit per key. Diff badge ("edited") and reset.
4. **Globals** — collapsible sub-sections for **Environment**, **System** (`sys.user_id`, `sys.session_id`, …), **Form**, **Webhook**, **Iteration / Loop** context. Read-only for system vars; editable for env (proxied to the existing env-var screen).

Cross-cutting:

- **Variable references** — every variable row has a "copy as `{{ … }}`" affordance.
- **Tree filter** — search box filters by name, scope, type.
- **Truncation** — large values render a "Download (…KB)" chip instead of inlining.

### 9.7 Node-level UX

- Node card gains a small **Last Run status pill** (Succeeded / Failed / Stale / Never Run) showing the result of the most recent single-step run.
- Connected edges fade when their target has a captured value and brighten when missing — visual hint of "ready to run from here".
- A "Run downstream from here" affordance is reserved for V2.

### 9.8 Isolation & scoping

- **FR-8.1** Every draft variable, last-run record, and Before-Run Form value is scoped to `(workspace_id, flow_id, user_id)`. Two builders editing the same flow do **not** see each other's debug state.
- **FR-8.2** The `Execution` table (production runs) is never written to by single-step runs.
- **FR-8.3** Publishing a flow does **not** copy debug state. Debug state is ephemeral by contract.

---

## 10 · Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | UI latency, ▶ click → request dispatched | < 100 ms |
| NFR-2 | Server round-trip for a cached LLM (≤500 tokens) | < 1.5 s p50 |
| NFR-3 | Inspector tree update after capture | < 200 ms |
| NFR-4 | Concurrent debuggers per flow | ≥ 20 without locking |
| NFR-5 | Captured variable size cap before offload | 64 KiB (configurable) |
| NFR-6 | Draft-variable retention | 30 days idle, garbage-collected nightly |
| NFR-7 | Security — no cross-user variable access | Enforced at service layer and DB query |
| NFR-8 | Observability — every single-step run emits a span | Tag `flowise.debug.single_step=true` |
| NFR-9 | Cost — single-step runs do not bypass quota / rate limits | Same accounting as full runs |
| NFR-10 | Backwards compatibility — published flows behave identically | No change to `executeAgentFlow` public contract |

---

## 11 · Data model & runtime changes

### 11.1 New entities

```ts
// packages/server/src/database/entities/AgentflowDraftVariable.ts
@Entity('agentflow_draft_variable')
@Unique(['flowId', 'userId', 'nodeId', 'name'])
class AgentflowDraftVariable {
    @PrimaryGeneratedColumn('uuid') id: string
    @Index() @Column() flowId: string
    @Index() @Column() workspaceId: string
    @Index() @Column() userId: string
    @Column() nodeId: string          // or sentinel: '__flow__', '__system__', '__conversation__', '__env__'
    @Column() name: string
    @Column() valueType: VarType
    @Column({ type: 'jsonb' }) value: unknown
    @Column({ nullable: true }) description?: string
    @Column({ default: true }) visible: boolean
    @Column({ default: true }) editable: boolean
    @Column({ default: false }) edited: boolean
    @CreateDateColumn() createdAt: Date
    @UpdateDateColumn() updatedAt: Date
    @Column({ nullable: true }) lastRunAt?: Date
}
```

```ts
// packages/server/src/database/entities/AgentflowDraftNodeExecution.ts
@Entity('agentflow_draft_node_execution')
class AgentflowDraftNodeExecution {
    @PrimaryGeneratedColumn('uuid') id: string
    @Index() @Column() flowId: string
    @Index() @Column() userId: string
    @Index() @Column() nodeId: string
    @Column({ type: 'jsonb' }) data: IAgentflowExecutedData['data']
    @Column() status: ExecutionState           // reuse existing enum
    @CreateDateColumn() createdAt: Date
}
```

### 11.2 Runtime changes

A new `runSingleNode(...)` orchestrator (sibling of `executeAgentFlow`) that:

1. Loads the draft flow (no `Execution` row).
2. Builds the variable pool from `DraftVariable` rows + `inputs` overrides.
3. Calls the existing per-node `execute` path (factored out of `executeAgentFlow`'s queue loop into a reusable `executeNode(...)` already implemented internally).
4. Persists outputs via a new `DraftVariableSaver` analogous to Dify's:
   - Generic nodes → one `DraftVariable` per `output.*` key.
   - Start / trigger nodes → split into `sys.*`, `env.*`, `conversation.*` namespaces.
   - State-mutating nodes → write keys under `__flow__` and tag the run.
   - `Iteration` / `Loop` children → skipped; parent owns the scope.
5. Inserts a `DraftNodeExecution` row.
6. Returns the same response shape the inspector already understands.

`executeAgentFlow` is **not modified**. Single-step lives alongside it.

### 11.3 Variable-pool loader (the key change)

A new `DraftVariableLoader` implements the existing variable resolution interface used by `resolveVariables`. When the running node references `{{ nodeId.output.path }}` or `{{ $flow.X }}` etc., the loader:

1. Looks for an override in the request body.
2. Falls back to a `DraftVariable` row (current builder).
3. Falls back to the live flow definition (for env vars and node defaults).
4. Returns `undefined` (triggering the Before-Run Form) only at request-time, never mid-run.

---

## 12 · Frontend architecture

- New feature folder: `packages/agentflow/src/features/step-debug/`
  - `useStepDebug.ts` — orchestration hook (intent → form → request → inspector refresh).
  - `useDependentVars.ts` — computes the variables a node references.
  - `BeforeRunForm.tsx` — type-aware form.
  - `Inspector/` — the four-tab panel.
- New canvas affordance: ▶/⏹ button injected into `AgentFlowNode` (currently `packages/ui/src/views/agentflowsv2/AgentFlowNode.jsx`).
- New shared Zustand slice (`debugStore`) holding `pendingSingleRun`, `lastRunByNodeId`, `inspectVarsByNodeId`, mirroring Dify's pattern. The existing Redux store remains for canvas/UI concerns; we will **not** mix the two.
- The existing `packages/observe` execution viewer components (`NodeExecutionDetail`, `RawJsonPanel`, `ToolAccordionList`, etc.) are lifted into a shared module so both the post-mortem viewer and the live Inspector consume them.

---

## 13 · Node debuggability matrix (V1 commitment)

| Node | Single-step? | Notes |
|---|---|---|
| **Start** | ✅ | Seeds `sys.*`, `form.*`, `webhook.*`, `state.*`. Effectively "re-initialise". |
| **LLM** | ✅ | Streams tokens. Honors structured output config. |
| **Agent** | ✅ | Streams `agent_step` + `tool_use`. Tools execute for real (warn user). |
| **Condition** | ✅ | Output renders via existing `FulfilledConditionsBlock`. |
| **ConditionAgent** | ✅ | Same as Condition + LLM streaming. |
| **HTTP** | ✅ | Honors `acceptVariable` headers; previews redacted secrets. |
| **Retriever** | ✅ | Real vector store hit. |
| **CustomFunction** | ✅ | Sandbox unchanged. |
| **Tool** | ✅ | Same warning as Agent — side-effecting tools really fire. |
| **DirectReply** | ✅ | No external side effects; cheap to debug. |
| **HumanInput** | ⏳ V1.1 | Needs HITL panel integration in inspector. |
| **Iteration** | ⏳ V1.1 | Needs nested SSE. |
| **Loop** | ⏳ V1.1 | Needs nested SSE + safe `MAX_LOOP_COUNT`. |
| **ExecuteFlow** | ⏳ V1.1 | Needs child-flow stubbing option. |
| **StickyNote** | ❌ | Non-executable. |

---

## 14 · UX wireframe (described)

```
┌──────────────────────────────  Canvas  ──────────────────────────────┐ ┌── Inspector ─────┐
│                                                                      │ │ ┌──────────────┐ │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐         │ │ │ Last Run ✓   │ │
│   │  Start     ▶ │ ──▶ │  LLM       ▶ │ ──▶ │  Condition ▶ │         │ │ │ Node Vars    │ │
│   │  (chat in)   │     │  prompt …    │     │  $state.plan │         │ │ │ Flow State 2 │ │
│   └──────────────┘     └──────────────┘     └──────────────┘         │ │ │ Globals      │ │
│                            ⠿ Last Run  ⠿ Stale       ▼               │ │ └──────────────┘ │
│                                                ┌──────────────┐      │ │                  │
│                                                │  HTTP      ▶ │      │ │ ▼ Output         │
│                                                │  ! never run │      │ │   { content:     │
│                                                └──────────────┘      │ │     "Hello…" }   │
│                                                                      │ │ ▶ Input          │
│                                                                      │ │ ▶ Used tools (2) │
│                                                                      │ │ ▶ State diff     │
└──────────────────────────────────────────────────────────────────────┘ └──────────────────┘
```

Notable interactions:

- ▶ on a node → Inspector slides in, opens **Last Run** tab.
- Missing upstream var → modal overlay (BeforeRunForm) anchored to the node card.
- State edit → green "edited" dot + Reset link.
- Hover a `{{ nodeId.output.path }}` in any field → underline + tooltip showing the captured value.

---

## 15 · Edge cases & open questions

### Hard cases the team must decide

1. **Side-effecting nodes** — should single-step runs of `Tool`, `HTTP POST`, `ExecuteFlow` really hit production endpoints, or do we ship a "dry-run" toggle? *Recommendation: real by default, with a banner; "dry-run" is V2.*
2. **LLM cost** — every step run bills tokens. Do we cap per-builder daily debug spend? *Recommendation: reuse existing org-level quotas; surface a "debug spend" tile in usage.*
3. **Loops** — debug-runs of a Loop with `MAX_LOOP_COUNT=10` could explode token use. *Recommendation: V1.1 forces a hard `debugMaxLoopCount=3` override.*
4. **HITL** — a `humanInputAgentflow` paused mid-debug holds inspector state. How long do we keep it? *Recommendation: same TTL as `Execution.STOPPED` today (24h).*
5. **Children of Iteration** — can a builder debug an `LLM` *inside* an `Iteration`? *V1: no, surface a tooltip "select the Iteration to debug the whole iteration in V1.1." V1.1: yes, with the iteration index defaulted to 0.*
6. **State mutation conflicts** — if two builders mutate the global state for the same flow at the same time, last write wins. Acceptable? *Yes — they are in independent draft-variable namespaces; the "global" is per-user.*
7. **File variables** — uploads are stored in object storage. We need a signed-URL contract for the inspector's "preview" / "download". *Reuse the existing get-upload-file controller.*

### Open

- Should the inspector be a **side panel** (chosen) or a **bottom drawer** (more Jupyter-like)?
- Do we expose a CLI / SDK equivalent in `@cursor/sdk`-style for headless step-debugging?
- Do we ship a "share my debug session" link (URL → preloaded BeforeRunForm)?

---

## 16 · Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Runtime fork: `runSingleNode` diverges from `executeAgentFlow`. | High | High | Factor a shared `executeNode(...)` primitive *first*, refactor `executeAgentFlow` to call it, only then build `runSingleNode`. |
| Draft variable table grows unbounded. | Medium | Medium | TTL + size cap + nightly GC + storage offload. |
| Side-effecting tool runs surprise users. | High | Medium | Persistent warning banner; per-node "debug-safe" annotation in component metadata. |
| Inspector UI conflicts with the existing node edit dialog. | Medium | Low | Dialog vs. side panel — side panel wins; edit dialog stays double-click only. |
| Backwards-compat regression in `executeAgentFlow`. | Low | High | Snapshot tests of the existing full-flow execution; CI gate. |
| Cost overrun from LLM step-debugging. | Medium | Medium | Surface usage; reuse org quotas; per-org debug-spend ceiling in V1.1. |
| Multi-user state confusion on shared flows. | Low | Medium | Strict per-user namespacing; surface a "you are debugging" presence chip in V1.1. |

---

## 17 · Success metrics

Targets at 30 days post-GA.

| Metric | Target | Source |
|---|---|---|
| % of weekly active builders that use Step Debugger | ≥ 60% | Telemetry: `agentflow.debug.single_step.run` |
| Median time between flow saves while debugging | ↓ 40% | Existing save events |
| Median # of full-flow runs per saved revision | ↓ 50% | `Execution` table |
| LLM tokens per saved revision | ↓ 25% | Usage |
| Inspector tab dwell time per debug session | > 2 min | UI telemetry |
| Support tickets tagged "can't see why my flow did X" | ↓ 50% | Helpdesk |

---

## 18 · Rollout

1. **Internal alpha** behind `feature.stepDebugger=true` on Flowise Cloud staging. Two flows from each top customer migrated.
2. **Closed beta** to ~25 Cloud orgs for 2 weeks. Inspector telemetry + weekly NPS.
3. **GA** behind the same flag, default-on for new orgs, opt-in for existing.
4. **OSS release** one minor after GA. Self-hosted gets the same DB migrations.

Telemetry events (PostHog / OpenTelemetry):

- `debug.single_step.requested` `{ nodeType, hasMissingVars }`
- `debug.single_step.completed` `{ nodeType, status, durationMs, tokensIn, tokensOut }`
- `debug.variable.edited` `{ scope, valueType }`
- `debug.variable.reset` `{ scope }`
- `debug.inspector.tab_viewed` `{ tab }`

---

## 19 · Out of scope (explicitly)

- Multi-node "Run from here" / "Run up to here" (V2).
- Time-travel / snapshot history (V2).
- Visual diff between two captured values (V2).
- Multi-user collaborative cursors on a node (V2).
- Step Debugger for v1 Chatflows (not AgentFlow V2). We will encourage migration; no new investment in v1 debug.
- Replacing the post-mortem executions viewer. It stays — Step Debugger augments, not replaces.

---

## 20 · Glossary

| Term | Definition |
|---|---|
| **Draft Variable** | A per-(workspace, flow, user, node, name) captured value, owned by Step Debugger. Distinct from environment variables and `$vars`. |
| **Single-Step Run** | A server-side execution of exactly one node in the graph engine, against a builder-private variable pool. |
| **Inspector** | The docked side panel showing Last Run / Node Vars / Flow State / Globals. |
| **Before-Run Form** | The modal that collects missing upstream variable values before triggering a Single-Step Run. |
| **Last Run** | The most recent `DraftNodeExecution` for a (flow, user, node) tuple. |
| **Flow State** | The global key/value object initialised by the Start node and mutated by `updateFlowState`. |
| **HITL** | Human-in-the-loop — the existing `humanInputAgentflow` pause/resume primitive. |
| **Debug-Safe** | A node-level annotation indicating the node has no external side effects (LLM, Condition, DirectReply, …). |

---

## 21 · Appendix — API request/response sketches

### Single-step run

```http
POST /api/v1/agentflows/1f3…/draft/nodes/llmAgentflow_2/run
Content-Type: application/json

{
  "inputs": {
    "llmAgentflow_1.output.content": "{ \"intent\": \"refund\", \"orderId\": \"A-42\" }"
  },
  "files": []
}
```

```http
200 OK
Content-Type: application/json

{
  "nodeId": "llmAgentflow_2",
  "status": "FINISHED",
  "data": {
    "input":  { "messages": [...] },
    "output": { "content": "...", "usageMetadata": { "input_tokens": 412, "output_tokens": 187 } },
    "state":  { "userPlan": "pro", "lastIntent": "refund" }
  },
  "variables": [
    { "id": "…", "name": "content",       "valueType": "string", "edited": false, "isTruncated": false },
    { "id": "…", "name": "usageMetadata", "valueType": "json",   "edited": false, "isTruncated": false }
  ]
}
```

### Streaming variant

```http
POST /api/v1/agentflows/1f3…/draft/nodes/llmAgentflow_2/run
Accept: text/event-stream
```

```
event: start
data: { "nodeId": "llmAgentflow_2" }

event: token
data: { "content": "Hi" }

event: token
data: { "content": " there!" }

event: end
data: { "status": "FINISHED", "variables": [ … ] }
```

### Edit a captured value

```http
PATCH /api/v1/agentflows/1f3…/draft/variables/9c2…
Content-Type: application/json

{ "value": "pro" }
```

```http
200 OK
{ "id": "9c2…", "name": "userPlan", "valueType": "string", "edited": true, "value": "pro" }
```

---

## 22 · One-pager (for the deck cover)

> **AgentFlow Step Debugger** — Run any node alone, see every input and output, edit captured values, and watch the global Flow State change live. A Redux-DevTools-grade inspector for AgentFlow, gated to draft flows and scoped per builder. MVP covers 10 of our 14 node types; Iteration / Loop / HumanInput / ExecuteFlow land in V1.1. Reuses the existing graph engine, observation panels, and HITL primitive — no fork.

