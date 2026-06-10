import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconRefresh, IconTrash, IconX } from '@tabler/icons-react'

import { useStepDebug } from '../../store/StepDebugContext'
import { useDebugSnapshots } from '../../hooks/useDebugSnapshots'
import { useDebugVariables } from '../../hooks/useDebugVariables'
import { STEP_DEBUG_ACTIONS as A } from '../../store/actions'
import { LIVE_SNAPSHOT_SENTINEL, MIN_VARIABLE_POOL_HEIGHT_PX, ABSOLUTE_MAX_VARIABLE_POOL_HEIGHT_PX } from '../../utils/constants'
import { flattenSnapshot } from '../../utils/flattenSnapshot'
import { diffSnapshots } from '../../utils/diffSnapshots'

import SnapshotTimeline from './SnapshotTimeline'
import PoolTable from './PoolTable'
import MissingVarsAlert from './MissingVarsAlert'

// Stable fallback references so the `??` defaults below don't allocate a new
// empty array / object every render — that would invalidate useMemo deps
// downstream and trigger react-hooks/exhaustive-deps warnings.
const EMPTY_ARRAY = Object.freeze([])
const EMPTY_OBJECT = Object.freeze({})

/**
 * Bottom-anchored Variable Pool panel. Mounts as a sibling of the Inspector
 * drawer; the two share the canvas viewport (the panel computes its right
 * offset from the inspector width when the inspector is open).
 *
 * The panel is the only entry point that lists snapshots — the Inspector
 * keeps its scoped per-node views unchanged. State (open, height, filter,
 * selection) lives in the step-debug reducer so it survives toggles.
 */
const VariablePoolPanel = () => {
    const theme = useTheme()
    const ctx = useStepDebug()
    const snapshots = useDebugSnapshots()
    const debugVars = useDebugVariables()

    const open = ctx?.state?.variablePoolOpen ?? false
    const heightPx = ctx?.state?.variablePoolHeightPx ?? 320
    const selectedSnapshotId = ctx?.state?.selectedSnapshotId ?? LIVE_SNAPSHOT_SENTINEL
    const snapshotList = ctx?.state?.snapshots ?? EMPTY_ARRAY
    const snapshotDetailById = ctx?.state?.snapshotDetailById ?? EMPTY_OBJECT
    const live = ctx?.state?.debugVarsByScope ?? EMPTY_OBJECT
    const inspectorOpen = ctx?.state?.inspectorOpen ?? false
    const inspectorWidthPx = ctx?.state?.inspectorWidthPx ?? 0
    const filter = ctx?.state?.poolFilter ?? ''
    const chatflowId = ctx?.chatflowId

    // Prime the snapshot list when the panel first opens for a chatflow.
    useEffect(() => {
        if (!open || !chatflowId) return
        snapshots.list()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, chatflowId])

    // Lazy-load full snapshot detail when the user scrubs to a non-live row.
    useEffect(() => {
        if (!open) return
        if (selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL) return
        if (snapshotDetailById[selectedSnapshotId]) return
        snapshots.loadDetail(selectedSnapshotId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedSnapshotId])

    const nodesById = useMemo(() => {
        const graph = ctx?.getGraph ? ctx.getGraph() : { nodes: [] }
        const out = {}
        for (const n of graph.nodes ?? []) out[n.id] = n
        return out
    }, [ctx])

    // Resolve the source for the active table (live cache vs historical snapshot).
    const activeSource = useMemo(() => {
        if (selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL) return live
        return snapshotDetailById[selectedSnapshotId]?.variables ?? {}
    }, [selectedSnapshotId, live, snapshotDetailById])

    // Previous snapshot is used as the diff baseline. The first snapshot
    // diffs against an empty pool (so every entry shows as `added`).
    const previousSource = useMemo(() => {
        if (selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL) {
            // Live view diffs against the most recent snapshot — the most
            // useful comparison when iterating ("what did my latest run change?").
            const newest = snapshotList[0]
            if (!newest) return {}
            return snapshotDetailById[newest.id]?.variables ?? null
        }
        // The list is newest-first; find the snapshot immediately before
        // the selected one in chronological order (i.e. the next one in
        // the list, since list is desc).
        const idx = snapshotList.findIndex((s) => s.id === selectedSnapshotId)
        if (idx === -1) return {}
        const prev = snapshotList[idx + 1]
        if (!prev) return {}
        return snapshotDetailById[prev.id]?.variables ?? null
    }, [selectedSnapshotId, snapshotList, snapshotDetailById])

    const diff = useMemo(() => diffSnapshots(previousSource ?? {}, activeSource ?? {}), [previousSource, activeSource])

    const rows = useMemo(() => flattenSnapshot(activeSource, { nodesById, filter }), [activeSource, nodesById, filter])

    // Removed entries — only meaningful when scrubbing back through history.
    const removedRows = useMemo(() => {
        if (!previousSource) return []
        const removed = []
        for (const refKey of diff.removed) {
            const [scopeKey, name] = refKey.split(':')
            const prevEntries = previousSource?.[scopeKey] ?? []
            const entry = prevEntries.find((e) => e?.name === name)
            if (entry) {
                removed.push({
                    refKey,
                    scopeKey,
                    scopeLabel: scopeKey,
                    name,
                    valueType: entry.valueType ?? 'json',
                    value: entry.value,
                    sizeBytes: entry.sizeBytes ?? 0,
                    edited: false,
                    visible: true,
                    id: entry.id ?? null
                })
            }
        }
        return removed
    }, [diff, previousSource])

    const selectedSnapshot = useMemo(() => {
        if (selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL) return null
        return snapshotList.find((s) => s.id === selectedSnapshotId) ?? null
    }, [selectedSnapshotId, snapshotList])

    const missing = useMemo(() => {
        if (selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL) return []
        return snapshotDetailById[selectedSnapshotId]?.missingVariables ?? []
    }, [selectedSnapshotId, snapshotDetailById])

    // Drag-to-resize on the top edge — mirrors the Inspector's left-edge handle.
    const draggingRef = useRef(false)
    useEffect(() => {
        if (!draggingRef.current) return undefined
        const onMove = (e) => {
            if (!draggingRef.current || !ctx) return
            const next = Math.max(
                MIN_VARIABLE_POOL_HEIGHT_PX,
                Math.min(ABSOLUTE_MAX_VARIABLE_POOL_HEIGHT_PX, window.innerHeight - e.clientY)
            )
            ctx.dispatch({ type: A.SET_VARIABLE_POOL_HEIGHT, height: next })
        }
        const onUp = () => {
            draggingRef.current = false
            document.body.style.userSelect = ''
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [ctx])

    const startDrag = () => {
        draggingRef.current = true
        document.body.style.userSelect = 'none'
    }

    const handleClose = useCallback(() => {
        ctx?.dispatch({ type: A.CLOSE_VARIABLE_POOL })
    }, [ctx])

    const handleRefresh = useCallback(async () => {
        await Promise.all([snapshots.list(), debugVars.refreshAll()])
    }, [snapshots, debugVars])

    const handleWipe = useCallback(async () => {
        const ok = window.confirm('Wipe all Debug Variables, snapshots and Step Run history for this flow?')
        if (!ok) return
        await debugVars.wipe()
        await snapshots.list()
    }, [debugVars, snapshots])

    const handleFilterChange = (e) => {
        ctx?.dispatch({ type: A.SET_POOL_FILTER, filter: e.target.value })
    }

    if (!open) return null

    const rightOffset = inspectorOpen ? inspectorWidthPx : 0

    return (
        <Box
            sx={{
                position: 'fixed',
                left: 0,
                right: rightOffset,
                bottom: 0,
                height: heightPx,
                zIndex: theme.zIndex.drawer - 1,
                bgcolor: 'background.paper',
                borderTop: `1px solid ${theme.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                transition: 'right 0.2s ease'
            }}
        >
            <Box
                onMouseDown={startDrag}
                aria-label='Resize Variable Pool panel'
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    cursor: 'row-resize',
                    zIndex: 2,
                    '&:hover': { backgroundColor: theme.palette.primary.main }
                }}
            />

            <Stack
                direction='row'
                alignItems='center'
                spacing={1}
                sx={{ px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}
            >
                <Typography variant='subtitle2' fontWeight={700}>
                    Variable Pool
                </Typography>
                <Typography variant='caption' color='text.secondary'>
                    {snapshotList.length} snapshot{snapshotList.length === 1 ? '' : 's'}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <TextField
                    size='small'
                    placeholder='Filter by scope, name, type'
                    value={filter}
                    onChange={handleFilterChange}
                    sx={{ width: 260 }}
                />
                <Tooltip title='Refresh'>
                    <IconButton size='small' onClick={handleRefresh} aria-label='Refresh pool'>
                        <IconRefresh size={16} />
                    </IconButton>
                </Tooltip>
                <Tooltip title='Wipe pool + snapshots'>
                    <IconButton size='small' onClick={handleWipe} aria-label='Wipe pool'>
                        <IconTrash size={16} />
                    </IconButton>
                </Tooltip>
                <Tooltip title='Close panel'>
                    <IconButton size='small' onClick={handleClose} aria-label='Close panel'>
                        <IconX size={16} />
                    </IconButton>
                </Tooltip>
            </Stack>

            <SnapshotTimeline snapshots={snapshotList} selectedSnapshotId={selectedSnapshotId} onSelect={(id) => snapshots.select(id)} />

            <Box sx={{ flex: 1, overflow: 'auto' }}>
                {selectedSnapshot && (
                    <Box sx={{ px: 2, pt: 2 }}>
                        <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                            <Typography variant='caption' color='text.secondary'>
                                Viewing snapshot from {new Date(selectedSnapshot.createdDate).toLocaleString()} · run on{' '}
                                <strong>{selectedSnapshot.nodeLabel || selectedSnapshot.nodeId}</strong>
                            </Typography>
                        </Stack>
                        <MissingVarsAlert missing={missing} />
                    </Box>
                )}
                <PoolTable
                    rows={rows}
                    diffByKey={diff.byKey}
                    removedRows={removedRows}
                    emptyHint={
                        selectedSnapshotId === LIVE_SNAPSHOT_SENTINEL
                            ? 'No variables yet. Run a step to populate the Debug Variable Pool.'
                            : 'This snapshot has no recorded variables.'
                    }
                />
            </Box>
        </Box>
    )
}

export default VariablePoolPanel
