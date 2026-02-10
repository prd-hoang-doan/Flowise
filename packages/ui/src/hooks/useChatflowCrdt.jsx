import { useEffect, useState, useCallback, useRef } from 'react'
import { LoroDoc, LoroMap } from 'loro-crdt'
import { arrayBufferToBase64, base64ToArrayBuffer, loroMapToObject, setLoroMapFromObject } from '@/utils/crdtUtils'

/**
 * Hook for managing a Loro CRDT document for collaborative chatflow editing
 * @param {string} chatflowId - The chatflow ID
 * @param {object} websocket - WebSocket service instance
 * @param {boolean} enabled - Whether CRDT mode is enabled
 * @returns {object} CRDT state and operations
 */
export const useChatflowCrdt = (chatflowId, websocket, enabled = true) => {
    const [state, setState] = useState({
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
    })
    const [isInitialized, setIsInitialized] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const docRef = useRef(null)
    const pendingUpdatesRef = useRef([])
    const isApplyingRemoteUpdate = useRef(false)

    /**
     * Initialize Loro document
     */
    useEffect(() => {
        if (!enabled || !chatflowId) return
        console.log(`[CRDT Hook]: Initializing CRDT for chatflow ${chatflowId}`)
        const doc = new LoroDoc()
        docRef.current = doc

        // Initialize doc structure
        const flowMap = doc.getMap('flow')
        flowMap.setContainer('nodes', new LoroMap())
        flowMap.setContainer('edges', new LoroMap())
        flowMap.setContainer('viewport', new LoroMap())

        // Subscribe to local changes
        const unsubscribe = doc.subscribe((event) => {
            // Skip if we're applying a remote update to avoid echo
            if (isApplyingRemoteUpdate.current) return

            try {
                // Update React state from doc
                updateStateFromDoc(doc)

                // Export update and send to server
                const update = doc.export({ mode: 'update' })
                const base64Update = arrayBufferToBase64(update)

                if (websocket && websocket.isConnected()) {
                    websocket.send('CRDT_UPDATE', {
                        chatflowId,
                        update: base64Update,
                        timestamp: Date.now()
                    })
                } else {
                    // Queue updates if not connected
                    pendingUpdatesRef.current.push(base64Update)
                }
            } catch (error) {
                console.error('❌ [CRDT Hook]: Error handling local change:', error)
            }
        })

        return () => {
            if (unsubscribe) unsubscribe()
        }
    }, [chatflowId, enabled, websocket])

    /**
     * Extract state from Loro doc and update React state
     */
    const updateStateFromDoc = useCallback((doc) => {
        try {
            const flowMap = doc.getMap('flow')
            const nodesMap = flowMap.get('nodes')
            const edgesMap = flowMap.get('edges')
            const viewportMap = flowMap.get('viewport')

            const nodes = []
            if (nodesMap) {
                for (const [nodeId, nodeMap] of nodesMap.entries()) {
                    if (nodeMap && typeof nodeMap.entries === 'function') {
                        nodes.push(loroMapToObject(nodeMap))
                    }
                }
            }

            const edges = []
            if (edgesMap) {
                for (const [edgeId, edgeMap] of edgesMap.entries()) {
                    if (edgeMap && typeof edgeMap.entries === 'function') {
                        edges.push(loroMapToObject(edgeMap))
                    }
                }
            }

            const viewport = {
                x: viewportMap?.get('x') ?? 0,
                y: viewportMap?.get('y') ?? 0,
                zoom: viewportMap?.get('zoom') ?? 1
            }

            setState({ nodes, edges, viewport })
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error updating state from doc:', error)
        }
    }, [])

    /**
     * Initialize from server snapshot
     */
    const initFromSnapshot = useCallback(
        (snapshotBase64) => {
            if (!docRef.current || !snapshotBase64) return

            try {
                setIsSyncing(true)
                isApplyingRemoteUpdate.current = true

                const snapshotBytes = base64ToArrayBuffer(snapshotBase64)
                docRef.current.import(snapshotBytes)

                updateStateFromDoc(docRef.current)
                setIsInitialized(true)

                console.log('✅ [CRDT Hook]: Initialized from snapshot')
            } catch (error) {
                console.error('❌ [CRDT Hook]: Error initializing from snapshot:', error)
            } finally {
                isApplyingRemoteUpdate.current = false
                setIsSyncing(false)
            }
        },
        [updateStateFromDoc]
    )

    /**
     * Apply remote update from server
     */
    const applyRemoteUpdate = useCallback(
        (updateBase64) => {
            if (!docRef.current || !updateBase64) return

            try {
                isApplyingRemoteUpdate.current = true

                const updateBytes = base64ToArrayBuffer(updateBase64)
                docRef.current.import(updateBytes)

                updateStateFromDoc(docRef.current)
            } catch (error) {
                console.error('❌ [CRDT Hook]: Error applying remote update:', error)
            } finally {
                isApplyingRemoteUpdate.current = false
            }
        },
        [updateStateFromDoc]
    )

    /**
     * Request resync from server
     */
    const requestSync = useCallback(() => {
        if (websocket && websocket.isConnected()) {
            setIsSyncing(true)
            websocket.send('CRDT_SYNC_REQUEST', {
                chatflowId
            })
        }
    }, [chatflowId, websocket])

    /**
     * Send any pending updates
     */
    const sendPendingUpdates = useCallback(() => {
        if (!websocket || !websocket.isConnected()) return

        while (pendingUpdatesRef.current.length > 0) {
            const update = pendingUpdatesRef.current.shift()
            websocket.send('CRDT_UPDATE', {
                chatflowId,
                update,
                timestamp: Date.now()
            })
        }
    }, [chatflowId, websocket])

    // ==================== Local Mutation Methods ====================

    /**
     * Add a node to the CRDT doc
     */
    const addNode = useCallback((node) => {
        if (!docRef.current || !node || !node.id) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const nodesMap = flowMap.get('nodes')
            const nodeMap = nodesMap.setContainer(node.id, new LoroMap())

            setLoroMapFromObject(nodeMap, node)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error adding node:', error)
        }
    }, [])

    /**
     * Update a node in the CRDT doc
     */
    const updateNode = useCallback((nodeId, updates) => {
        if (!docRef.current || !nodeId || !updates) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const nodesMap = flowMap.get('nodes')
            const nodeMap = nodesMap.get(nodeId)

            if (!nodeMap) {
                console.warn(`⚠️ [CRDT Hook]: Node ${nodeId} not found`)
                return
            }

            // Apply partial updates
            for (const [key, value] of Object.entries(updates)) {
                if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                    // Nested update (e.g., position: { x: 100 })
                    let nestedMap = nodeMap.get(key)
                    if (!nestedMap || typeof nestedMap.entries !== 'function') {
                        nestedMap = nodeMap.setContainer(key, new LoroMap())
                    }
                    for (const [nestedKey, nestedValue] of Object.entries(value)) {
                        nestedMap.set(nestedKey, nestedValue)
                    }
                } else {
                    nodeMap.set(key, value)
                }
            }
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error updating node:', error)
        }
    }, [])

    /**
     * Remove a node from the CRDT doc
     */
    const removeNode = useCallback((nodeId) => {
        if (!docRef.current || !nodeId) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const nodesMap = flowMap.get('nodes')
            nodesMap.delete(nodeId)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error removing node:', error)
        }
    }, [])

    /**
     * Add an edge to the CRDT doc
     */
    const addEdge = useCallback((edge) => {
        if (!docRef.current || !edge || !edge.id) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const edgesMap = flowMap.get('edges')
            const edgeMap = edgesMap.setContainer(edge.id, new LoroMap())

            setLoroMapFromObject(edgeMap, edge)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error adding edge:', error)
        }
    }, [])

    /**
     * Remove an edge from the CRDT doc
     */
    const removeEdge = useCallback((edgeId) => {
        if (!docRef.current || !edgeId) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const edgesMap = flowMap.get('edges')
            edgesMap.delete(edgeId)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error removing edge:', error)
        }
    }, [])

    /**
     * Update viewport in the CRDT doc
     */
    const updateViewport = useCallback((viewport) => {
        if (!docRef.current || !viewport) return

        try {
            const flowMap = docRef.current.getMap('flow')
            const viewportMap = flowMap.get('viewport')

            if (viewport.x !== undefined) viewportMap.set('x', viewport.x)
            if (viewport.y !== undefined) viewportMap.set('y', viewport.y)
            if (viewport.zoom !== undefined) viewportMap.set('zoom', viewport.zoom)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error updating viewport:', error)
        }
    }, [])

    /**
     * Batch multiple operations in a transaction
     */
    const transact = useCallback((callback) => {
        if (!docRef.current || !callback) return

        try {
            docRef.current.transact(callback)
        } catch (error) {
            console.error('❌ [CRDT Hook]: Error in transaction:', error)
        }
    }, [])

    return {
        // State
        state,
        isInitialized,
        isSyncing,

        // Initialization
        initFromSnapshot,
        applyRemoteUpdate,
        requestSync,
        sendPendingUpdates,

        // Node operations
        addNode,
        updateNode,
        removeNode,

        // Edge operations
        addEdge,
        removeEdge,

        // Viewport operations
        updateViewport,

        // Transaction
        transact
    }
}
