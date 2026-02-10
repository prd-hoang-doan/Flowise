# CRDT Frontend Implementation

## Overview

This document describes the frontend implementation of CRDT (Conflict-free Replicated Data Type) for collaborative editing in Flowise. The implementation uses the `loro-crdt` library to provide real-time, conflict-free synchronization of canvas state across multiple users.

## Architecture

### Components

1. **useChatflowCrdt Hook** (`/hooks/useChatflowCrdt.js`)
   - Core CRDT document management
   - Local state extraction from Loro document
   - Operations for nodes, edges, and viewport
   - Remote update handling
   - Snapshot initialization

2. **ChatflowCrdtContext** (`/contexts/ChatflowCrdtContext.jsx`)
   - React context for CRDT state
   - WebSocket integration
   - Automatic sync management
   - Event handling (CRDT_SNAPSHOT, ON_CRDT_UPDATE)

3. **CRDT Utilities** (`/utils/crdtUtils.js`)
   - Base64 encoding/decoding for binary updates
   - LoroMap to/from JavaScript object conversion
   - Validation helpers

### Data Flow

```
User Action → React Component → CRDT Context
                                      ↓
                              useChatflowCrdt Hook
                                      ↓
                              LoroDoc.transact()
                                      ↓
                              Subscribe callback
                                      ↓
                              WebSocket send(CRDT_UPDATE)
                                      ↓
                                   Server
                                      ↓
                              Broadcast to peers
                                      ↓
                        WebSocket receive(ON_CRDT_UPDATE)
                                      ↓
                              CRDT Context handler
                                      ↓
                        useChatflowCrdt.applyRemoteUpdate()
                                      ↓
                              Update React state
                                      ↓
                            Re-render components
```

## WebSocket Protocol

### Events Sent by Client

1. **CRDT_INIT** - Join chatflow with CRDT protocol
```javascript
{
  type: 'CRDT_INIT',
  chatflowId: string,
  userId: string,
  timestamp: number,
  protocolVersion: 'crdt-1.0'
}
```

2. **CRDT_UPDATE** - Send local changes
```javascript
{
  type: 'CRDT_UPDATE',
  chatflowId: string,
  update: string,        // Base64-encoded Loro update
  clientId: string,
  timestamp: number
}
```

3. **CRDT_SYNC_REQUEST** - Request full sync
```javascript
{
  type: 'CRDT_SYNC_REQUEST',
  chatflowId: string,
  clientId: string,
  timestamp: number
}
```

### Events Received from Server

1. **CRDT_SNAPSHOT** - Initial state (response to CRDT_INIT)
```javascript
{
  type: 'CRDT_SNAPSHOT',
  chatflowId: string,
  snapshot: string,      // Base64-encoded Loro snapshot
  timestamp: number
}
```

2. **ON_CRDT_UPDATE** - Remote changes
```javascript
{
  type: 'ON_CRDT_UPDATE',
  chatflowId: string,
  update: string,        // Base64-encoded Loro update
  clientId: string,
  timestamp: number
}
```

## Document Structure

The CRDT document uses a LoroMap with three top-level keys:

```javascript
{
  nodes: LoroMap<nodeId, LoroMap<property, value>>,
  edges: LoroMap<edgeId, LoroMap<property, value>>,
  viewport: LoroMap<key, value>
}
```

### Nodes
Each node is stored as a nested LoroMap:
```javascript
{
  id: string,
  type: string,
  position: { x: number, y: number },
  data: { label: string, ... },
  // ... other React Flow node properties
}
```

### Edges
Each edge is stored as a nested LoroMap:
```javascript
{
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  type: string,
  // ... other React Flow edge properties
}
```

### Viewport
Stores the current canvas viewport:
```javascript
{
  x: number,
  y: number,
  zoom: number
}
```

## Usage

### 1. Wrap Canvas with ChatflowCrdtProvider

```jsx
import { ChatflowCrdtProvider } from '@/contexts/ChatflowCrdtContext'

function Canvas({ chatflowId }) {
  return (
    <ChatflowCrdtProvider chatflowId={chatflowId} protocolVersion="crdt-1.0">
      <ReactFlowCanvas />
    </ChatflowCrdtProvider>
  )
}
```

### 2. Use CRDT State in Components

```jsx
import { useChatflowCrdtContext } from '@/contexts/ChatflowCrdtContext'

function ReactFlowCanvas() {
  const {
    nodes,
    edges,
    viewport,
    isInitialized,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    removeEdge,
    updateViewport,
    transact
  } = useChatflowCrdtContext()

  const handleAddNode = (nodeData) => {
    addNode({
      id: `node-${Date.now()}`,
      type: 'custom',
      position: { x: 100, y: 100 },
      data: nodeData
    })
  }

  const handleNodesChange = (changes) => {
    // Use transact for batch updates
    transact(() => {
      changes.forEach(change => {
        if (change.type === 'position') {
          updateNode(change.id, { 
            position: { x: change.position.x, y: change.position.y }
          })
        } else if (change.type === 'remove') {
          removeNode(change.id)
        }
      })
    })
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onMove={({ x, y, zoom }) => updateViewport({ x, y, zoom })}
    />
  )
}
```

### 3. Feature Flag

CRDT can be enabled/disabled via environment variable:

```bash
# .env
VITE_ENABLE_CRDT=true  # Enable CRDT protocol (default)
# or
VITE_ENABLE_CRDT=false # Use legacy protocol
```

Check programmatically:
```javascript
import { isCrdtEnabled } from '@/contexts/ChatflowCrdtContext'

if (isCrdtEnabled()) {
  // Use CRDT protocol
} else {
  // Use legacy protocol
}
```

## Key Features

### 1. Automatic Sync
- Initial snapshot loaded on join
- Real-time updates broadcast to all clients
- Automatic reconnection with sync request

### 2. Conflict Resolution
- Last-write-wins for simple values
- Automatic merging for concurrent edits
- No merge conflicts - all operations commute

### 3. Offline Support
- Local changes queue while offline
- Automatic flush when reconnected
- No data loss on network interruption

### 4. Echo Prevention
- Updates from local client are not re-applied
- Prevents infinite update loops
- Uses `isApplyingRemoteUpdate` flag

### 5. Transaction Support
- Batch multiple operations
- Single update sent to server
- Improves performance and reduces network traffic

```javascript
transact(() => {
  addNode(node1)
  addNode(node2)
  addEdge(edge1)
  updateViewport(viewport)
})
// Only one CRDT_UPDATE sent
```

## Error Handling

### Update Application Failure
If a remote update fails to apply:
1. Error is logged to console
2. Full sync is requested from server
3. User is notified (optional)

### Connection Loss
1. Pending updates are queued
2. On reconnect, queued updates are sent
3. Sync request ensures consistency

### Invalid Data
- Updates are validated before application
- Invalid updates are rejected
- Sync request can recover from bad state

## Performance Considerations

### Memory Management
- CRDT documents grow over time
- Consider periodic snapshots to compact history
- Monitor document size (warn at 10MB)

### Update Frequency
- Debounce high-frequency updates (e.g., viewport)
- Use transactions for batch operations
- Avoid sending updates during rapid changes

### Network Usage
- Binary updates are Base64-encoded (33% overhead)
- Consider compression for large updates
- Batch operations reduce message count

## Testing

### Unit Tests
```javascript
// Test CRDT operations
describe('useChatflowCrdt', () => {
  it('should add node', () => {
    const { result } = renderHook(() => useChatflowCrdt('test-flow'))
    act(() => {
      result.current.addNode({ id: 'node-1', data: {} })
    })
    expect(result.current.nodes).toHaveLength(1)
  })
})
```

### Integration Tests
```javascript
// Test two clients syncing
it('should sync between two clients', async () => {
  const client1 = createClient('flow-1')
  const client2 = createClient('flow-1')
  
  client1.addNode({ id: 'node-1' })
  await waitFor(() => {
    expect(client2.nodes).toContainEqual(expect.objectContaining({ id: 'node-1' }))
  })
})
```

## Migration from Legacy Protocol

### Dual Protocol Support
The system supports both legacy and CRDT protocols:
- Backend handles both `JOIN_CHAT_FLOW` and `CRDT_INIT`
- Frontend can switch via feature flag
- Gradual migration without disruption

### Migration Steps
1. Enable CRDT in staging environment
2. Test with beta users
3. Monitor for issues
4. Enable globally via feature flag
5. Deprecate legacy protocol after stable period

## Troubleshooting

### Updates Not Syncing
1. Check WebSocket connection status
2. Verify CRDT is enabled (`VITE_ENABLE_CRDT=true`)
3. Check browser console for errors
4. Request manual sync

### State Divergence
1. Request sync from server
2. Check for console errors during update application
3. Verify clientId uniqueness
4. Clear local storage and reload

### Performance Issues
1. Check document size (should be < 10MB)
2. Reduce update frequency (debounce)
3. Use transactions for batches
4. Consider periodic snapshots

## References

- [Loro CRDT Documentation](https://loro.dev/)
- [Backend CRDT Implementation](../../server/src/enterprise/services/collaboration/README-CRDT.md)
- [CRDT Schema Proposal](../../server/loro-schema-proposal.md)
- [Migration Plan](../../server/crdt.md)
