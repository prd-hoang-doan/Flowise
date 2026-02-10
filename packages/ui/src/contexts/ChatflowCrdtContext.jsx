import { createContext, useContext, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { useWebSocketContext } from './WebSocketContext'
import { useChatflowCrdt } from '@/hooks/useChatflowCrdt'

const ChatflowCrdtContext = createContext(null)

/**
 * Check if CRDT is enabled via environment variable
 */
export const isCrdtEnabled = () => {
    const value = import.meta.env.VITE_ENABLE_CRDT
    // Default to true if not set
    if (value === undefined || value === null) return true
    if (typeof value === 'boolean') return value
    return value === 'true' || value === '1'
}

/**
 * Hook to access CRDT context
 * @returns {ChatflowCrdtContext | null}
 */
export const useChatflowCrdtContext = () => {
    const context = useContext(ChatflowCrdtContext)
    if (!context && isCrdtEnabled()) {
        throw new Error('useChatflowCrdtContext must be used within ChatflowCrdtProvider')
    }
    return context
}

/**
 * Provider that manages CRDT state for a specific chatflow
 */
export const ChatflowCrdtProvider = ({ children, chatflowId, protocolVersion = 'crdt-1.0' }) => {
    const { isConnected, send, on, off } = useWebSocketContext()
    const hasJoinedRef = useRef(false)
    const pendingUpdatesRef = useRef([])

    // Initialize CRDT hook
    console.log(`[CRDT] Initializing CRDT for chatflow ${chatflowId} with protocol ${protocolVersion}`)
    const crdt = useChatflowCrdt(chatflowId)

    /**
     * Send CRDT update to server
     */
    const sendCrdtUpdate = useCallback(
        (update) => {
            if (!isConnected) {
                console.warn('[CRDT] Cannot send update: not connected')
                // Queue update for later
                pendingUpdatesRef.current.push(update)
                return false
            }

            send('CRDT_UPDATE', {
                chatflowId,
                update,
                clientId: crdt.clientId,
                timestamp: Date.now()
            })
            return true
        },
        [isConnected, send, chatflowId, crdt.clientId]
    )

    /**
     * Subscribe to CRDT changes and forward to server
     */
    useEffect(() => {
        if (!crdt.doc || !crdt.isInitialized) return

        const unsubscribe = crdt.subscribe((update) => {
            sendCrdtUpdate(update)
        })

        return unsubscribe
    }, [crdt.doc, crdt.isInitialized, crdt.subscribe, sendCrdtUpdate])

    /**
     * Request sync from server when initialized
     */
    const requestSync = useCallback(() => {
        if (!isConnected) {
            console.warn('[CRDT] Cannot request sync: not connected')
            return
        }

        send('CRDT_SYNC_REQUEST', {
            chatflowId,
            clientId: crdt.clientId,
            timestamp: Date.now()
        })
    }, [isConnected, send, chatflowId, crdt.clientId])

    /**
     * Join chatflow with CRDT protocol
     */
    useEffect(() => {
        if (!isConnected || !chatflowId || hasJoinedRef.current) {
            return
        }

        console.log(`[CRDT] Joining chatflow ${chatflowId} with protocol ${protocolVersion}`)

        // Send CRDT_INIT event to join with CRDT protocol
        send('CRDT_INIT', {
            chatflowId,
            userId: crdt.clientId,
            timestamp: Date.now(),
            protocolVersion
        })

        hasJoinedRef.current = true
    }, [isConnected, chatflowId, protocolVersion, send, crdt.clientId])

    /**
     * Handle CRDT_SNAPSHOT from server (initial state)
     */
    useEffect(() => {
        if (!chatflowId) return

        const handleSnapshot = (data) => {
            if (data.chatflowId !== chatflowId) return

            console.log('[CRDT] Received snapshot from server')
            try {
                crdt.initFromSnapshot(data.snapshot)
            } catch (error) {
                console.error('[CRDT] Failed to apply snapshot:', error)
            }
        }

        const unsubscribe = on('CRDT_SNAPSHOT', handleSnapshot)
        return () => off('CRDT_SNAPSHOT', handleSnapshot)
    }, [chatflowId, on, off, crdt])

    /**
     * Handle ON_CRDT_UPDATE from server (remote changes)
     */
    useEffect(() => {
        if (!chatflowId) return

        const handleRemoteUpdate = (data) => {
            if (data.chatflowId !== chatflowId) return
            if (data.clientId === crdt.clientId) {
                // Ignore our own updates echoed back
                return
            }

            console.log('[CRDT] Received remote update from client:', data.clientId)
            try {
                crdt.applyRemoteUpdate(data.update)
            } catch (error) {
                console.error('[CRDT] Failed to apply remote update:', error)
                // Request full sync if update fails
                requestSync()
            }
        }

        const unsubscribe = on('ON_CRDT_UPDATE', handleRemoteUpdate)
        return () => off('ON_CRDT_UPDATE', handleRemoteUpdate)
    }, [chatflowId, on, off, crdt, requestSync])

    /**
     * Send pending updates when connection is restored
     */
    useEffect(() => {
        if (!isConnected || !crdt.isInitialized) return

        // Send any pending updates that were queued while offline
        if (pendingUpdatesRef.current.length > 0) {
            console.log(`[CRDT] Sending ${pendingUpdatesRef.current.length} pending updates`)
            pendingUpdatesRef.current.forEach((update) => {
                sendCrdtUpdate(update)
            })
            pendingUpdatesRef.current = []
        }

        // Also send any pending updates from the CRDT hook
        crdt.sendPendingUpdates()
    }, [isConnected, crdt.isInitialized, crdt.sendPendingUpdates, sendCrdtUpdate])

    /**
     * Request sync when connection is restored
     */
    useEffect(() => {
        if (isConnected && crdt.isInitialized && hasJoinedRef.current) {
            // Small delay to let server process the reconnection
            const timer = setTimeout(() => {
                requestSync()
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [isConnected, crdt.isInitialized, requestSync])

    /**
     * Reset join state when disconnected
     */
    useEffect(() => {
        if (!isConnected) {
            hasJoinedRef.current = false
        }
    }, [isConnected])

    const value = {
        // CRDT state
        nodes: crdt.nodes,
        edges: crdt.edges,
        viewport: crdt.viewport,
        isInitialized: crdt.isInitialized,
        isSyncing: crdt.isSyncing,
        clientId: crdt.clientId,

        // CRDT operations
        addNode: crdt.addNode,
        updateNode: crdt.updateNode,
        removeNode: crdt.removeNode,
        addEdge: crdt.addEdge,
        removeEdge: crdt.removeEdge,
        updateViewport: crdt.updateViewport,
        transact: crdt.transact,

        // Sync operations
        requestSync,
        initFromSnapshot: crdt.initFromSnapshot,
        applyRemoteUpdate: crdt.applyRemoteUpdate,
        sendPendingUpdates: crdt.sendPendingUpdates
    }

    console.log('[CRDT Context] Providing CRDT context with value:', value)

    return <ChatflowCrdtContext.Provider value={value}>{children}</ChatflowCrdtContext.Provider>
}

ChatflowCrdtProvider.propTypes = {
    children: PropTypes.node.isRequired,
    chatflowId: PropTypes.string.isRequired,
    protocolVersion: PropTypes.string
}
