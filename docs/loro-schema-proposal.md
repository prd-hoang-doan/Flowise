# Loro CRDT Schema Proposal for Flowise Collaboration

## Document Structure

### Loro Document Layout

Each `chatflowId` will have its own `LoroDoc` with the following structure:

```typescript
// Root structure
{
  flow: LoroMap {
    nodes: LoroMap<nodeId, LoroMap<nodeProps>>,
    edges: LoroMap<edgeId, LoroMap<edgeProps>>,
    viewport: LoroMap { x, y, zoom }
  }
}
```

### Why This Structure?

1. **LoroMap for nodes/edges (keyed by ID)** instead of LoroList:
   - O(1) lookup by nodeId/edgeId
   - Natural deletion (just remove key)
   - Avoids list position conflicts
   - Matches React Flow's expectation of node/edge arrays with unique IDs

2. **Nested LoroMap for properties**:
   - Each node/edge property (position.x, position.y, data.label, etc.) can be updated independently
   - Fine-grained conflict resolution (two users can update different properties simultaneously)
   - Efficient: only changed properties generate CRDT ops

3. **Viewport as simple LoroMap**:
   - Last-write-wins for x, y, zoom is acceptable (viewport is typically controlled by one user at a time)

---

## Detailed Schema

### Node Structure (React Flow)

Typical React Flow node:
```typescript
{
  id: "node_abc123",
  type: "customNode",
  position: { x: 100, y: 200 },
  data: { label: "My Node", config: {...} },
  selected: false,
  width: 200,
  height: 100,
  // ... other React Flow properties
}
```

**Loro representation:**
```typescript
doc.getMap("flow")
   .getMap("nodes")
   .setContainer(nodeId, new LoroMap())
   .set("id", nodeId)
   .set("type", "customNode")
   .setContainer("position", new LoroMap())
     .set("x", 100)
     .set("y", 200)
   .setContainer("data", new LoroMap())
     .set("label", "My Node")
     .setContainer("config", new LoroMap()) // Nested data
   .set("selected", false)
   .set("width", 200)
   .set("height", 100)
```

### Edge Structure (React Flow)

Typical React Flow edge:
```typescript
{
  id: "edge_xyz789",
  source: "node_abc123",
  target: "node_def456",
  sourceHandle: "output-1",
  targetHandle: "input-1",
  type: "default",
  animated: false,
  // ... other properties
}
```

**Loro representation:**
```typescript
doc.getMap("flow")
   .getMap("edges")
   .setContainer(edgeId, new LoroMap())
   .set("id", edgeId)
   .set("source", "node_abc123")
   .set("target", "node_def456")
   .set("sourceHandle", "output-1")
   .set("targetHandle", "input-1")
   .set("type", "default")
   .set("animated", false)
```

### Viewport Structure

```typescript
doc.getMap("flow")
   .setContainer("viewport", new LoroMap())
   .set("x", 0)
   .set("y", 0)
   .set("zoom", 1)
```

---

## API Examples

### Server-Side: Initialize Loro Doc from DB

```typescript
import { LoroDoc } from 'loro-crdt';

class ChatFlowCrdtService {
    private docs: Map<string, LoroDoc> = new Map();

    /**
     * Load existing flowData from DB and create Loro doc
     */
    async initializeDoc(chatflowId: string, flowData: any): LoroDoc {
        const doc = new LoroDoc();
        
        // Create root structure
        const flowMap = doc.getMap("flow");
        const nodesMap = flowMap.setContainer("nodes", new LoroMap());
        const edgesMap = flowMap.setContainer("edges", new LoroMap());
        const viewportMap = flowMap.setContainer("viewport", new LoroMap());
        
        // Hydrate nodes
        for (const node of flowData.nodes || []) {
            const nodeMap = nodesMap.setContainer(node.id, new LoroMap());
            this.setNodeProperties(nodeMap, node);
        }
        
        // Hydrate edges
        for (const edge of flowData.edges || []) {
            const edgeMap = edgesMap.setContainer(edge.id, new LoroMap());
            this.setEdgeProperties(edgeMap, edge);
        }
        
        // Hydrate viewport
        viewportMap.set("x", flowData.viewport?.x || 0);
        viewportMap.set("y", flowData.viewport?.y || 0);
        viewportMap.set("zoom", flowData.viewport?.zoom || 1);
        
        this.docs.set(chatflowId, doc);
        return doc;
    }
    
    /**
     * Recursively set properties on a LoroMap (handles nested objects)
     */
    private setNodeProperties(loroMap: LoroMap, obj: any) {
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                continue;
            }
            
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Nested object -> create nested LoroMap
                const nestedMap = loroMap.setContainer(key, new LoroMap());
                this.setNodeProperties(nestedMap, value);
            } else if (Array.isArray(value)) {
                // For arrays, serialize to JSON string (or use LoroList if you need CRDT array ops)
                loroMap.set(key, JSON.stringify(value));
            } else {
                // Primitive value
                loroMap.set(key, value);
            }
        }
    }
    
    private setEdgeProperties(loroMap: LoroMap, obj: any) {
        // Similar to setNodeProperties
        this.setNodeProperties(loroMap, obj);
    }
    
    /**
     * Export Loro doc to JSON for DB persistence
     */
    exportToJSON(chatflowId: string): any {
        const doc = this.docs.get(chatflowId);
        if (!doc) return null;
        
        const flowMap = doc.getMap("flow");
        const nodesMap = flowMap.getMap("nodes");
        const edgesMap = flowMap.getMap("edges");
        const viewportMap = flowMap.getMap("viewport");
        
        // Convert LoroMap to plain objects
        const nodes = [];
        for (const [nodeId, nodeMap] of nodesMap.entries()) {
            nodes.push(this.loroMapToObject(nodeMap));
        }
        
        const edges = [];
        for (const [edgeId, edgeMap] of edgesMap.entries()) {
            edges.push(this.loroMapToObject(edgeMap));
        }
        
        const viewport = {
            x: viewportMap.get("x") || 0,
            y: viewportMap.get("y") || 0,
            zoom: viewportMap.get("zoom") || 1
        };
        
        return { nodes, edges, viewport };
    }
    
    /**
     * Recursively convert LoroMap to plain object
     */
    private loroMapToObject(loroMap: LoroMap): any {
        const obj: any = {};
        for (const [key, value] of loroMap.entries()) {
            if (value instanceof LoroMap) {
                obj[key] = this.loroMapToObject(value);
            } else if (typeof value === 'string' && this.isJSONArray(value)) {
                // Deserialize arrays
                obj[key] = JSON.parse(value);
            } else {
                obj[key] = value;
            }
        }
        return obj;
    }
    
    private isJSONArray(str: string): boolean {
        try {
            const parsed = JSON.parse(str);
            return Array.isArray(parsed);
        } catch {
            return false;
        }
    }
}
```

### Server-Side: Apply Client Update

```typescript
/**
 * Apply a CRDT update from a client
 */
async applyClientUpdate(
    chatflowId: string, 
    updateBytes: Uint8Array, 
    user: LoggedInUser
): Promise<void> {
    const doc = this.docs.get(chatflowId);
    if (!doc) {
        throw new Error(`No doc found for chatflow ${chatflowId}`);
    }
    
    // Apply the update to the doc
    doc.import(updateBytes);
    
    // Mark as dirty for periodic save
    this.markDirty(chatflowId, user);
}

/**
 * Get full snapshot for new client
 */
getFullSnapshot(chatflowId: string): Uint8Array {
    const doc = this.docs.get(chatflowId);
    if (!doc) {
        throw new Error(`No doc found for chatflow ${chatflowId}`);
    }
    
    // Export full document state
    return doc.export({ mode: 'snapshot' });
}

/**
 * Get incremental update based on client's version
 */
getDeltaUpdate(chatflowId: string, clientVersion: Uint8Array): Uint8Array {
    const doc = this.docs.get(chatflowId);
    if (!doc) {
        throw new Error(`No doc found for chatflow ${chatflowId}`);
    }
    
    // Export only the changes since client's version
    return doc.export({ mode: 'update', from: clientVersion });
}
```

### Client-Side: Local CRDT Hook

```typescript
// packages/ui/src/collaboration/useChatflowCrdt.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { LoroDoc } from 'loro-crdt';

export const useChatflowCrdt = (chatflowId, websocket) => {
    const [doc, setDoc] = useState(null);
    const [state, setState] = useState({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    const docRef = useRef(null);
    
    // Initialize doc
    useEffect(() => {
        const newDoc = new LoroDoc();
        docRef.current = newDoc;
        setDoc(newDoc);
        
        // Subscribe to local changes
        newDoc.subscribe((event) => {
            // When doc changes, update React state
            updateStateFromDoc(newDoc);
            
            // Send update to server
            const update = newDoc.export({ mode: 'update' });
            websocket.send('CRDT_UPDATE', {
                chatflowId,
                update: arrayBufferToBase64(update)
            });
        });
        
        return () => {
            newDoc.unsubscribe();
        };
    }, [chatflowId]);
    
    // Apply remote updates
    const applyRemoteUpdate = useCallback((updateBytes) => {
        if (!docRef.current) return;
        
        // Temporarily disable local change notifications to avoid echo
        docRef.current.import(updateBytes);
        updateStateFromDoc(docRef.current);
    }, []);
    
    // Initialize from server snapshot
    const initFromSnapshot = useCallback((snapshotBytes) => {
        if (!docRef.current) return;
        
        docRef.current.import(snapshotBytes);
        updateStateFromDoc(docRef.current);
    }, []);
    
    // Extract state from Loro doc
    const updateStateFromDoc = (doc) => {
        const flowMap = doc.getMap("flow");
        const nodesMap = flowMap.getMap("nodes");
        const edgesMap = flowMap.getMap("edges");
        const viewportMap = flowMap.getMap("viewport");
        
        const nodes = [];
        for (const [nodeId, nodeMap] of nodesMap.entries()) {
            nodes.push(loroMapToObject(nodeMap));
        }
        
        const edges = [];
        for (const [edgeId, edgeMap] of edgesMap.entries()) {
            edges.push(loroMapToObject(edgeMap));
        }
        
        const viewport = {
            x: viewportMap.get("x") || 0,
            y: viewportMap.get("y") || 0,
            zoom: viewportMap.get("zoom") || 1
        };
        
        setState({ nodes, edges, viewport });
    };
    
    // Local mutations (called by canvas UI)
    const addNode = useCallback((node) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const nodesMap = flowMap.getMap("nodes");
        const nodeMap = nodesMap.setContainer(node.id, new LoroMap());
        
        setLoroMapFromObject(nodeMap, node);
    }, []);
    
    const updateNode = useCallback((nodeId, updates) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const nodesMap = flowMap.getMap("nodes");
        const nodeMap = nodesMap.getMap(nodeId);
        
        if (!nodeMap) return;
        
        // Apply partial updates
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Nested update (e.g., position: { x: 100 })
                let nestedMap = nodeMap.getMap(key);
                if (!nestedMap) {
                    nestedMap = nodeMap.setContainer(key, new LoroMap());
                }
                for (const [nestedKey, nestedValue] of Object.entries(value)) {
                    nestedMap.set(nestedKey, nestedValue);
                }
            } else {
                nodeMap.set(key, value);
            }
        }
    }, []);
    
    const removeNode = useCallback((nodeId) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const nodesMap = flowMap.getMap("nodes");
        nodesMap.delete(nodeId);
    }, []);
    
    const addEdge = useCallback((edge) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const edgesMap = flowMap.getMap("edges");
        const edgeMap = edgesMap.setContainer(edge.id, new LoroMap());
        
        setLoroMapFromObject(edgeMap, edge);
    }, []);
    
    const removeEdge = useCallback((edgeId) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const edgesMap = flowMap.getMap("edges");
        edgesMap.delete(edgeId);
    }, []);
    
    const updateViewport = useCallback((viewport) => {
        if (!docRef.current) return;
        
        const flowMap = docRef.current.getMap("flow");
        const viewportMap = flowMap.getMap("viewport");
        
        if (viewport.x !== undefined) viewportMap.set("x", viewport.x);
        if (viewport.y !== undefined) viewportMap.set("y", viewport.y);
        if (viewport.zoom !== undefined) viewportMap.set("zoom", viewport.zoom);
    }, []);
    
    return {
        state,
        applyRemoteUpdate,
        initFromSnapshot,
        addNode,
        updateNode,
        removeNode,
        addEdge,
        removeEdge,
        updateViewport
    };
};

// Helper functions
function loroMapToObject(loroMap) {
    const obj = {};
    for (const [key, value] of loroMap.entries()) {
        if (value instanceof LoroMap) {
            obj[key] = loroMapToObject(value);
        } else if (typeof value === 'string' && isJSONArray(value)) {
            obj[key] = JSON.parse(value);
        } else {
            obj[key] = value;
        }
    }
    return obj;
}

function setLoroMapFromObject(loroMap, obj) {
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        
        if (typeof value === 'object' && !Array.isArray(value)) {
            const nestedMap = loroMap.setContainer(key, new LoroMap());
            setLoroMapFromObject(nestedMap, value);
        } else if (Array.isArray(value)) {
            loroMap.set(key, JSON.stringify(value));
        } else {
            loroMap.set(key, value);
        }
    }
}

function isJSONArray(str) {
    try {
        return Array.isArray(JSON.parse(str));
    } catch {
        return false;
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```

---

## WebSocket Message Payloads

### 1. CRDT_INIT (Client → Server)

Sent by client when joining a chatflow with CRDT protocol.

```typescript
{
  type: 'CRDT_INIT',
  chatflowId: string,
  sessionId: string,
  protocolVersion: 'crdt-v1',
  // Optional: client's current version vector (for incremental sync)
  stateVector?: string // base64-encoded Uint8Array
}
```

**Example:**
```json
{
  "type": "CRDT_INIT",
  "chatflowId": "chatflow_abc123",
  "sessionId": "session-1234-5678",
  "protocolVersion": "crdt-v1"
}
```

### 2. CRDT_SNAPSHOT (Server → Client)

Server sends full snapshot to newly joined client.

```typescript
{
  type: 'CRDT_SNAPSHOT',
  chatflowId: string,
  snapshot: string, // base64-encoded full Loro snapshot (Uint8Array)
  timestamp: number,
  // For debugging/logging
  meta?: {
    nodeCount: number,
    edgeCount: number,
    snapshotSize: number // bytes
  }
}
```

**Example:**
```json
{
  "type": "CRDT_SNAPSHOT",
  "chatflowId": "chatflow_abc123",
  "snapshot": "AGFzbQEAAAABioCAgAA...", 
  "timestamp": 1707584000000,
  "meta": {
    "nodeCount": 15,
    "edgeCount": 12,
    "snapshotSize": 4096
  }
}
```

### 3. CRDT_UPDATE (Bidirectional)

**Client → Server:**
Client sends local changes to server.

```typescript
{
  type: 'CRDT_UPDATE',
  chatflowId: string,
  sessionId: string,
  update: string, // base64-encoded Loro update (Uint8Array)
  timestamp: number
}
```

**Server → Clients:**
Server broadcasts updates to all other clients in the room.

```typescript
{
  type: 'ON_CRDT_UPDATE',
  payload: {
    chatflowId: string,
    update: string, // base64-encoded Loro update
    sourceSessionId: string, // who made the change (for debugging/logging)
    timestamp: number
  }
}
```

**Example (Client → Server):**
```json
{
  "type": "CRDT_UPDATE",
  "chatflowId": "chatflow_abc123",
  "sessionId": "session-1234-5678",
  "update": "AQIDBAUGBwgJ...",
  "timestamp": 1707584001000
}
```

**Example (Server → Clients):**
```json
{
  "type": "ON_CRDT_UPDATE",
  "payload": {
    "chatflowId": "chatflow_abc123",
    "update": "AQIDBAUGBwgJ...",
    "sourceSessionId": "session-1234-5678",
    "timestamp": 1707584001000
  }
}
```

### 4. CRDT_SYNC_REQUEST (Client → Server)

Client requests a sync (e.g., after being idle or detecting desync).

```typescript
{
  type: 'CRDT_SYNC_REQUEST',
  chatflowId: string,
  sessionId: string,
  stateVector?: string // Optional: client's current state for incremental sync
}
```

---

## Encoding Strategy

### Base64 Encoding (Recommended for JSON WebSocket)

**Pros:**
- Works seamlessly with JSON.stringify/parse
- No need for binary WebSocket frames
- Human-readable in network inspector (can decode to inspect)
- Compatible with existing WebSocket infrastructure

**Cons:**
- ~33% size overhead vs raw binary

**Implementation:**
```typescript
// Encode
function encodeUpdate(update: Uint8Array): string {
    return btoa(String.fromCharCode(...update));
}

// Decode
function decodeUpdate(encoded: string): Uint8Array {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
```

### Alternative: Binary WebSocket Frames

If size is critical (large diagrams, high-frequency updates), consider binary frames:
- Set `binaryType = 'arraybuffer'` on WebSocket
- Send Uint8Array directly
- Need separate message type indicator (first byte or separate metadata channel)

---

## Migration Path

### Phase 1: Dual Protocol Support

Server handles both legacy and CRDT clients:

```typescript
// In wsRouter.ts
switch (event.type) {
    case 'JOIN_CHAT_FLOW':
        if (event.protocolVersion === 'crdt-v1') {
            // CRDT path
            this.presenceService.handleJoin(socket, event);
            await this.chatFlowService.sendCrdtSnapshotToUser(socket, event);
        } else {
            // Legacy path
            this.presenceService.handleJoin(socket, event);
            this.chatFlowService.sendSnapshotToUser(socket, event);
        }
        break;
        
    case 'CRDT_UPDATE':
        await this.chatFlowService.handleCrdtUpdate(socket, event);
        break;
        
    case 'NODE_UPDATED':
    case 'EDGE_UPDATED':
        // Legacy: still supported, also apply to CRDT doc internally
        await this.chatFlowService.handleRemoteChange(socket, event);
        await this.chatFlowService.mirrorToCrdt(event); // Keep CRDT in sync
        break;
}
```

### Phase 2: Client Feature Flag

```typescript
// In frontend
const ENABLE_CRDT = import.meta.env.VITE_ENABLE_CRDT === 'true';

if (ENABLE_CRDT) {
    // Use CRDT protocol
    websocket.send('CRDT_INIT', { chatflowId, sessionId, protocolVersion: 'crdt-v1' });
} else {
    // Use legacy protocol
    websocket.send('JOIN_CHAT_FLOW', { chatflowId, sessionId, color });
}
```

---

## Performance Considerations

### Update Size Optimization

1. **Batch small updates:**
   ```typescript
   // Bad: send update for every keystroke
   onNodeDataChange((nodeId, key, value) => {
       updateNode(nodeId, { data: { [key]: value } });
       // → triggers immediate WebSocket send
   });
   
   // Good: debounce rapid changes
   const debouncedUpdate = debounce((nodeId, updates) => {
       updateNode(nodeId, updates);
   }, 100);
   ```

2. **Use Loro's transaction API:**
   ```typescript
   doc.transact(() => {
       // Multiple changes in one transaction = one update message
       updateNode(node1, { position: { x: 100 } });
       updateNode(node2, { position: { y: 200 } });
       addEdge(newEdge);
   });
   ```

### Memory Management (Server)

1. **Evict inactive docs:**
   ```typescript
   // Track last access time
   private lastAccess: Map<string, number> = new Map();
   
   // Periodic cleanup (every 5 minutes)
   setInterval(() => {
       const now = Date.now();
       const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min
       
       for (const [chatflowId, lastTime] of this.lastAccess.entries()) {
           if (now - lastTime > IDLE_TIMEOUT && this.roomManager.isRoomEmpty(chatflowId)) {
               // Save to DB then evict
               await this.saveToDB(chatflowId);
               this.docs.delete(chatflowId);
               this.lastAccess.delete(chatflowId);
           }
       }
   }, 5 * 60 * 1000);
   ```

2. **Monitor doc size:**
   ```typescript
   const snapshot = doc.export({ mode: 'snapshot' });
   if (snapshot.byteLength > 10 * 1024 * 1024) { // 10 MB
       logger.warn(`Large CRDT doc for ${chatflowId}: ${snapshot.byteLength} bytes`);
   }
   ```

---

## Testing Strategy

### Unit Tests

```typescript
describe('ChatFlowCrdtService', () => {
    it('should initialize doc from flowData', async () => {
        const flowData = {
            nodes: [{ id: 'n1', type: 'default', position: { x: 0, y: 0 } }],
            edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
            viewport: { x: 0, y: 0, zoom: 1 }
        };
        
        const doc = await crdtService.initializeDoc('cf1', flowData);
        const exported = crdtService.exportToJSON('cf1');
        
        expect(exported.nodes).toHaveLength(1);
        expect(exported.nodes[0].id).toBe('n1');
    });
    
    it('should converge on concurrent updates', async () => {
        // Simulate two clients editing same node
        const doc1 = new LoroDoc();
        const doc2 = new LoroDoc();
        
        // Both start with same state
        const init = createInitialDoc();
        doc1.import(init);
        doc2.import(init);
        
        // Client 1: update position.x
        doc1.getMap('flow').getMap('nodes').getMap('n1').getMap('position').set('x', 100);
        
        // Client 2: update position.y
        doc2.getMap('flow').getMap('nodes').getMap('n1').getMap('position').set('y', 200);
        
        // Exchange updates
        const update1 = doc1.export({ mode: 'update' });
        const update2 = doc2.export({ mode: 'update' });
        
        doc1.import(update2);
        doc2.import(update1);
        
        // Should converge
        const state1 = exportNode(doc1, 'n1');
        const state2 = exportNode(doc2, 'n1');
        
        expect(state1).toEqual(state2);
        expect(state1.position).toEqual({ x: 100, y: 200 });
    });
});
```

### Integration Tests

```typescript
describe('CRDT WebSocket Integration', () => {
    it('should sync state across clients', async () => {
        // Create two WebSocket clients
        const client1 = await createTestClient('user1');
        const client2 = await createTestClient('user2');
        
        // Both join same chatflow
        await client1.send({ type: 'CRDT_INIT', chatflowId: 'cf1', protocolVersion: 'crdt-v1' });
        await client2.send({ type: 'CRDT_INIT', chatflowId: 'cf1', protocolVersion: 'crdt-v1' });
        
        // Client 1 adds a node
        const addNodeUpdate = createAddNodeUpdate('n1', { x: 100, y: 200 });
        await client1.send({ type: 'CRDT_UPDATE', chatflowId: 'cf1', update: addNodeUpdate });
        
        // Client 2 should receive the update
        const receivedMessage = await client2.waitForMessage('ON_CRDT_UPDATE');
        
        expect(receivedMessage.payload.update).toBeDefined();
        
        // Apply update and verify state
        client2Doc.import(base64ToUint8Array(receivedMessage.payload.update));
        const nodes = exportNodes(client2Doc);
        
        expect(nodes).toHaveLength(1);
        expect(nodes[0].id).toBe('n1');
    });
});
```

---

## Summary

This schema provides:

✅ **Fine-grained conflict resolution** - individual properties can be updated independently
✅ **Efficient updates** - only changed data is transmitted
✅ **Type safety** - can add TypeScript interfaces for Loro structure
✅ **Backward compatibility** - coexists with legacy protocol during migration
✅ **Scalability** - O(1) node/edge lookup, efficient memory usage
✅ **React Flow compatibility** - maps naturally to React Flow's node/edge structure

The base64 encoding strategy balances compatibility with performance, and the proposed message formats integrate cleanly with your existing WebSocket infrastructure.
