/**
 * Skill V2 — LLM-facing bash tool.
 *
 * A single `StructuredTool` that takes one shell command and runs it
 * inside the shared [`SandboxSession`](./SandboxSession.ts). The tool
 * *is* the LLM's entire execution surface in sandbox mode — `python3`,
 * `node`, `cat`, `pdftotext`, `curl`, `ls`, …, whatever the author's
 * skill documentation tells the model to do, it goes through here.
 *
 * Contract with the agent runtime:
 *   - The tool name follows `bash_<skillSlug>` so multiple Skill nodes
 *     in a flow don't collide.
 *   - The returned string is JSON-stringified with the same envelope
 *     shape as the legacy `exec_skill_code` (`{status, stdout, stderr,
 *     exitCode, error?, durationMs, engine}`). Prompts written for
 *     exec_skill_code continue to parse correctly.
 *   - `_call` NEVER throws out to the agent — shell-level failures,
 *     timeouts, and host errors all flow through the envelope. This
 *     keeps the function-calling loop deterministic.
 */

import { StructuredTool, ToolParams } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { formatRecipeCommand, groupByRecipeFamily } from './commandRecipes'
import { absolutePath, SandboxManifest } from './SandboxManifest'
import { SandboxSession } from './SandboxSession'

// ---------------------------------------------------------------------------
// Tool argument schema (LLM-visible)
// ---------------------------------------------------------------------------

const bashSchema = z.object({
    command: z
        .string()
        .min(1)
        .describe(
            'Bash command to run inside the sandbox VM. ' +
                'Working directory is /home/user; all skill files live under skills/ and any files you create for the user should go under output/.'
        ),
    timeout_ms: z.number().int().positive().optional().describe('Optional per-call timeout in milliseconds. Clamped to the server ceiling.')
})

export type SandboxBashArgs = z.infer<typeof bashSchema>

// ---------------------------------------------------------------------------
// Envelope shape returned to the LLM
// ---------------------------------------------------------------------------

interface BashEnvelope {
    status: 'ok' | 'error'
    stdout: string
    stderr: string
    exitCode: number
    error?: {
        kind: 'timeout' | 'runtime' | 'internal' | 'disabled' | 'unsupported'
        message: string
    }
    durationMs: number
    engine: string
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface SandboxBashToolFields extends ToolParams {
    name: string
    description: string
    session: SandboxSession
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

export class SandboxBashTool extends StructuredTool {
    static lc_name() {
        return 'SandboxBashTool'
    }

    name: string
    description: string
    schema = bashSchema

    private readonly session: SandboxSession

    constructor(fields: SandboxBashToolFields) {
        super(fields)
        this.name = fields.name
        this.description = fields.description
        this.session = fields.session
    }

    protected async _call(input: SandboxBashArgs): Promise<string> {
        const envelope = await this.run(input)
        return JSON.stringify(envelope)
    }

    /**
     * Public test seam — the pipeline is identical to `_call` but returns
     * the typed envelope instead of a JSON string.
     */
    async run(input: SandboxBashArgs): Promise<BashEnvelope> {
        const started = Date.now()
        const command = typeof input?.command === 'string' ? input.command.trim() : ''
        console.log(`[SandboxBashTool] Executing command: ${command} (timeout_ms=${input.timeout_ms ?? 'none'})`)
        if (!command) {
            return {
                status: 'error',
                stdout: '',
                stderr: '',
                exitCode: 1,
                error: { kind: 'unsupported', message: 'Missing "command" argument' },
                durationMs: Date.now() - started,
                engine: 'e2b-bash'
            }
        }

        const result = await this.session.exec(command, input?.timeout_ms)
        return {
            status: result.ok ? 'ok' : 'error',
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            // When the guest itself exited non-zero but no host error was
            // hit, we synthesise a small `runtime` descriptor so the LLM
            // has a stable signal; skip it when the envelope is already
            // clean (ok=true) to keep the JSON compact.
            error: result.error
                ? { kind: result.error.kind, message: result.error.message }
                : result.ok
                ? undefined
                : { kind: 'runtime', message: firstLine(result.stderr) || 'non-zero exit' },
            durationMs: result.durationMs,
            engine: 'e2b-bash'
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const firstLine = (s: string): string => {
    if (!s) return ''
    const i = s.indexOf('\n')
    return i === -1 ? s : s.slice(0, i)
}

/**
 * Compose the description the LLM sees for the bash tool.
 *
 * We inline a "Suggested invocations" cheat-sheet grouped by file type
 * so the model doesn't have to guess whether `./foo.py` wants `python3`
 * or `./bar.js` wants `node`. Groups are capped at `MAX_ENTRIES_PER_GROUP`
 * to keep the description under ~2 KB; the LLM can still discover the
 * rest with `ls` / `find` inside the sandbox.
 */
const MAX_ENTRIES_PER_GROUP = 8

export const buildBashToolDescription = (manifest: SandboxManifest, engineLabel: string): string => {
    const intro =
        `Run a shell command inside the skill sandbox VM (engine: ${engineLabel}). ` +
        `Working directory is /home/user; all reachable skill files live under ${manifest.skillsDir}/ ` +
        `and any artefacts you want to hand back to the user should go into ${manifest.outputDir}/. ` +
        `Returns a JSON envelope { status, stdout, stderr, exitCode, error?, durationMs, engine }; ` +
        `stdout/stderr are clipped, so pipe large outputs through head/tail or write them to ${manifest.outputDir}/ and inspect with cat.`

    if (!manifest.entries.length) {
        return `${intro}\n\nNo skill files were reachable — the sandbox is empty beyond the default image.`
    }

    const groups = groupByRecipeFamily(manifest.entries)
    const sections: string[] = ['\n\nSuggested invocations (one command per file, use these as starting points):']
    for (const { recipe, entries } of groups) {
        const shown = entries.slice(0, MAX_ENTRIES_PER_GROUP)
        const omitted = entries.length - shown.length
        sections.push(`- ${recipe.label}:`)
        for (const entry of shown) {
            const cmd = formatRecipeCommand(recipe, absolutePath(manifest, entry))
            sections.push(`    • ${entry.relPath} → ${cmd}`)
        }
        if (omitted > 0) {
            sections.push(`    • …and ${omitted} more; run \`ls ${manifest.skillsDir}\` to list them.`)
        }
    }

    const description = intro + sections.join('\n')
    console.log('[buildBashToolDescription] Generated bash tool description:\n' + description)
    return description
}
