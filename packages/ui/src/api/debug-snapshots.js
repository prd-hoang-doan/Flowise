import client from './client'

/**
 * API client for Debug Variable Pool snapshots. Snapshots are captured
 * server-side by the StepRunner after each Step Run completes — there is no
 * create endpoint here on purpose, so the UI cannot drift from the
 * authoritative capture path.
 */

const listSnapshots = (chatflowId, params) => client.get(`/chatflows/${chatflowId}/debug/snapshots`, { params })

const getSnapshot = (chatflowId, snapshotId) => client.get(`/chatflows/${chatflowId}/debug/snapshots/${snapshotId}`)

export default {
    listSnapshots,
    getSnapshot
}
