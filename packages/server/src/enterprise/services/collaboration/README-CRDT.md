# CRDT Implementation for Flowise Collaboration

## Overview

This implementation uses **Loro CRDT** to provide conflict-free collaborative editing for chatflow diagrams. The CRDT (Conflict-free Replicated Data Type) ensures that multiple users can edit the same chatflow simultaneously without conflicts.

## Backend Architecture

### Key Components

1. **ChatFlowCrdtService** (`chat-flow-crdt.service.ts`)
   - Manages Loro documents for each chatflow
   - Handles initialization from database
   - Applies client updates
   - Exports snapshots for new clients
   - Periodic persistence to database
   - Memory management (eviction of idle docs)

2. **CRDT Event Types** (`Interface.Event.ts`)
   - `CRDT_INIT`: Client requests CRDT session
   - `CRDT_UPDATE`: Bidirectional update messages
   - `CRDT_SNAPSHOT`: Server sends full state
   - `CRDT_SYNC_REQUEST`: Client requests resync

3. **Integration Points**
   - `ChatFlowCollaborationService`: Orchestrates CRDT and legacy modes
   - `WSRouter`: Routes CRDT events to handlers
   - `validation.ts`: Validates CRDT payloads

### Document Structure

Each chatflow's Loro document has this structure:

```typescript
{
  flow: LoroMap {
    nodes: LoroMap<nodeId, LoroMap<nodeProps>>,
    edges: LoroMap<edgeId, LoroMap<edgeProps>>,
    viewport: LoroMap { x, y, zoom }
  }
}
```

### Feature Flag

CRDT mode can be controlled via environment variable:

```bash
# Enable CRDT (default)
ENABLE_CRDT=true

# Disable CRDT (use legacy mode)
ENABLE_CRDT=false
```

## Protocol Flow

### 1. Client Joins Chatflow (CRDT Mode)

```
Client → Server: CRDT_INIT
  {
    type: 'CRDT_INIT',
    chatflowId: 'abc123',
    sessionId: 'session-xyz',
    protocolVersion: 'crdt-v1'
  }

Server → Client: CRDT_SNAPSHOT
  {
    type: 'CRDT_SNAPSHOT',
    chatflowId: 'abc123',
    snapshot: 'base64-encoded-loro-snapshot',
    timestamp: 1707584000000,
    meta: { nodeCount: 15, edgeCount: 12, snapshotSize: 4096 }
  }
```

### 2. Client Makes Changes

```
Client → Server: CRDT_UPDATE
  {
    type: 'CRDT_UPDATE',
    chatflowId: 'abc123',
    sessionId: 'session-xyz',
    update: 'base64-encoded-loro-update',
    timestamp: 1707584001000
  }

Server → Other Clients: ON_CRDT_UPDATE
  {
    type: 'ON_CRDT_UPDATE',
    payload: {
      chatflowId: 'abc123',
      update: 'base64-encoded-loro-update',
      sourceSessionId: 'session-xyz',
      timestamp: 1707584001000
    }
  }
```

### 3. Client Requests Resync

```
Client → Server: CRDT_SYNC_REQUEST
  {
    type: 'CRDT_SYNC_REQUEST',
    chatflowId: 'abc123',
    sessionId: 'session-xyz'
  }

Server → Client: CRDT_SNAPSHOT (same as init)
```

## Backward Compatibility

The implementation supports **dual protocol mode**:

- **Legacy clients**: Use `JOIN_CHAT_FLOW` → receive `ON_SNAPSHOT_SYNC` + `NODE_UPDATED`/`EDGE_UPDATED` events
- **CRDT clients**: Use `CRDT_INIT` → receive `CRDT_SNAPSHOT` + `ON_CRDT_UPDATE` events

Both modes can coexist on the same server.

## Memory Management

### Automatic Cleanup

- **Periodic save**: Dirty docs saved every 5 seconds
- **Idle eviction**: Docs inactive for 30 minutes are evicted after saving
- **Size monitoring**: Warnings logged for docs > 10MB

### Manual Control

```typescript
// Get stats
const stats = chatFlowService.getCrdtStats()
// { enabled: true, activeDocuments: 5, dirtyDocuments: 2, savingDocuments: 0 }

// Force remove doc
await crdtService.removeDoc(chatflowId)
```

## Performance Considerations

### Update Encoding

- Base64 encoding adds ~33% overhead
- Acceptable for JSON WebSocket transport
- Alternative: binary WebSocket frames (future optimization)

### Conflict Resolution

- Fine-grained per-property resolution
- Last-write-wins for same property
- Different properties merge automatically

### Scalability

- O(1) node/edge lookup by ID
- Efficient incremental updates
- Memory usage scales with active chatflows

## Error Handling

### Validation

- Base64 format validation
- Size limits (max 5MB per update)
- Protocol version check
- Session/chatflow ID validation

### Error Messages

```typescript
// CRDT disabled
{ type: 'CRDT_ERROR', message: 'CRDT protocol is not enabled on this server' }

// Invalid update
{ type: 'CRDT_ERROR', message: 'Failed to apply update' }

// Invalid protocol version
{ type: 'validation-error', message: 'Invalid or unsupported protocol version' }
```

## Monitoring

### Logs

- `✅ [CRDT]: Initialized doc for chatflow {id}`
- `📝 [CRDT]: Applied update from session {id}`
- `📤 [CRDT]: Sent snapshot to client`
- `⚠️ [CRDT]: Large doc for {id}: {size} MB`
- `🗑️ [CRDT]: Removed doc for chatflow {id}`
- `💾 [CRDT]: Saving {count} dirty docs`
- `🧹 [CRDT]: Cleaning up {count} idle docs`

### Stats API

```typescript
// In ChatFlowCollaborationService
getCrdtStats() {
  return {
    enabled: true,
    activeDocuments: 5,      // Total docs in memory
    dirtyDocuments: 2,       // Docs pending save
    savingDocuments: 0       // Docs currently being saved
  }
}
```

## Testing

### Unit Tests (Recommended)

```typescript
describe('ChatFlowCrdtService', () => {
  it('should initialize doc from flowData')
  it('should apply client updates')
  it('should export to JSON for persistence')
  it('should handle concurrent updates correctly')
  it('should evict idle documents')
})
```

### Integration Tests (Recommended)

```typescript
describe('CRDT WebSocket Integration', () => {
  it('should sync state across multiple clients')
  it('should handle client disconnection gracefully')
  it('should persist changes to database')
  it('should resync on request')
})
```

## Next Steps (Frontend)

1. Add `loro-crdt` to UI package
2. Create `useChatflowCrdt` hook
3. Integrate with WebSocketService
4. Connect to React Flow canvas
5. Add feature flag toggle

See `docs/loro-schema-proposal.md` for detailed frontend implementation guide.

## References

- [Loro CRDT Documentation](https://loro.dev)
- [CRDT Schema Proposal](../docs/loro-schema-proposal.md)
- [Migration Plan](../docs/crdt.md)
