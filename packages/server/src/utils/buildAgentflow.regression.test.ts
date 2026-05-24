/**
 * Regression-shape test for `buildAgentflow.ts`.
 *
 * The Step Debugger PR exposes `executeNode`, `IExecuteNodeParams`, and
 * `IAgentFlowRuntime` from this module. We pin those exports here so any
 * accidental removal during a future refactor surfaces as a test failure
 * (rather than as a downstream `StepRunner` runtime error).
 *
 * We deliberately do NOT import the buildAgentflow module here. Doing so
 * pulls in the full TypeORM / flowise-components / controller chain that
 * ts-jest will type-check, and unrelated controller files have known
 * pre-existing TS2305 issues outside the scope of this PR. A source-level
 * grep is sufficient to catch the regression we care about: accidental
 * removal of `export` from `executeNode`, `executeAgentFlow`, etc.
 *
 * A full functional snapshot of executeAgentFlow over Plan and Execute,
 * Agentic RAG, and Customer Support Team Agents is documented in the
 * architecture doc but requires a real component-node harness that is
 * out of scope for this unit-test layer. The architecture decision was
 * to assert export-surface stability here and run the live regression
 * via the integration / e2e suites once the runtime harness is in place.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(resolve(__dirname, 'buildAgentflow.ts'), 'utf8')

describe('buildAgentflow.ts export surface (regression)', () => {
    it('exports executeNode as the StepRunner entrypoint', () => {
        expect(SOURCE).toMatch(/^export const executeNode\s*=\s*async/m)
    })

    it('exports executeAgentFlow with the existing object-arg signature', () => {
        expect(SOURCE).toMatch(/^export const executeAgentFlow\s*=\s*async/m)
        // Single-argument destructure shape ({...}: IExecuteAgentFlowParams)
        expect(SOURCE).toMatch(/executeAgentFlow\s*=\s*async\s*\(\{[\s\S]*?\}:\s*IExecuteAgentFlowParams\)/)
    })

    it('exports resolveVariables (used by the Step Debugger pool)', () => {
        expect(SOURCE).toMatch(/^export const resolveVariables\s*=\s*async/m)
    })

    it('exports the IAgentFlowRuntime and IExecuteNodeParams types StepRunner depends on', () => {
        expect(SOURCE).toMatch(/^export interface IAgentFlowRuntime\b/m)
        expect(SOURCE).toMatch(/^export interface IExecuteNodeParams\b/m)
    })

    it('still filters stickyNoteAgentflow nodes inside executeAgentFlow (parity with StepRunner)', () => {
        // StepRunner intentionally mirrors this filter — if executeAgentFlow
        // changes the filter the debugger must change too.
        expect(SOURCE).toContain("node.data.name !== 'stickyNoteAgentflow'")
    })
})
