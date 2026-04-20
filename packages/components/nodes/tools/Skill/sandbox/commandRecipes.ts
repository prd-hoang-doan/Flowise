/**
 * Skill V2 — per-file command recipes.
 *
 * Skill authors typically write natural-language prose that points at a
 * file ("Execute the scripts at ./scoring-algorithm.js", "Job description
 * at ./job-description.txt") rather than the literal shell command the
 * LLM has to issue. The model is supposed to infer "…so run `node` on
 * it" or "…so `cat` it", but that inference step is flaky under pressure
 * — especially for Python / Ruby / shell scripts where multiple
 * conventions exist.
 *
 * This module centralises that inference into a small registry keyed on
 * file extension. The output is consumed in two places:
 *
 *   1. `buildBashToolDescription` — renders a top-level "Suggested
 *      invocations" block so the bash tool's own description carries a
 *      cheat-sheet for every reachable file.
 *
 *   2. `buildToolHint` — appends a per-reference recipe block to each
 *      skill-file tool's response, so the LLM sees the exact command
 *      right next to the prose that referenced the file.
 *
 * Design constraints:
 *   - Pure, I/O-free, deterministic: same manifest → same text.
 *   - No attempt to run the command; we only *describe* it. The sandbox
 *     can still reject anything that isn't on PATH.
 *   - Extensible: adding a new language is a one-liner in `RECIPES`.
 */

import type { SandboxManifest, SandboxManifestEntry } from './SandboxManifest'
import { absolutePath } from './SandboxManifest'
import type { SkillBundleEntry, SkillKind } from '../utils'

/** The five invocation families we recognise today. */
export type RecipeFamily = 'exec-node' | 'exec-python' | 'exec-shell' | 'exec-ruby' | 'read-text' | 'read-binary'

export interface CommandRecipe {
    family: RecipeFamily
    /** Short human label used in grouped headings. */
    label: string
    /**
     * Template for the command. `{path}` is replaced with the absolute
     * VM path; `{args}` is replaced with a trailing `[args…]` hint when
     * the recipe accepts arguments, or removed otherwise.
     */
    template: string
    /**
     * One-line description surfaced in the bash tool's description. Kept
     * short — the LLM doesn't need justification, just the incantation.
     */
    description: string
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const EXEC_NODE: CommandRecipe = {
    family: 'exec-node',
    label: 'Execute with Node.js',
    template: 'node {path}{args}',
    description: 'Runs the file under `node` (v20). Accepts positional argv.'
}

const EXEC_PYTHON: CommandRecipe = {
    family: 'exec-python',
    label: 'Execute with Python 3',
    template: 'python3 {path}{args}',
    description: 'Runs the file under `python3`. Accepts positional argv.'
}

const EXEC_SHELL: CommandRecipe = {
    family: 'exec-shell',
    label: 'Execute with bash',
    template: 'bash {path}{args}',
    description: 'Runs the file under `bash`. Accepts positional argv.'
}

const EXEC_RUBY: CommandRecipe = {
    family: 'exec-ruby',
    label: 'Execute with Ruby',
    template: 'ruby {path}{args}',
    description: 'Runs the file under `ruby`. Accepts positional argv.'
}

const READ_TEXT: CommandRecipe = {
    family: 'read-text',
    label: 'Read as text',
    template: 'cat {path}',
    description: 'Streams the file to stdout so the LLM can read it inline.'
}

const READ_BINARY: CommandRecipe = {
    family: 'read-binary',
    label: 'Inspect binary',
    template: 'file {path}',
    description:
        'Binary asset — start with `file` to learn the type, then use the right tool (`pdftotext`, `unzip`, `base64 -w0`, …) depending on the format.'
}

/**
 * Ordered for stable rendering: exec families first (loudest signal),
 * then reads, then binary fallbacks.
 */
export const RECIPE_ORDER: RecipeFamily[] = ['exec-node', 'exec-python', 'exec-shell', 'exec-ruby', 'read-text', 'read-binary']

const BY_EXT: Record<string, CommandRecipe> = {
    js: EXEC_NODE,
    mjs: EXEC_NODE,
    cjs: EXEC_NODE,

    py: EXEC_PYTHON,

    sh: EXEC_SHELL,
    bash: EXEC_SHELL,

    rb: EXEC_RUBY,

    txt: READ_TEXT,
    md: READ_TEXT,
    markdown: READ_TEXT,
    json: READ_TEXT,
    csv: READ_TEXT,
    tsv: READ_TEXT,
    yaml: READ_TEXT,
    yml: READ_TEXT,
    xml: READ_TEXT,
    html: READ_TEXT,
    log: READ_TEXT
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Return the best-guess recipe for a manifest entry.
 *
 * Resolution order:
 *   1. Exact extension match against `BY_EXT`.
 *   2. `SkillKind` fallback: `code` → node (a reasonable default for the
 *      author to correct), `data` / `skill` → read-text, `binary` →
 *      inspect-binary.
 */
export const recipeForEntry = (entry: SandboxManifestEntry): CommandRecipe => {
    const hit = BY_EXT[entry.extension]
    if (hit) return hit
    return fallbackForKind(entry.kind)
}

const fallbackForKind = (kind: SkillKind): CommandRecipe => {
    switch (kind) {
        case 'code':
            return EXEC_NODE
        case 'data':
        case 'skill':
            return READ_TEXT
        case 'binary':
        default:
            return READ_BINARY
    }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render `recipe.template` into a concrete shell command string. When
 * `argsHint` is provided (e.g. `'<candidate-resume> <job-description>'`)
 * it is substituted for the `{args}` placeholder with a leading space;
 * otherwise the placeholder is dropped. Exec families without an
 * argsHint get a generic ` [args...]` so the LLM remembers it *can*
 * pass arguments.
 */
export const formatRecipeCommand = (recipe: CommandRecipe, absPath: string, argsHint?: string): string => {
    const acceptsArgs = recipe.family.startsWith('exec-')
    const args = argsHint ? ` ${argsHint}` : acceptsArgs ? ' [args...]' : ''
    return recipe.template.replace('{path}', absPath).replace('{args}', args)
}

/**
 * Group manifest entries by their recipe family. Preserves the insertion
 * order defined by `RECIPE_ORDER` so rendering is stable between runs.
 */
export const groupByRecipeFamily = (
    entries: readonly SandboxManifestEntry[]
): Array<{ family: RecipeFamily; recipe: CommandRecipe; entries: SandboxManifestEntry[] }> => {
    const buckets = new Map<RecipeFamily, { recipe: CommandRecipe; entries: SandboxManifestEntry[] }>()
    for (const entry of entries) {
        const recipe = recipeForEntry(entry)
        const bucket = buckets.get(recipe.family) ?? { recipe, entries: [] }
        bucket.entries.push(entry)
        buckets.set(recipe.family, bucket)
    }
    return RECIPE_ORDER.filter((fam) => buckets.has(fam)).map((fam) => ({
        family: fam,
        recipe: buckets.get(fam)!.recipe,
        entries: buckets.get(fam)!.entries
    }))
}

// ---------------------------------------------------------------------------
// Per-skill helper block
// ---------------------------------------------------------------------------

/**
 * For one skill bundle entry, walk its `files.references` and render a
 * human-readable recipe line for each reachable file, addressed via the
 * concrete bash tool name so the LLM can copy-paste the JSON call.
 *
 * Returns an empty array when the skill has no materialised references;
 * the caller can then skip injecting the helper section entirely.
 */
export const renderReferenceRecipes = (
    entry: SkillBundleEntry,
    manifest: SandboxManifest,
    nodeIdIndex: Map<string, SandboxManifestEntry>,
    bashToolName: string
): string[] => {
    const refs = (entry.files?.references ?? []) as Array<{ nodeId?: string }>
    if (!refs.length) return []

    const seen = new Set<string>()
    const lines: string[] = []
    for (const ref of refs) {
        if (!ref || typeof ref.nodeId !== 'string') continue
        if (seen.has(ref.nodeId)) continue
        seen.add(ref.nodeId)

        const target = nodeIdIndex.get(ref.nodeId)
        if (!target) continue

        const recipe = recipeForEntry(target)
        const command = formatRecipeCommand(recipe, absolutePath(manifest, target))
        lines.push(`- ./${target.relPath} — ${recipe.label.toLowerCase()}: call \`${bashToolName}\` with {"command": "${command}"}`)
    }
    return lines
}
