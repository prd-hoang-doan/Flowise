/**
 * Skill v2 runtime-node helpers.
 *
 * These are deliberately copied locally instead of imported from the server
 * package to keep `packages/components` independent of `packages/server`.
 * The shapes mirror `packages/server/src/services/skills-v2/entities.ts` and
 * `packages/server/src/services/skills-v2/utils/tree.ts`.
 */

// ---------------------------------------------------------------------------
// File-tree shapes (subset of the server-side SkillFileTree)
// ---------------------------------------------------------------------------

export type SkillNodeType = 'file' | 'folder'
export type SkillKind = 'skill' | 'data' | 'code' | 'binary'

export interface SkillTreeNode {
    id: string
    node_type: SkillNodeType
    name: string
    parent_id: string | null
    order: number
    extension: string
    size: number
}

export interface SkillFileTree {
    nodes: SkillTreeNode[]
}

// ---------------------------------------------------------------------------
// SkillBundle shapes (subset — only what the runtime node consumes)
// ---------------------------------------------------------------------------

export interface ToolDependency {
    type: string
    provider: string
    toolName: string
}

export interface SkillBundleEntry {
    nodeId: string
    kind: SkillKind
    name: string
    path: string
    content: string
    tools: { dependencies: ToolDependency[]; references: unknown[] }
    files: { references: unknown[] }
    // Optional: carried by bundles produced by SkillV2Compiler. Used by the
    // exec strategy to key its source cache on the published digest so a
    // re-publish invalidates cached sources automatically.
    source?: { nodeId: string; contentDigest: string }
}

export interface SkillBundle {
    schemaVersion: number
    bundleId: string
    workspaceId: string
    skillId: string
    builtAt: string
    entries: Record<string, SkillBundleEntry>
    dependencyGraph: Record<string, string[]>
    reverseGraph: Record<string, string[]>
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/** Map file extension → classification, mirroring `utils/tree.ts#classifyKind`. */
export const classifyKindForTreeNode = (extension: string): SkillKind => {
    const ext = (extension || '').trim().toLowerCase()
    if (ext === 'md' || ext === 'markdown') return 'skill'
    if (['py', 'js', 'ts', 'sh', 'bash', 'rb', 'go', 'java', 'rs', 'cpp', 'c'].includes(ext)) return 'code'
    if (['txt', 'json', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'html', 'log'].includes(ext)) return 'data'
    if (ext === '') return 'data'
    return 'binary'
}

/** Parse the JSON blob stored in `SkillV2.fileTree`. */
export const parseFileTree = (json: string | null | undefined): SkillFileTree => {
    if (!json) return { nodes: [] }
    try {
        const parsed = JSON.parse(json)
        if (!parsed || !Array.isArray(parsed.nodes)) return { nodes: [] }
        return parsed as SkillFileTree
    } catch {
        return { nodes: [] }
    }
}

/** Compute `/`-joined path for a tree node by walking parent links. */
export const computeNodePath = (nodeId: string, tree: SkillFileTree): string => {
    const byId = new Map(tree.nodes.map((n) => [n.id, n]))
    const segments: string[] = []
    const seen = new Set<string>()
    let cur = byId.get(nodeId)
    while (cur) {
        if (seen.has(cur.id)) break
        seen.add(cur.id)
        segments.unshift(cur.name)
        if (cur.parent_id === null) break
        cur = byId.get(cur.parent_id)
    }
    return segments.join('/')
}

// ---------------------------------------------------------------------------
// Tool-name and description formatting
// ---------------------------------------------------------------------------

/** LangChain tool names must match `[a-zA-Z0-9_-]+`. */
export const formatToolName = (name: string): string => (name || 'skill').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'skill'

/**
 * Build the runtime hint block appended to a skill tool's compiled
 * markdown. Returns `null` when there is nothing to add.
 *
 * Sections, in order:
 *   1. "You may also use: [...]" — transitive tool dependencies pulled
 *      from `entry.tools.dependencies`.
 *   2. "Sandbox shell is available…" — one-liner that names the bash
 *      tool and points at the skills / output roots. Only emitted when
 *      `options.bashMode` is supplied.
 *   3. "Execution helpers" — one recipe line per referenced file (e.g.
 *      `./scoring-algorithm.js → node /home/user/skills/...`). Pre-rendered
 *      by the caller so `utils.ts` stays free of sandbox imports; the
 *      concrete renderer lives in `sandbox/commandRecipes.ts#renderReferenceRecipes`.
 *
 * In fallback / read-only mode (no bash tool), the hint reduces back to
 * the tool-dependency line and nothing about execution is promised.
 */
export const buildToolHint = (
    entry: SkillBundleEntry,
    options?: {
        bashMode?: {
            skillsDir: string
            outputDir: string
            /** Concrete tool name (e.g. `bash_Recruiting`) used in the helper block. */
            toolName?: string
        } | null
        /**
         * Pre-rendered per-reference recipe lines (see
         * `renderReferenceRecipes`). When non-empty and bash is active,
         * they are grouped under an "Execution helpers" header.
         */
        recipeLines?: string[]
    }
): string | null => {
    const deps = entry.tools?.dependencies ?? []
    const seen = new Set<string>()
    const labels: string[] = []
    for (const d of deps) {
        const key = `${d.provider}.${d.toolName}`
        if (seen.has(key)) continue
        seen.add(key)
        labels.push(key)
    }
    labels.sort((a, b) => a.localeCompare(b))
    const toolsLine = labels.length ? `You may also use: [${labels.join(', ')}]` : null

    const bashLine = options?.bashMode
        ? `Sandbox shell is available via ${
              options.bashMode.toolName ? `\`${options.bashMode.toolName}\`` : 'the bash tool'
          } — files live under ${options.bashMode.skillsDir}/, write outputs to ${options.bashMode.outputDir}/.`
        : null

    const recipes = options?.bashMode && options.recipeLines?.length ? options.recipeLines : []
    const recipeBlock = recipes.length ? ['Execution helpers — map file references to concrete commands:', ...recipes].join('\n') : null

    const segments = [toolsLine, bashLine, recipeBlock].filter(Boolean) as string[]
    if (!segments.length) return null
    return segments.join('\n\n')
}

/** Extract the first `# Heading` from a markdown body (≤ 300 chars). */
export const extractFirstHeading = (markdown: string): string | null => {
    if (!markdown) return null
    const m = /^#\s+(.+)$/m.exec(markdown)
    if (!m) return null
    const heading = m[1].trim()
    if (!heading) return null
    return heading.length > 300 ? `${heading.slice(0, 297)}...` : heading
}

/** Compose the tool description shown to the LLM. */
export const buildToolDescription = (entry: SkillBundleEntry): string => {
    const base = extractFirstHeading(entry.content) || `Skill: ${entry.name}`
    const deps = entry.tools?.dependencies ?? []
    if (!deps.length) return base
    const seen = new Set<string>()
    const labels: string[] = []
    for (const d of deps) {
        const key = `${d.provider}.${d.toolName}`
        if (seen.has(key)) continue
        seen.add(key)
        labels.push(key)
    }
    if (!labels.length) return base
    labels.sort((a, b) => a.localeCompare(b))
    return `${base}. Depends on: ${labels.join(', ')}`
}
