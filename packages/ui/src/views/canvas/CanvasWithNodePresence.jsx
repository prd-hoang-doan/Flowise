import PropTypes from 'prop-types'
import { CanvasPresenceProvider } from '@/contexts/CanvasPresenceContext'
import { useNodePresenceSync } from '@/hooks/useNodePresenceSync'
import Canvas from './index'

/**
 * Inner component that uses the presence sync hook
 */
const CanvasWithPresenceSync = ({ chatflowId, sessionId }) => {
    // Sync node presence with WebSocket
    useNodePresenceSync(chatflowId, sessionId)

    return <Canvas />
}

CanvasWithPresenceSync.propTypes = {
    chatflowId: PropTypes.string,
    sessionId: PropTypes.string
}

/**
 * Canvas wrapper that provides NodePresence context
 */
const CanvasWithNodePresence = () => {
    return (
        <CanvasPresenceProvider>
            <Canvas />
        </CanvasPresenceProvider>
    )
}

export default CanvasWithNodePresence
