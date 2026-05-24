# Single-Node Debugging Architecture

## Overview

The **single-node debug** feature lets users execute one node of a draft workflow in isolation and inspect every value it produces. It is the foundation of the workflow debugging experience in Dify: instead of replaying the whole graph, the user picks a node, supplies any missing upstream inputs, runs only that node on the server, and reads the captured variables from the **Last Run** tab and the **Variable Inspect** panel.

There are two UI entry points that trigger the same backend flow:

1. The **play button** on the node action bar that appears when a node is hovered or selected (`web/app/components/workflow/nodes/_base/components/node-control.tsx`).
2. The **"Run this step"** item in the node context menu (`web/app/components/workflow/node-actions-menu/context-menu-content.tsx`).

Once a node finishes, its outputs are persisted as `WorkflowDraftVariable` rows scoped to `(app_id, user_id, node_id)`. The console then re-reads these rows through the variable APIs anchored at `WorkflowVariableCollectionApi` (`api/controllers/console/app/workflow_draft_variable.py`).

## High-Level Flow

```
┌──────────────────────────── Frontend (React + Zustand) ────────────────────────────┐
│                                                                                    │
│   [Play button]            [Context menu]                                          │
│   node-control.tsx         context-menu-content.tsx                                │
│        │                          │                                                │
│        │ setPendingSingleRun      │ handleRun → _isSingleRun = true                │
│        ▼                          ▼                                                │
│   ┌──────────────────────────────────────────────────────────────┐                 │
│   │   BasePanel (workflow-panel/index.tsx)                       │                 │
│   │   • selects node, opens panel                                 │                │
│   │   • useLastRun → useOneStepRun                               │                 │
│   │   • shows BeforeRunForm when upstream vars are missing       │                 │
│   └──────────────────────────────────────────────────────────────┘                 │
│        │ singleNodeRun()                                                           │
│        │   POST /console/api/apps/:app_id/workflows/draft/nodes/:node_id/run       │
│        ▼                                                                           │
└────────┬───────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────── Backend (Flask + Graph Engine) ─────────────────────────┐
│                                                                                     │
│   DraftWorkflowNodeRunApi  (controllers/console/app/workflow.py)                    │
│        │                                                                            │
│        ▼                                                                            │
│   WorkflowService.run_draft_workflow_node  (services/workflow_service.py)           │
│        │   prefill conv vars → build VariablePool → DraftVarLoader                  │
│        ▼                                                                            │
│   WorkflowEntry.single_step_run     ──► executes a single node in the graph engine  │
│        │                                                                            │
│        ▼                                                                            │
│   DraftVariableSaver.save  (services/workflow_draft_variable_service.py)            │
│        │   normalize outputs → upsert WorkflowDraftVariable rows                    │
│        ▼                                                                            │
│   WorkflowNodeExecution + WorkflowDraftVariable persisted (Postgres)                │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────────────── Console reads back the variables ───────────────────────┐
│                                                                                     │
│   GET .../workflows/draft/nodes/:node_id/variables  → NodeVariableCollectionApi     │
│   GET .../workflows/draft/variables                 → WorkflowVariableCollectionApi │
│   GET .../workflows/draft/system-variables          → SystemVariableCollectionApi   │
│   GET .../workflows/draft/conversation-variables    → ConversationVariableCollection│
│                                                                                     │
│   PATCH /workflows/draft/variables/:variable_id     → edit captured value           │
│   PUT   /workflows/draft/variables/:variable_id/reset → restore last-run value      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## UI Entry Points

### Play Button on the Node Action Bar

The play button is rendered by `NodeControl` only when `canRunBySingle(data.type, isChildNode)` returns `true`. The button toggles between **Run** and **Stop** based on `data._singleRunningStatus === NodeRunningStatus.Running`.

```50:67:web/app/components/workflow/nodes/_base/components/node-control.tsx
        {
          canRunBySingle(data.type, isChildNode) && (
            <button
              type="button"
              aria-label={isSingleRunning ? t('debug.variableInspect.trigger.stop', { ns: 'workflow' }) : t('panel.runThisStep', { ns: 'workflow' })}
              className={`flex h-5 w-5 items-center justify-center rounded-md ${isSingleRunning && 'cursor-pointer hover:bg-state-base-hover'}`}
              onClick={() => {
                const action = isSingleRunning ? 'stop' : 'run'

                const store = workflowStore.getState()
                store.setInitShowLastRunTab(true)
                store.setPendingSingleRun({
                  nodeId: id,
                  action,
                })
                handleNodeSelect(id)
              }}
            >
```

Three things happen on click:

1. `setInitShowLastRunTab(true)` — the side panel will open on the **Last Run** tab so the user sees outputs first.
2. `setPendingSingleRun({ nodeId, action })` — a single-slot intent stored in the Zustand workflow store. The intent is consumed by `BasePanel` (see below).
3. `handleNodeSelect(id)` — opens the node panel; this mounts `BasePanel`, which is where `pendingSingleRun` is actually executed.

The same store slice is also used by the **Stop** branch: `action: 'stop'` is dispatched and `BasePanel` translates it into `handleStop()`.

### "Run this step" in the Context Menu

The context menu reuses `useNodeActionsMenuModel`, which exposes `canRun` (same `canRunBySingle` check) and a `handleRun` callback.

```28:32:web/app/components/workflow/node-actions-menu/context-menu-content.tsx
          {model.canRun && (
            <ContextMenuItem onClick={model.handleRun}>
              {t('panel.runThisStep', { ns: 'workflow' })}
            </ContextMenuItem>
          )}
```

`handleRun` takes a slightly different path than the play button:

```62:67:web/app/components/workflow/node-actions-menu/use-node-actions-menu-model.ts
  const handleRun = useCallback(() => {
    handleNodeSelect(id)
    handleNodeDataUpdate({ id, data: { _isSingleRun: true } })
    handleSyncWorkflowDraft(true)
    onClose()
  }, [handleNodeDataUpdate, handleNodeSelect, handleSyncWorkflowDraft, id, onClose])
```

Here we flip `data._isSingleRun = true` and sync the draft. `useOneStepRun` watches `_isSingleRun` and opens the **BeforeRunForm** — the dialog that lets the user supply the upstream values explicitly before the run. The play button skips this dialog whenever all dependent variables already have values; both paths end up calling the same execution function.

### Which Nodes Can Be Single-Run?

`canRunBySingle` (in `web/app/components/workflow/utils/workflow.ts`) is the single source of truth. It allowlists node types such as `LLM`, `Code`, `HttpRequest`, `Tool`, `Iteration`, `Loop`, `Agent`, `Start`, `IfElse`, `VariableAggregator`, `Assigner`, `HumanInput`, `DataSource`, and the trigger nodes. It also blocks `Assigner` when nested inside `Iteration` / `Loop` (child nodes), because that combination would mutate scopes the single-step runner does not own.

When adding a new node type, update `canRunBySingle` **and** register a `useSingleRunFormParams` hook in `web/app/components/workflow/nodes/_base/components/workflow-panel/last-run/use-last-run.ts` so the BeforeRunForm knows which inputs to render.

## Frontend Orchestration

### `BasePanel` — Bridging Intent and Execution

`BasePanel` (`web/app/components/workflow/nodes/_base/components/workflow-panel/index.tsx`) is the node detail panel. When it mounts (after `handleNodeSelect`), it subscribes to the pending intent and to `useLastRun`:

```296:306:web/app/components/workflow/nodes/_base/components/workflow-panel/index.tsx
  useEffect(() => {
    if (!pendingSingleRun || pendingSingleRun.nodeId !== id)
      return

    if (pendingSingleRun.action === 'run')
      handleSingleRun()
    else
      handleStop()

    setPendingSingleRun(undefined)
  }, [pendingSingleRun, id, handleSingleRun, handleStop, setPendingSingleRun])
```

`handleSingleRun` (in `use-last-run.ts`) is the decision point:

1. Run the node-type checklist (`blockIfChecklistFailed`) and the per-node `checkValid` function.
2. For trigger nodes, open the Variable Inspect panel in listening mode.
3. If the node is a custom-run node (`DataSource`) or `HumanInput`, open the dedicated form via `showSingleRun()`.
4. Otherwise compute the upstream variables via `singleRunParams.getDependentVars()`. If all of them already have an inspected value (via `useInspectVarsCrud.hasSetInspectVar`), call the run API immediately with an empty payload. If some are missing, fall back to opening **BeforeRunForm** so the user can supply them.

### `useOneStepRun` — The HTTP Layer

`useOneStepRun` (`web/app/components/workflow/nodes/_base/hooks/use-one-step-run.ts`) owns the request lifecycle:

- It marks the node as `Running` via `handleNodeDataUpdate({ _singleRunningStatus: Running })`.
- It calls `singleNodeRun(flowType, flowId, nodeId, postData)` which translates to `POST /console/api/apps/:app_id/workflows/draft/nodes/:node_id/run`.
- For `Iteration` and `Loop` it uses `ssePost(...)` instead, because the backend streams each child execution.
- On success or failure it updates `_singleRunningStatus` and calls `setRunResult` — which then refreshes inspect vars via `fetchNodeInspectVars`.

```296:321:web/app/components/workflow/nodes/_base/hooks/use-one-step-run.ts
  const setRunResult = useCallback(async (data: NodeRunResult | null) => {
    const isPaused = isPausedRef.current

    // The backend don't support pause the single run, so the frontend handle the pause state.
    if (isPaused)
      return

    const canRunLastRun = !isRunAfterSingleRun || runningStatus === NodeRunningStatus.Succeeded
    if (!canRunLastRun) {
      doSetRunResult(data)
      return
    }

    // run fail may also update the inspect vars when the node set the error default output.
    const vars = await fetchNodeInspectVars(flowType, flowId!, id)
    const { getNodes } = store.getState()
    const nodes = getNodes()
    appendNodeInspectVars(id, vars, nodes)
    updateNodeInspectRunningState(id, false)
    if (data?.status === NodeRunningStatus.Succeeded) {
      invalidLastRun()
      if (isStartNode || isTriggerNode)
        invalidateSysVarValues()
      invalidateConversationVarValues() // loop, iteration, variable assigner node can update the conversation variables, but to simple the logic(some nodes may also can update in the future), all nodes refresh.
    }
  }, [isRunAfterSingleRun, runningStatus, flowType, flowId, id, store, appendNodeInspectVars, updateNodeInspectRunningState, invalidLastRun, isStartNode, isTriggerNode, invalidateSysVarValues, invalidateConversationVarValues])
```

`fetchNodeInspectVars` calls `GET .../workflows/draft/nodes/:node_id/variables`. That endpoint is `NodeVariableCollectionApi.get` — the per-node sibling of the collection route documented next.

## Backend Execution

### Route: `DraftWorkflowNodeRunApi`

`api/controllers/console/app/workflow.py` exposes the single-node endpoint:

```751:796:api/controllers/console/app/workflow.py
@console_ns.route("/apps/<uuid:app_id>/workflows/draft/nodes/<string:node_id>/run")
class DraftWorkflowNodeRunApi(Resource):
    @console_ns.doc("run_draft_workflow_node")
    @console_ns.doc(description="Run draft workflow node")
    @console_ns.doc(params={"app_id": "Application ID", "node_id": "Node ID"})
    @console_ns.expect(console_ns.models[DraftWorkflowNodeRunPayload.__name__])
    @console_ns.response(200, "Node run started successfully", workflow_run_node_execution_model)
    ...
    @edit_permission_required
    def post(self, app_model: App, node_id: str):
        current_user, _ = current_account_with_tenant()
        args_model = DraftWorkflowNodeRunPayload.model_validate(console_ns.payload or {})
        args = args_model.model_dump(exclude_none=True)
        ...
        workflow_node_execution = workflow_service.run_draft_workflow_node(
            app_model=app_model,
            draft_workflow=draft_workflow,
            node_id=node_id,
            user_inputs=user_inputs,
            account=current_user,
            query=args.get("query", ""),
            files=files,
        )

        return workflow_node_execution
```

The decorators enforce: `setup_required`, `login_required`, `account_initialization_required`, `get_app_model(mode=[ADVANCED_CHAT, WORKFLOW])`, and `edit_permission_required`. The route is therefore safe to expose to console users only and always scopes the work to the requested app.

### Service: `WorkflowService.run_draft_workflow_node`

The service in `api/services/workflow_service.py`:

1. **Prefills conversation variables** so the run sees the same defaults a full workflow would.
2. **Builds the variable pool**: for start/trigger nodes it constructs the pool from `user_inputs`, `query`, and `files`. For every other node it seeds the pool with the system and environment variables only; the rest of the values are loaded lazily by `DraftVarLoader`.
3. **Runs the node**: `WorkflowEntry.single_step_run(workflow, node_id, user_inputs, user_id, variable_pool, variable_loader)` executes exactly one node in the graph engine and returns its `NodeExecution`.
4. **Saves the execution** through `DifyCoreRepositoryFactory.create_workflow_node_execution_repository(..., triggered_from=WorkflowNodeExecutionTriggeredFrom.SINGLE_STEP)`.
5. **Captures the outputs** via `DraftVariableSaver.save(process_data=..., outputs=...)` — this is where every variable produced by the node becomes inspectable.
6. **Enqueues a trace** so the run shows up in observability dashboards.

`DraftVarLoader` (also in `services/workflow_draft_variable_service.py`) implements `VariableLoader` from the graph engine. When the running node references `#previousNode.field#`, the loader resolves it against the rows stored by previous single-step runs of *this* user — making it possible to debug a single node even when its upstream nodes have not been executed in the current session, as long as they were debugged before.

## Capturing Variable Values

### Persistence Model

Captured values live in the `WorkflowDraftVariable` table. Each row is keyed by `(app_id, user_id, node_id, name)` with a typed payload (`value_type` + serialized `value`). Three logical scopes share the same table by using reserved sentinel `node_id` values:

| Scope | Reserved `node_id` | Visibility from `NodeVariableCollectionApi` |
|-------|--------------------|---------------------------------------------|
| Per-node output | The node's own ID | Yes |
| System variables (`sys.*`) | `SYSTEM_VARIABLE_NODE_ID` | No — uses `SystemVariableCollectionApi` |
| Conversation variables | `CONVERSATION_VARIABLE_NODE_ID` | No — uses `ConversationVariableCollectionApi` |

`validate_node_id` in `workflow_draft_variable.py` explicitly rejects the reserved IDs on the node route to keep the public contract narrow and let internal helpers handle the special cases.

Large values are offloaded to `WorkflowDraftVariableFile` (backed by storage) when they exceed `WORKFLOW_VARIABLE_TRUNCATION_*` thresholds. The list response then exposes a `full_content` block with `size_bytes`, `length`, and a signed `download_url` instead of inlining the value.

### Writer: `DraftVariableSaver`

After each single-step run, `WorkflowService.run_draft_workflow_node` builds a `DraftVariableSaver` with the node's metadata and calls `.save(process_data, outputs)`:

- For most node types: `_build_variables_from_mapping(outputs)` — every output key becomes a `WorkflowDraftVariable` row with `visible=True, editable=True`.
- For `Start` and trigger nodes: `_build_variables_from_start_mapping(outputs)` — names prefixed with `sys.` / `conversation.` / `env.` / `rag_pipeline.` are normalized and stored under the corresponding reserved `node_id`.
- For `VariableAssigner`: `_build_from_variable_assigner_mapping(process_data)` — only conversation variables actually mutated are saved; an extra dummy variable is added so the inspector knows the node was executed.
- Internal/technical names are filtered through `_EXCLUDE_VARIABLE_NAMES_MAPPING` (e.g. `LLM.finish_reason`, `Loop.loop_round`).
- Nested children of `Iteration` / `Loop` skip saving because the parent owns their scope (`_should_save_output_variables_for_draft`).

All rows are upserted with `_batch_upsert_draft_variable`, so re-running the same node overwrites existing values and bumps `last_edited_at = None` to signal "this is the fresh last-run value".

### Reader API: `WorkflowVariableCollectionApi` and Siblings

The console reads back values through the resources defined in `api/controllers/console/app/workflow_draft_variable.py`. The collection class anchored at `/apps/<app_id>/workflows/draft/variables` is the umbrella endpoint:

```246:294:api/controllers/console/app/workflow_draft_variable.py
@console_ns.route("/apps/<uuid:app_id>/workflows/draft/variables")
class WorkflowVariableCollectionApi(Resource):
    @console_ns.expect(console_ns.models[WorkflowDraftVariableListQuery.__name__])
    @console_ns.doc("get_workflow_variables")
    @console_ns.doc(description="Get draft workflow variables")
    @console_ns.doc(params={"app_id": "Application ID"})
    @console_ns.doc(params={"page": "Page number (1-100000)", "limit": "Number of items per page (1-100)"})
    @console_ns.response(
        200, "Workflow variables retrieved successfully", workflow_draft_variable_list_without_value_model
    )
    @_api_prerequisite
    @marshal_with(workflow_draft_variable_list_without_value_model)
    def get(self, app_model: App):
        """
        Get draft workflow
        """
        args = WorkflowDraftVariableListQuery.model_validate(request.args.to_dict(flat=True))  # type: ignore
        ...
        with sessionmaker(bind=db.engine, expire_on_commit=False).begin() as session:
            draft_var_srv = WorkflowDraftVariableService(
                session=session,
            )
            workflow_vars = draft_var_srv.list_variables_without_values(
                app_id=app_model.id,
                page=args.page,
                limit=args.limit,
                user_id=current_user.id,
            )

        return workflow_vars
```

Three properties of this collection endpoint matter for debugging:

1. **Per-user isolation**: every helper takes `user_id=current_user.id`. Two debuggers in the same workspace will not see each other's captured values, which is essential because each user maintains a private conversation.
2. **Lightweight listing**: `list_variables_without_values` defers loading the `value` column (`orm.defer(WorkflowDraftVariable.value, raiseload=True)`). The UI uses this to populate the inspector tree without paying for large payloads.
3. **Pagination contract**: `page` and `limit` are validated up front via the Pydantic `WorkflowDraftVariableListQuery`. Only the first page returns `total` (a deliberate optimization — subsequent pages skip the `COUNT(*)`).

The other resources in the same module complete the surface area:

| Route | Verb(s) | Purpose |
|-------|---------|---------|
| `/workflows/draft/variables` | `GET`, `DELETE` | List all captured variables (no values) / wipe the user's debug state. |
| `/workflows/draft/variables/<variable_id>` | `GET`, `PATCH`, `DELETE` | Retrieve a single value (used to lazy-load it after the list call), edit it, or remove it. |
| `/workflows/draft/variables/<variable_id>/reset` | `PUT` | Restore the value to the last execution's output (re-reads `WorkflowNodeExecution.outputs`). |
| `/workflows/draft/nodes/<node_id>/variables` | `GET`, `DELETE` | Per-node variant — used by `fetchNodeInspectVars` right after a single-step run. |
| `/workflows/draft/system-variables` | `GET` | `sys.*` namespace. |
| `/workflows/draft/conversation-variables` | `GET`, `POST` | Conversation variables (prefilled on first read). |
| `/workflows/draft/environment-variables` | `GET`, `POST` | Environment variables (read from the workflow definition, not the draft store). |

All resources share `_api_prerequisite`, so they require `setup_required + login_required + account_initialization_required + edit_permission_required + get_app_model(mode=[ADVANCED_CHAT, WORKFLOW])`. They also share `_ensure_variable_access`, which double-checks `variable.app_id == app_model.id and variable.user_id == current_user.id` to defeat cross-tenant ID guessing.

### Variable Serialization

The marshaller in the same file (`_serialize_var_value`) handles file URLs specially: it deep-copies the segment, regenerates signed URLs for `FileSegment` and `ArrayFileSegment` values, and serializes other segments via `_convert_values_to_json_serializable_object`. The list-without-value response includes:

```
id, type, name, description, selector, value_type, edited, visible, is_truncated
```

The detail response adds `value` (resolved via the helper above) and `full_content` (for truncated payloads). The frontend renders these in `web/app/components/workflow/variable-inspect/value-content.tsx`, with special branches for truncated content that download from `full_content.download_url`.

## End-to-End Sequence

Below is the canonical "user clicks the play button on an `LLM` node" flow. The context-menu path is identical from `handleSingleRun` onwards; only the entry differs.

```
User                Node Action Bar      BasePanel           use-last-run       use-one-step-run        Backend (Flask)            Postgres + Storage
 │ click play              │                  │                    │                    │                      │                          │
 ├────────────────────────▶│                  │                    │                    │                      │                          │
 │                         │ setPendingSingleRun({nodeId, 'run'}) │                    │                      │                          │
 │                         │ handleNodeSelect(id)                  │                    │                      │                          │
 │                         │                                       │                    │                      │                          │
 │                         │                  │ mount, see pending │                    │                      │                          │
 │                         │                  ├───────────────────▶│ handleSingleRun()  │                      │                          │
 │                         │                  │                    │ validate + check vars                     │                          │
 │                         │                  │                    │ (open BeforeRunForm if missing)           │                          │
 │                         │                  │                    ├───────────────────▶│ singleNodeRun(...)   │                          │
 │                         │                  │                    │                    ├─────────────────────▶│ POST .../nodes/:id/run   │
 │                         │                  │                    │                    │                      │ run_draft_workflow_node  │
 │                         │                  │                    │                    │                      │   single_step_run        │
 │                         │                  │                    │                    │                      │   DraftVariableSaver.save├─▶ upsert WorkflowDraftVariable
 │                         │                  │                    │                    │                      │   repository.save        ├─▶ insert WorkflowNodeExecution
 │                         │                  │                    │                    │◀─── 200 NodeRunResult │                          │
 │                         │                  │                    │ setRunResult(...)  │                      │                          │
 │                         │                  │                    │                    │ fetchNodeInspectVars │                          │
 │                         │                  │                    │                    ├─────────────────────▶│ GET .../nodes/:id/variables
 │                         │                  │                    │                    │◀──── list of vars    │ NodeVariableCollectionApi│
 │                         │                  │                    │ appendNodeInspectVars(id, vars)           │                          │
 │                         │                  │ tab=LastRun, show outputs              │                      │                          │
 │◀────── result + inspectable variables ─────┤                    │                    │                      │                          │
```

## Reading and Editing Captured Values from the UI

The Variable Inspect panel (`web/app/components/workflow/variable-inspect/panel.tsx`) groups variables into four tabs:

1. **Environment** — read directly from the workflow definition via `GET /workflows/draft/environment-variables`.
2. **Conversation** — read via `GET /workflows/draft/conversation-variables` (`useConversationVarValues`).
3. **System** — read via `GET /workflows/draft/system-variables` (`useSysVarValues`).
4. **Per-node** — populated from `nodesWithInspectVars` after each `fetchNodeInspectVars` call.

Editing flows go through the matching `PATCH /workflows/draft/variables/<variable_id>` endpoint. The handler accepts a `WorkflowDraftVariableUpdatePayload` (`name?`, `value?`); the service coerces the raw payload into a typed `Segment` (with special branches for `FILE` and `ARRAY_FILE`), then upserts via `update_variable`. `last_edited_at` is bumped, which lets the inspector show an "edited" badge until the user resets the variable.

The **Reset** button calls `PUT /workflows/draft/variables/<variable_id>/reset`. The service re-reads the latest `WorkflowNodeExecution.outputs` for the variable's node and re-derives the segment via `WorkflowDraftVariable.build_segment_with_type`. If the variable's source no longer exists, the row is deleted instead, matching the "last run never produced this key" semantics.

## State Model

Every step is mirrored in `data._singleRunningStatus` (see `NodeRunningStatus`):

| Value | Meaning |
|-------|---------|
| `NotStart` | Default; the node has never been single-run in this session. |
| `Running` | Awaiting the backend; the play button renders **Stop**. |
| `Listening` | Trigger nodes waiting for an external event. |
| `Succeeded` | Backend returned `200` with a non-error payload. |
| `Failed` | Backend returned an error or the SSE stream emitted `onError`. |
| `Stopped` | User clicked **Stop**; `handleStop` aborted the request and cleaned up. |

The pause logic lives only in the frontend (`isPausedRef`). The backend has no "pause" command — when the user closes the panel mid-run we let the request finish and ignore its result.

## Extending the Feature

When introducing a new node type that should be debuggable:

1. **Allowlist it in `canRunBySingle`** (`web/app/components/workflow/utils/workflow.ts`). Both UI entry points read from this helper.
2. **Provide a `useSingleRunFormParams` hook** in `web/app/components/workflow/nodes/<your-node>/use-single-run-form-params.ts` and register it in the table at `web/app/components/workflow/nodes/_base/components/workflow-panel/last-run/use-last-run.ts`. This is how `BeforeRunForm` discovers which inputs to render when upstream values are missing.
3. **Add a `checkValid` function** in your node's `default.ts` so `useOneStepRun.checkValidWrap` can pre-validate the node before sending the request.
4. **Handle the node in `DraftVariableSaver`** if its outputs need to land somewhere other than the per-node namespace. The default `_build_variables_from_mapping` path treats every key of `outputs` as an editable per-node variable, which is correct for most cases.

When introducing a new API consumer of captured variables:

1. **Always go through `WorkflowDraftVariableService`**. The service centralizes the `(app_id, user_id)` scoping and the truncation/offload logic.
2. **Use `_api_prerequisite`** for new console resources. It is the project-standard composition of `setup_required + login_required + account_initialization_required + edit_permission_required + get_app_model(mode=[ADVANCED_CHAT, WORKFLOW])`.
3. **Avoid exposing `value` in list endpoints**. Mirror `list_variables_without_values`: defer the column, return identifiers and metadata, let the client lazy-load the heavy payload through the detail route.

## Related References

- Frontend
  - `web/app/components/workflow/nodes/_base/components/node-control.tsx` — play/stop button on the node card.
  - `web/app/components/workflow/node-actions-menu/context-menu-content.tsx` — context-menu entry.
  - `web/app/components/workflow/node-actions-menu/use-node-actions-menu-model.ts` — `handleRun` callback.
  - `web/app/components/workflow/nodes/_base/components/workflow-panel/index.tsx` — `BasePanel` and the `pendingSingleRun` consumer.
  - `web/app/components/workflow/nodes/_base/components/workflow-panel/last-run/use-last-run.ts` — orchestration of single-run, BeforeRunForm fallback, last-run tab.
  - `web/app/components/workflow/nodes/_base/hooks/use-one-step-run.ts` — HTTP / SSE layer and inspect-var refresh.
  - `web/app/components/workflow/variable-inspect/` — the panel that consumes the variables APIs.
  - `web/service/workflow.ts` and `web/service/use-workflow.ts` — request helpers (`singleNodeRun`, `fetchNodeInspectVars`, `useConversationVarValues`, `useSysVarValues`, `useLastRun`).
- Backend
  - `api/controllers/console/app/workflow.py` — `DraftWorkflowNodeRunApi`, `DraftWorkflowNodeLastRunApi`, trigger-node siblings.
  - `api/controllers/console/app/workflow_draft_variable.py` — `WorkflowVariableCollectionApi` and all sibling resources.
  - `api/services/workflow_service.py` — `run_draft_workflow_node` and last-run lookups.
  - `api/services/workflow_draft_variable_service.py` — `DraftVarLoader`, `WorkflowDraftVariableService`, `DraftVariableSaver`.
  - `api/models/workflow.py` — `WorkflowDraftVariable`, `WorkflowDraftVariableFile`, `is_system_variable_editable`.
