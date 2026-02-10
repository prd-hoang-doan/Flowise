# Phase 0 – Clarify scope and data model

## 1. Confirm CRDT scope

Decide: CRDT covers only the canvas state (nodes, edges, viewport), not presence/cursors (presence can stay as ephemeral WS state for now).
Decide if Loro runs:
Server‑authoritative (recommended initially): one Loro doc per chatflowId on the server; clients send ops and receive ops/snapshots.
Or fully peer‑to‑peer (harder with your existing server‑centric model).
## 2. Define CRDT structure for a chatflow

Map current snapshot shape in chat-flow-collaboration.service.ts:
nodes: Record<string, any>[]
edges: Record<string, any>[]
viewport: { x, y, zoom }
Decide on a Loro layout, e.g. (conceptually):
```text
doc.getMap('flow').set('nodes', CRDT-list or map keyed by node.id)
doc.getMap('flow').set('edges', CRDT-list or map keyed by edge.id)
doc.getMap('flow').set('viewport', CRDT-map)
```
Define a single “canonical JSON” shape derived from Loro for saving to DB (can initially match existing flowData JSON).

# Phase 1 – Backend foundation (Loro documents per chatflow)

## 3. Add Loro dependency to server package

In package.json add loro-crdt.
Wire it in via pnpm and ensure Node version is compatible with Loro’s JS package.
## 4. Create a ChatFlowCrdtService (or evolve ChatFlowStateService)

In chat-flow-collaboration.service.ts:
Introduce a new class responsible for:
Creating a LoroDoc per chatflowId.
Loading from DB (ChatFlow.flowData) and initializing the doc from JSON.
Serializing doc → JSON for persistence.
Keep the old ChatFlowStateService temporarily for fallback / comparison.
## 5. In‑memory doc management

Maintain Map<string, LoroDoc> similar to current snapshots: Map<string, ChatFlowSnapshot>.
On getLatestSnapshot(chatflowId):
If doc exists: return JSON view from Loro.
If not: load from DB, create Loro doc, hydrate it from existing flowData, store in map, and return JSON view.
## 6. Wire persistence to Loro

Reuse the existing periodic save in startPeriodicSave:
Instead of using ChatFlowSnapshot.nodes/edges, derive them from LoroDoc (doc.toJSON() or equivalent).
Persist back to chatflowsService.updateChatflow the same way as now.
This keeps external persistence behavior stable while internal state is now CRDT‑driven.

# Phase 2 – CRDT operations and WS protocol (server side)

## 7. Define CRDT WS message types

Extend your event types in Interface.Event.ts (if present) to include:
CRDT_INIT / CRDT_SYNC: full CRDT snapshot or state vector + diff.
CRDT_UPDATE: Loro update payload from client → server, and server → clients.
Keep current events (NODE_UPDATED, EDGE_UPDATED, REQUEST_SNAPSHOT_SYNC) for backward compatibility during migration.
## 8. Implement CRDT application on server

In ChatFlowCrdtService:
Expose methods like:
applyClientUpdate(chatflowId, updateBytes, user) – apply Loro patch to doc.
getDocSnapshot(chatflowId) – full JSON snapshot.
getSyncPayload(chatflowId, clientStateVector?) – minimal delta based on client’s state if you use state‑vector style sync.
Integrate these into ChatFlowCollaborationService:
Add new handlers: handleCrdtUpdate, sendCrdtSnapshotToUser, broadcastCrdtUpdate.
## 9. Extend WS router to support CRDT events

In wsRouter.ts:
Add new cases to switch (event.type):
JOIN_CHAT_FLOW (augmented with protocolVersion flag, see Phase 4).
CRDT_REQUEST_SNAPSHOT / CRDT_UPDATE.
For JOIN_CHAT_FLOW with a CRDT‑aware client:
After auth + presence, call chatFlowService.sendCrdtSnapshotToUser.
For CRDT_UPDATE:
Call chatFlowService.handleCrdtUpdate, which:
Applies update into Loro doc.
Broadcasts the same update to other clients in the room using WSRoomManager.broadcast.
## 10. Keep presence & auth unchanged

Leave presence.service.ts and auth services untouched initially; they’re orthogonal to document conflict resolution.
Presence events (JOIN_CHAT_FLOW, LEAVE_CHAT_FLOW, USER_HEARTBEAT, CURSOR_MOVED, NODE_PRESENCE_UPDATED) keep working as-is.

# Phase 3 – Frontend CRDT integration (UI side)

## 11. Add Loro to UI package

In package.json add loro-crdt.
Ensure bundler (Vite/Craco) handles it (should be straightforward).
## 12. Create a local CRDT store hook or service

Under src, add something like collaboration/useChatflowCrdt.js:
Manages a LoroDoc per chatflowId.
Provides:
applyRemoteUpdate(updateBytes) – apply server‑sent CRDT updates.
Methods to perform local edits (add/update/remove node/edge, change viewport) by mutating the Loro doc.
Derived state: { nodes, edges, viewport } that the canvas (React Flow) consumes.
## 13. Connect CRDT to WebSocketService

Extend WebSocketService.js:
Keep existing generic send(type, payload) and event emitter.
Add helpers or conventions for CRDT:
send('CRDT_UPDATE', { chatflowId, docId, update: <binary/base64> }).
Listen for CRDT_INIT / CRDT_UPDATE messages in onmessage and emit higher‑level events ('crdt-init', 'crdt-update') via emit.
Ensure binary/encoding is decided (JSON‑stringified Uint8Array, base64, etc.) and consistent.
## 14. Wire WebSocketContext to CRDT

In WebSocketContext.jsx:
Subscribe to CRDT events:
On 'message', route CRDT message types to your useChatflowCrdt hook (or a context dedicated to collaboration).
Keep the generic lastMessage as-is for now but add typed handling where necessary.
## 15. Integrate CRDT state with the canvas

In the components where canvas state is stored (likely a canvas/flow editor container and CanvasPresenceContext.jsx):
Replace direct local mutations (that currently emit NODE_UPDATED, EDGE_UPDATED) with:
Mutate the LoroDoc locally (CRDT operation).
Send the resulting Loro update through WebSocket.
Subscribe to CRDT state from your hook (the derived JSON view) instead of applying remote ON_REMOTE_CHANGE diffs.

# Phase 4 – Protocol coexistence & gradual switch

## 16. Introduce protocol versioning

When joining a chatflow (JOIN_CHAT_FLOW event from client → server), include:
protocolVersion: 'crdt-v1' (or similar).
In wsRouter.ts:
After validating the event, branch:
If protocolVersion === 'crdt-v1':
Use CRDT handshake (sendCrdtSnapshotToUser).
Else:
Use existing snapshot + LWW events (sendSnapshotToUser and NODE_UPDATED/EDGE_UPDATED).
## 17. Dual‑write or dual‑path during migration (optional but safer)

For a migration phase:
When a legacy NODE_UPDATED/EDGE_UPDATED arrives:
Also map it into CRDT ops on the server doc (so CRDT doc stays in sync even with old clients).
When CRDT updates arrive:
Optionally, still generate ON_REMOTE_CHANGE messages until all clients are upgraded.
This allows you to flip clients gradually without breaking existing flows.
## 18. Feature flagging

Add a server‑side feature flag (e.g., env var) controlling:
Whether CRDT is enabled at all.
Whether CRDT clients are accepted, or forced back to legacy.
Add a frontend config (from API or env) to decide whether UI should use CRDT mode.

# Phase 5 – Testing and validation

Unit and integration tests (server)

Add tests for:
Loro doc initialization from existing flowData.
Applying a sequence of mixed “conflicting” updates (e.g., two users updating same node fields) and verifying CRDT convergence is as desired.
Periodic save still persists valid JSON and loads correctly on restart.
Client‑side behavior tests

Test multiple tabs/browsers:
Simultaneous edits on the same node/edge.
Network interruptions → reconnection via WebSocketService → verify CRDT resyncs correctly.
Confirm presence (status, cursors, node presence) still works as before (unchanged protocol).
Performance and memory

Stress test:
Many nodes/edges and long edit sessions.
Memory usage of server Map<chatflowId, LoroDoc> (consider eviction strategies for idle flows).
Tune:
Snapshot interval.
Whether to store full CRDT state vs just JSON in DB (you can start with JSON only and later decide if you want CRDT‑aware persistence).
Rollout

Enable CRDT only for internal/staging environment with feature flag.
Migrate a small number of teams/workspaces by enabling protocolVersion: 'crdt-v1' for them.
Once stable, deprecate legacy path:
Remove last‑write‑wins timestamp logic in ChatFlowStateService.
Remove legacy NODE_UPDATED/EDGE_UPDATED handling if no longer needed (or keep as synthetic layer over CRDT if you still like that API shape).
If you’d like, next step I can:

Propose a concrete Loro document schema (API‑level, e.g., which Loro types to use) and message payload shapes for CRDT_INIT / CRDT_UPDATE, tailored to how your React Flow canvas currently stores state.