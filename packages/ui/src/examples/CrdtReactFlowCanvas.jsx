import { useCallback, useEffect, memo } from 'react'
import ReactFlow, { Controls, Background, MiniMap, useReactFlow } from 'reactflow'
import { useChatflowCrdtContext, isCrdtEnabled } from '@/contexts/ChatflowCrdtContext'
import 'reactflow/dist/style.css'

/**
 * Example component showing how to integrate CRDT with React Flow
 * This is a reference implementation - adapt to your specific needs
 */
const CrdtReactFlowCanvas = memo(({ chatflowId }) => {
    const reactFlowInstance = useReactFlow()

    // Get CRDT state and operations (if enabled)
    const crdtContext = isCrdtEnabled() ? useChatflowCrdtContext() : null

    const {
        nodes = [],
        edges = [],
        viewport = { x: 0, y: 0, zoom: 1 },
        isInitialized = false,
        addNode,
        updateNode,
        removeNode,
        addEdge,
        removeEdge,
        updateViewport,
        transact
    } = crdtContext || {}

    /**
     * Sync viewport when CRDT initializes
     */
    useEffect(() => {
        if (isInitialized && viewport && reactFlowInstance) {
            reactFlowInstance.setViewport({
                x: viewport.x || 0,
                y: viewport.y || 0,
                zoom: viewport.zoom || 1
            })
        }
    }, [isInitialized, viewport, reactFlowInstance])

    /**
     * Handle node changes from React Flow
     */
    const onNodesChange = useCallback(
        (changes) => {
            if (!isCrdtEnabled() || !transact) {
                // Fall back to legacy handling
                return
            }

            // Batch all changes in a single transaction
            transact(() => {
                changes.forEach((change) => {
                    switch (change.type) {
                        case 'position':
                            if (change.dragging === false && change.position) {
                                // Only update on drag end to reduce updates
                                updateNode(change.id, {
                                    position: {
                                        x: change.position.x,
                                        y: change.position.y
                                    }
                                })
                            }
                            break

                        case 'dimensions':
                            if (change.dimensions) {
                                updateNode(change.id, {
                                    width: change.dimensions.width,
                                    height: change.dimensions.height
                                })
                            }
                            break

                        case 'remove':
                            removeNode(change.id)
                            break

                        case 'select':
                            // Don't sync selection state via CRDT
                            // Handle via presence/cursors instead
                            break

                        default:
                            console.warn('Unhandled node change type:', change.type)
                    }
                })
            })
        },
        [transact, updateNode, removeNode]
    )

    /**
     * Handle edge changes from React Flow
     */
    const onEdgesChange = useCallback(
        (changes) => {
            if (!isCrdtEnabled() || !transact) {
                return
            }

            transact(() => {
                changes.forEach((change) => {
                    switch (change.type) {
                        case 'remove':
                            removeEdge(change.id)
                            break

                        case 'select':
                            // Don't sync selection via CRDT
                            break

                        default:
                            console.warn('Unhandled edge change type:', change.type)
                    }
                })
            })
        },
        [transact, removeEdge]
    )

    /**
     * Handle new connections
     */
    const onConnect = useCallback(
        (connection) => {
            if (!isCrdtEnabled() || !addEdge) {
                return
            }

            const edgeId = `edge-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`

            addEdge({
                id: edgeId,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle,
                type: connection.type || 'default'
            })
        },
        [addEdge]
    )

    /**
     * Handle viewport changes (debounced)
     */
    const onMoveEnd = useCallback(
        (event, viewport) => {
            if (!isCrdtEnabled() || !updateViewport) {
                return
            }

            // Only update on move end to reduce update frequency
            updateViewport({
                x: viewport.x,
                y: viewport.y,
                zoom: viewport.zoom
            })
        },
        [updateViewport]
    )

    /**
     * Handle node drag stop (update final position)
     */
    const onNodeDragStop = useCallback(
        (event, node) => {
            if (!isCrdtEnabled() || !updateNode) {
                return
            }

            updateNode(node.id, {
                position: {
                    x: node.position.x,
                    y: node.position.y
                }
            })
        },
        [updateNode]
    )

    /**
     * Handle node data updates (e.g., label changes)
     */
    const handleNodeDataChange = useCallback(
        (nodeId, newData) => {
            if (!isCrdtEnabled() || !updateNode) {
                return
            }

            updateNode(nodeId, { data: newData })
        },
        [updateNode]
    )

    /**
     * Add a new node programmatically
     */
    const handleAddNode = useCallback(
        (type, position) => {
            if (!isCrdtEnabled() || !addNode) {
                return
            }

            const newNode = {
                id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: type || 'default',
                position: position || { x: 100, y: 100 },
                data: {
                    label: `New ${type} Node`,
                    createdAt: Date.now()
                }
            }

            addNode(newNode)
        },
        [addNode]
    )

    /**
     * Delete selected nodes and edges
     */
    const handleDelete = useCallback(
        (elements) => {
            if (!isCrdtEnabled() || !transact) {
                return
            }

            transact(() => {
                elements.nodes?.forEach((node) => removeNode(node.id))
                elements.edges?.forEach((edge) => removeEdge(edge.id))
            })
        },
        [transact, removeNode, removeEdge]
    )

    // Show loading state while CRDT initializes
    if (isCrdtEnabled() && !isInitialized) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    fontSize: '1.2rem',
                    color: '#666'
                }}
            >
                Initializing collaborative canvas...
            </div>
        )
    }

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onMoveEnd={onMoveEnd}
                onNodeDragStop={onNodeDragStop}
                fitView
                attributionPosition="bottom-right"
            >
                <Controls />
                <Background />
                <MiniMap />
            </ReactFlow>

            {/* Debug panel (remove in production) */}
            {process.env.NODE_ENV === 'development' && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 10,
                        left: 10,
                        padding: 10,
                        background: 'rgba(255,255,255,0.9)',
                        borderRadius: 4,
                        fontSize: '0.8rem',
                        fontFamily: 'monospace'
                    }}
                >
                    <div>CRDT: {isCrdtEnabled() ? 'Enabled' : 'Disabled'}</div>
                    <div>Initialized: {String(isInitialized)}</div>
                    <div>Nodes: {nodes.length}</div>
                    <div>Edges: {edges.length}</div>
                    <div>
                        Viewport: x={viewport.x?.toFixed(0)}, y={viewport.y?.toFixed(0)}, zoom={viewport.zoom?.toFixed(2)}
                    </div>
                </div>
            )}
        </div>
    )
})

CrdtReactFlowCanvas.displayName = 'CrdtReactFlowCanvas'

export default CrdtReactFlowCanvas

/**
 * Example usage:
 * 
 * import { WebSocketProvider } from '@/contexts/WebSocketContext'
 * import { ChatflowCrdtProvider } from '@/contexts/ChatflowCrdtContext'
 * import { ReactFlowProvider } from 'reactflow'
 * import CrdtReactFlowCanvas from './CrdtReactFlowCanvas'
 * 
 * function App() {
 *   const chatflowId = 'my-chatflow-id'
 * 
 *   return (
 *     <WebSocketProvider>
 *       <ChatflowCrdtProvider chatflowId={chatflowId}>
 *         <ReactFlowProvider>
 *           <CrdtReactFlowCanvas chatflowId={chatflowId} />
 *         </ReactFlowProvider>
 *       </ChatflowCrdtProvider>
 *     </WebSocketProvider>
 *   )
 * }
 */
