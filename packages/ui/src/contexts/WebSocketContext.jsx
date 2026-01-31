import { createContext, useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import webSocketService from '@/services/websocket/WebSocketService'

const initialValue = {
    isConnected: false,
    sessionId: null,
    connectionState: 'disconnected',
    reconnectInfo: null,
    lastMessage: null,
    authorizationError: null,
    healthStatus: { status: 'healthy', utilization: 0 },
    rateLimitError: null,
    connectionBlocked: null,
    networkStatus: 'online',
    send: () => {},
    on: () => {},
    off: () => {},
    forceReconnect: () => {}
}

const WebSocketContext = createContext(initialValue)

/**
 * @returns {WebSocketContext}
 */
export const useWebSocketContext = () => {
    const context = useContext(WebSocketContext)
    if (!context) {
        throw new Error('useWebSocketContext must be used within WebSocketProvider')
    }
    return context
}

export const WebSocketProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false)
    const [sessionId, setSessionId] = useState(null)
    const [connectionState, setConnectionState] = useState('disconnected')
    const [reconnectInfo, setReconnectInfo] = useState(null)
    const [lastMessage, setLastMessage] = useState(null)
    const [authorizationError, setAuthorizationError] = useState(null)
    const [healthStatus, setHealthStatus] = useState({ status: 'healthy', utilization: 0 })
    const [rateLimitError, setRateLimitError] = useState(null)
    const [connectionBlocked, setConnectionBlocked] = useState(null)
    const [networkStatus, setNetworkStatus] = useState('online')

    useEffect(() => {
        // Connect to WebSocket
        webSocketService.connect()

        // Set up event listeners
        const unsubscribeConnected = webSocketService.on('connected', (data) => {
            setIsConnected(true)
            setConnectionState('connected')
            setSessionId(data?.sessionId || null) // Set sessionId from WebSocket connection
            setAuthorizationError(null) // Clear any previous errors on reconnect
            setReconnectInfo(null) // Clear reconnect info

            // Show success notification if this was a reconnection
            if (data?.wasReconnecting) {
                console.log('✅ Successfully reconnected to server')
            }
        })

        const unsubscribeDisconnected = webSocketService.on('disconnected', (data) => {
            setIsConnected(false)
            setConnectionState('disconnected')

            // Only show error if not a manual disconnect
            if (!data?.manual) {
                console.warn('⚠️ Disconnected from server. Attempting to reconnect...')
            }
        })

        // Handle reconnection attempts
        const unsubscribeReconnecting = webSocketService.on('reconnecting', (info) => {
            setConnectionState('reconnecting')
            setReconnectInfo(info)
            console.log(`🔄 Reconnecting... (Attempt ${info.attempt}/${info.maxAttempts})`)
        })

        // Handle reconnection failure
        const unsubscribeReconnectFailed = webSocketService.on('reconnect-failed', (info) => {
            setConnectionState('disconnected')
            setReconnectInfo(null)
            console.error('❌ Failed to reconnect after maximum attempts')
        })

        // Handle connection state changes
        const unsubscribeStateChange = webSocketService.on('connection-state-changed', (data) => {
            setConnectionState(data.state)
            if (data.state === 'disconnected' && data.reason) {
                console.warn(`Connection state: ${data.state}, Reason: ${data.reason}`)
            }
        })

        // Handle network status changes
        const unsubscribeNetworkOnline = webSocketService.on('network-online', () => {
            setNetworkStatus('online')
            console.log('🌐 Network connection restored')
        })

        const unsubscribeNetworkOffline = webSocketService.on('network-offline', () => {
            setNetworkStatus('offline')
            setIsConnected(false)
            console.warn('🌐 Network connection lost')
        })

        const unsubscribeMessage = webSocketService.on('message', (data) => {
            // Handle authorization errors separately
            if (data.type === 'authz-error') {
                console.error('❌ WebSocket authorization error:', data.message)
                setAuthorizationError({
                    message: data.message,
                    timestamp: Date.now()
                })
                return
            }

            setLastMessage(data)
        })

        // Handle authentication errors
        const unsubscribeAuthError = webSocketService.on('auth-error', (error) => {
            console.error('❌ WebSocket authentication error:', error)
            // Optionally redirect to login or show error message
            setIsConnected(false)
        })

        // Handle health status updates
        const unsubscribeHealth = webSocketService.on('health-status', (status) => {
            setHealthStatus(status)

            if (status.status === 'warning' || status.status === 'critical') {
                console.warn(`⚠️ WebSocket server health: ${status.status} (${status.utilization})`)
            }
        })

        // Handle rate limiting
        const unsubscribeRateLimit = webSocketService.on('rate-limited', (error) => {
            setRateLimitError(error)

            // Auto-clear after retry period
            setTimeout(() => {
                setRateLimitError(null)
            }, (error.retryAfter || 5) * 1000)
        })

        // Handle connection blocked (server at capacity)
        const unsubscribeBlocked = webSocketService.on('connection-blocked', (data) => {
            setConnectionBlocked(data)

            // Auto-clear when reconnect happens
            setTimeout(() => {
                setConnectionBlocked(null)
            }, data.retryAfter)
        })

        // Cleanup on unmount
        return () => {
            unsubscribeConnected()
            unsubscribeDisconnected()
            unsubscribeReconnecting()
            unsubscribeReconnectFailed()
            unsubscribeStateChange()
            unsubscribeNetworkOnline()
            unsubscribeNetworkOffline()
            unsubscribeMessage()
            unsubscribeAuthError()
            unsubscribeHealth()
            unsubscribeRateLimit()
            unsubscribeBlocked()
            webSocketService.disconnect()
        }
    }, [])

    const sendMessage = (type, payload) => {
        const ableToSend = (healthStatus.status !== 'critical' || healthStatus.utilization < 80) && !rateLimitError && !connectionBlocked
        if (!ableToSend) {
            console.warn('⚠️ Cannot send WebSocket message due to poor server health or rate limiting')
            return
        }
        webSocketService.send(type, payload)
    }

    const value = {
        isConnected,
        sessionId,
        connectionState,
        reconnectInfo,
        lastMessage,
        authorizationError,
        healthStatus,
        rateLimitError,
        connectionBlocked,
        networkStatus,
        send: sendMessage,
        on: webSocketService.on.bind(webSocketService),
        off: webSocketService.off.bind(webSocketService),
        forceReconnect: webSocketService.forceReconnect.bind(webSocketService)
    }

    return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

WebSocketProvider.propTypes = {
    children: PropTypes.node
}
