import { stepDebugReducer, initialStepDebugState } from './stepDebugReducer'
import { STEP_DEBUG_ACTIONS as A } from './actions'

describe('stepDebugReducer', () => {
    const fresh = () => ({ ...initialStepDebugState })

    it('returns prior state for unknown action', () => {
        const state = fresh()
        expect(stepDebugReducer(state, { type: 'UNKNOWN' })).toBe(state)
    })

    it('SET_SELECTED_NODE updates the selection', () => {
        const next = stepDebugReducer(fresh(), { type: A.SET_SELECTED_NODE, nodeId: 'llm_2' })
        expect(next.selectedNodeId).toBe('llm_2')
    })

    it('OPEN_INSPECTOR opens, optionally sets tab and selected node', () => {
        const next = stepDebugReducer(fresh(), { type: A.OPEN_INSPECTOR, nodeId: 'llm_2', tab: 'nodeVars' })
        expect(next).toMatchObject({ inspectorOpen: true, inspectorTab: 'nodeVars', selectedNodeId: 'llm_2' })
    })

    it('CLOSE_INSPECTOR closes without touching selection', () => {
        const open = stepDebugReducer(fresh(), { type: A.OPEN_INSPECTOR, nodeId: 'llm_2' })
        const next = stepDebugReducer(open, { type: A.CLOSE_INSPECTOR })
        expect(next.inspectorOpen).toBe(false)
        expect(next.selectedNodeId).toBe('llm_2')
    })

    it('TOGGLE_INSPECTOR flips the open flag', () => {
        const a = stepDebugReducer(fresh(), { type: A.TOGGLE_INSPECTOR })
        const b = stepDebugReducer(a, { type: A.TOGGLE_INSPECTOR })
        expect(a.inspectorOpen).toBe(true)
        expect(b.inspectorOpen).toBe(false)
    })

    it('SET_WIDTH clamps to [360, 2400]', () => {
        expect(stepDebugReducer(fresh(), { type: A.SET_WIDTH, width: 100 }).inspectorWidthPx).toBe(360)
        expect(stepDebugReducer(fresh(), { type: A.SET_WIDTH, width: 9999 }).inspectorWidthPx).toBe(2400)
        expect(stepDebugReducer(fresh(), { type: A.SET_WIDTH, width: 500 }).inspectorWidthPx).toBe(500)
    })

    it('START_RUN / FINISH_RUN add and remove per-node entries independently', () => {
        const a = stepDebugReducer(fresh(), { type: A.START_RUN, nodeId: 'n1', startedAt: 100 })
        const b = stepDebugReducer(a, { type: A.START_RUN, nodeId: 'n2', startedAt: 200 })
        expect(Object.keys(b.runningNodeIds).sort()).toEqual(['n1', 'n2'])
        const c = stepDebugReducer(b, { type: A.FINISH_RUN, nodeId: 'n1' })
        expect(Object.keys(c.runningNodeIds)).toEqual(['n2'])
    })

    it('OPEN_FORM / CLOSE_FORM toggles pending form payload', () => {
        const open = stepDebugReducer(fresh(), {
            type: A.OPEN_FORM,
            nodeId: 'llm_2',
            missingVariables: ['$flow.state.mode']
        })
        expect(open.pendingForm).toEqual({ nodeId: 'llm_2', missingVariables: ['$flow.state.mode'] })
        const closed = stepDebugReducer(open, { type: A.CLOSE_FORM })
        expect(closed.pendingForm).toBeNull()
    })

    it('MERGE_LAST_RUN stores the most recent execution per node', () => {
        const exec = { id: 'e1', nodeId: 'llm_2', status: 'FINISHED' }
        const next = stepDebugReducer(fresh(), { type: A.MERGE_LAST_RUN, nodeId: 'llm_2', execution: exec })
        expect(next.lastRunByNodeId.llm_2).toBe(exec)
    })

    it('REPLACE_VARS swaps the entire debugVarsByScope map atomically (drops missing scopes)', () => {
        const seeded = {
            ...fresh(),
            debugVarsByScope: {
                llm_2: [{ id: 'v1' }],
                __flow_state__: [{ id: 'v2' }]
            }
        }
        const next = stepDebugReducer(seeded, {
            type: A.REPLACE_VARS,
            scopes: { __system__: [{ id: 'v3', name: 'question' }] }
        })
        expect(next.debugVarsByScope).toEqual({ __system__: [{ id: 'v3', name: 'question' }] })
    })

    it('REPLACE_VARS with no scopes resets to {}', () => {
        const seeded = { ...fresh(), debugVarsByScope: { x: [{ id: '1' }] } }
        expect(stepDebugReducer(seeded, { type: A.REPLACE_VARS }).debugVarsByScope).toEqual({})
    })

    it('MERGE_VARS replaces the row list wholesale (handles backend deletions)', () => {
        const a = stepDebugReducer(fresh(), {
            type: A.MERGE_VARS,
            scopeKey: 'llm_2',
            rows: [{ id: 'v1' }, { id: 'v2' }]
        })
        const b = stepDebugReducer(a, { type: A.MERGE_VARS, scopeKey: 'llm_2', rows: [{ id: 'v1' }] })
        expect(b.debugVarsByScope.llm_2.map((r) => r.id)).toEqual(['v1'])
    })

    it('MERGE_VAR_VALUE upserts a variable value cache entry', () => {
        const next = stepDebugReducer(fresh(), {
            type: A.MERGE_VAR_VALUE,
            varId: 'v1',
            value: 'pro',
            sizeBytes: 3,
            edited: true,
            valueType: 'string'
        })
        expect(next.variableValuesById.v1).toEqual({
            value: 'pro',
            sizeBytes: 3,
            edited: true,
            valueType: 'string'
        })
    })

    it('DELETE_VAR removes the row from every scope and clears the value cache', () => {
        const seeded = {
            ...fresh(),
            debugVarsByScope: {
                llm_2: [{ id: 'v1' }, { id: 'v2' }],
                __flow_state__: [{ id: 'v2' }]
            },
            variableValuesById: { v2: { value: 'x' } }
        }
        const next = stepDebugReducer(seeded, { type: A.DELETE_VAR, varId: 'v2' })
        expect(next.debugVarsByScope.llm_2.map((r) => r.id)).toEqual(['v1'])
        expect(next.debugVarsByScope.__flow_state__).toEqual([])
        expect(next.variableValuesById.v2).toBeUndefined()
    })

    describe('SET_RUN_INPUT / RESET_RUN_INPUT', () => {
        it('SET_RUN_INPUT seeds defaults the first time a node is touched', () => {
            const next = stepDebugReducer(fresh(), {
                type: A.SET_RUN_INPUT,
                nodeId: 'llm_2',
                patch: { question: 'hi there' }
            })
            expect(next.runInputsByNodeId.llm_2).toMatchObject({
                question: 'hi there',
                sessionId: '',
                inputs: '',
                form: '',
                webhook: ''
            })
        })

        it('SET_RUN_INPUT merges subsequent patches without clobbering siblings', () => {
            const a = stepDebugReducer(fresh(), {
                type: A.SET_RUN_INPUT,
                nodeId: 'llm_2',
                patch: { question: 'q1', sessionId: 'sess-1' }
            })
            const b = stepDebugReducer(a, {
                type: A.SET_RUN_INPUT,
                nodeId: 'llm_2',
                patch: { inputs: '{"x":1}' }
            })
            expect(b.runInputsByNodeId.llm_2).toMatchObject({
                question: 'q1',
                sessionId: 'sess-1',
                inputs: '{"x":1}'
            })
        })

        it('SET_RUN_INPUT keeps inputs of other nodes isolated', () => {
            let s = fresh()
            s = stepDebugReducer(s, { type: A.SET_RUN_INPUT, nodeId: 'n1', patch: { question: 'A' } })
            s = stepDebugReducer(s, { type: A.SET_RUN_INPUT, nodeId: 'n2', patch: { question: 'B' } })
            expect(s.runInputsByNodeId.n1.question).toBe('A')
            expect(s.runInputsByNodeId.n2.question).toBe('B')
        })

        it('SET_RUN_INPUT is a no-op when nodeId is missing', () => {
            const s = fresh()
            expect(stepDebugReducer(s, { type: A.SET_RUN_INPUT, patch: { question: 'x' } })).toBe(s)
        })

        it('RESET_RUN_INPUT removes the per-node entry', () => {
            let s = fresh()
            s = stepDebugReducer(s, { type: A.SET_RUN_INPUT, nodeId: 'n1', patch: { question: 'x' } })
            s = stepDebugReducer(s, { type: A.RESET_RUN_INPUT, nodeId: 'n1' })
            expect(s.runInputsByNodeId.n1).toBeUndefined()
        })

        it('RESET_RUN_INPUT is a no-op when the node has no entry', () => {
            const s = fresh()
            expect(stepDebugReducer(s, { type: A.RESET_RUN_INPUT, nodeId: 'n1' })).toBe(s)
        })
    })

    describe('SET_RUN_INPUT_STRUCTURED', () => {
        it('sets a structured field value and preserves siblings', () => {
            let s = fresh()
            s = stepDebugReducer(s, {
                type: A.SET_RUN_INPUT_STRUCTURED,
                nodeId: 'llm_2',
                ref: '$form.topic',
                value: 'pricing'
            })
            s = stepDebugReducer(s, {
                type: A.SET_RUN_INPUT_STRUCTURED,
                nodeId: 'llm_2',
                ref: '$flow.state.mode',
                value: 'pro'
            })
            expect(s.runInputsByNodeId.llm_2.structured).toEqual({
                '$form.topic': 'pricing',
                '$flow.state.mode': 'pro'
            })
            // sibling string fields untouched
            expect(s.runInputsByNodeId.llm_2.question).toBe('')
        })

        it('passing value: undefined removes the entry', () => {
            let s = fresh()
            s = stepDebugReducer(s, {
                type: A.SET_RUN_INPUT_STRUCTURED,
                nodeId: 'llm_2',
                ref: '$form.topic',
                value: 'pricing'
            })
            s = stepDebugReducer(s, {
                type: A.SET_RUN_INPUT_STRUCTURED,
                nodeId: 'llm_2',
                ref: '$form.topic',
                value: undefined
            })
            expect(s.runInputsByNodeId.llm_2.structured).toEqual({})
        })

        it('no-op when nodeId or ref missing', () => {
            const s = fresh()
            expect(stepDebugReducer(s, { type: A.SET_RUN_INPUT_STRUCTURED, ref: '$form.x', value: 'y' })).toBe(s)
            expect(stepDebugReducer(s, { type: A.SET_RUN_INPUT_STRUCTURED, nodeId: 'n', value: 'y' })).toBe(s)
        })

        it('isolates structured values across nodes', () => {
            let s = fresh()
            s = stepDebugReducer(s, { type: A.SET_RUN_INPUT_STRUCTURED, nodeId: 'n1', ref: '$question', value: 'A' })
            s = stepDebugReducer(s, { type: A.SET_RUN_INPUT_STRUCTURED, nodeId: 'n2', ref: '$question', value: 'B' })
            expect(s.runInputsByNodeId.n1.structured).toEqual({ $question: 'A' })
            expect(s.runInputsByNodeId.n2.structured).toEqual({ $question: 'B' })
        })
    })

    it('default inspector tab is debugStep', () => {
        expect(fresh().inspectorTab).toBe('debugStep')
    })

    it('WIPE_VARS clears every variable cache', () => {
        const seeded = {
            ...fresh(),
            debugVarsByScope: { llm_2: [{ id: 'v1' }] },
            variableValuesById: { v1: { value: 'x' } },
            lastRunByNodeId: { llm_2: { id: 'e1' } }
        }
        const next = stepDebugReducer(seeded, { type: A.WIPE_VARS })
        expect(next.debugVarsByScope).toEqual({})
        expect(next.variableValuesById).toEqual({})
        expect(next.lastRunByNodeId).toEqual({})
    })

    it('SHOW_TOAST / DISMISS_TOAST', () => {
        const a = stepDebugReducer(fresh(), { type: A.SHOW_TOAST, severity: 'error', message: 'oops' })
        expect(a.toast).toMatchObject({ severity: 'error', message: 'oops' })
        expect(typeof a.toast.key).toBe('number')
        const b = stepDebugReducer(a, { type: A.DISMISS_TOAST })
        expect(b.toast).toBeNull()
    })

    it('RESET returns initial state with the provided chatflowId', () => {
        const seeded = stepDebugReducer(fresh(), { type: A.SET_SELECTED_NODE, nodeId: 'x' })
        const next = stepDebugReducer(seeded, { type: A.RESET, chatflowId: 'new-cf' })
        expect(next).toEqual({ ...initialStepDebugState, chatflowId: 'new-cf' })
    })

    describe('Variable Pool panel actions', () => {
        it('OPEN / CLOSE / TOGGLE_VARIABLE_POOL flip variablePoolOpen', () => {
            const opened = stepDebugReducer(fresh(), { type: A.OPEN_VARIABLE_POOL })
            expect(opened.variablePoolOpen).toBe(true)
            const closed = stepDebugReducer(opened, { type: A.CLOSE_VARIABLE_POOL })
            expect(closed.variablePoolOpen).toBe(false)
            const toggled = stepDebugReducer(closed, { type: A.TOGGLE_VARIABLE_POOL })
            expect(toggled.variablePoolOpen).toBe(true)
        })

        it('SET_VARIABLE_POOL_HEIGHT clamps to [MIN, viewport-200]', () => {
            const tooSmall = stepDebugReducer(fresh(), { type: A.SET_VARIABLE_POOL_HEIGHT, height: 50 })
            expect(tooSmall.variablePoolHeightPx).toBe(200)
            // In a node-only test env `window` is undefined; the reducer falls
            // back to ABSOLUTE_MAX_VARIABLE_POOL_HEIGHT_PX (1200) for the upper bound.
            const tooBig = stepDebugReducer(fresh(), { type: A.SET_VARIABLE_POOL_HEIGHT, height: 99999 })
            expect(tooBig.variablePoolHeightPx).toBeLessThanOrEqual(1200)
            const inRange = stepDebugReducer(fresh(), { type: A.SET_VARIABLE_POOL_HEIGHT, height: 300 })
            expect(inRange.variablePoolHeightPx).toBe(300)
        })

        it('SET_SNAPSHOTS clears the loading flag and replaces the list', () => {
            const loading = stepDebugReducer(fresh(), { type: A.SET_SNAPSHOTS_LOADING, loading: true })
            expect(loading.snapshotsLoading).toBe(true)
            const loaded = stepDebugReducer(loading, { type: A.SET_SNAPSHOTS, snapshots: [{ id: 's1' }] })
            expect(loaded.snapshots).toEqual([{ id: 's1' }])
            expect(loaded.snapshotsLoading).toBe(false)
        })

        it('MERGE_SNAPSHOT_DETAIL stores detail by id', () => {
            const next = stepDebugReducer(fresh(), {
                type: A.MERGE_SNAPSHOT_DETAIL,
                snapshotId: 's1',
                detail: { variables: { n: [{ name: 'a' }] } }
            })
            expect(next.snapshotDetailById.s1).toEqual({ variables: { n: [{ name: 'a' }] } })
        })

        it('SELECT_SNAPSHOT defaults to LIVE sentinel when no id provided', () => {
            const selected = stepDebugReducer(fresh(), { type: A.SELECT_SNAPSHOT, snapshotId: 's1' })
            expect(selected.selectedSnapshotId).toBe('s1')
            const reset = stepDebugReducer(selected, { type: A.SELECT_SNAPSHOT })
            expect(reset.selectedSnapshotId).toBe('__live__')
        })

        it('SET_POOL_FILTER stores the search text', () => {
            const next = stepDebugReducer(fresh(), { type: A.SET_POOL_FILTER, filter: 'mode' })
            expect(next.poolFilter).toBe('mode')
        })

        it('WIPE_VARS also drops snapshots + detail and resets selection to LIVE', () => {
            const seeded = {
                ...fresh(),
                snapshots: [{ id: 's1' }],
                snapshotDetailById: { s1: { variables: {} } },
                selectedSnapshotId: 's1'
            }
            const next = stepDebugReducer(seeded, { type: A.WIPE_VARS })
            expect(next.snapshots).toEqual([])
            expect(next.snapshotDetailById).toEqual({})
            expect(next.selectedSnapshotId).toBe('__live__')
        })
    })
})
