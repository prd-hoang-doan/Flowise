// UI-only sentinel for "the tree root". Never sent to the backend — use
// `null` for `parent_id` on the wire.
export const SKILL_V2_ROOT_ID = 'root'

export const PRESET_COLORS = [
    '#FF6B6B',
    '#FF8E53',
    '#FFC93C',
    '#6BCB77',
    '#4D96FF',
    '#9B59B6',
    '#E056A0',
    '#00B4D8',
    '#2D6A4F',
    '#5C4742',
    '#264653',
    '#7209B7'
]

// Extension → compiler "kind" bucket (mirrors
// packages/server/src/services/skills-v2/utils/tree.ts classifyKind).
export const EXT_KIND = {
    md: 'skill',
    markdown: 'skill',
    txt: 'data',
    json: 'data',
    csv: 'data',
    yaml: 'data',
    yml: 'data',
    xml: 'data',
    tsv: 'data',
    py: 'code',
    js: 'code',
    ts: 'code',
    tsx: 'code',
    jsx: 'code',
    mjs: 'code',
    sh: 'code',
    bash: 'code',
    go: 'code',
    rb: 'code',
    java: 'code',
    kt: 'code',
    rs: 'code',
    c: 'code',
    cpp: 'code',
    h: 'code',
    hpp: 'code',
    png: 'binary',
    jpg: 'binary',
    jpeg: 'binary',
    gif: 'binary',
    webp: 'binary',
    svg: 'binary',
    pdf: 'binary',
    mp4: 'binary',
    webm: 'binary',
    mp3: 'binary',
    wav: 'binary',
    zip: 'binary'
}

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
export const VIDEO_EXTS = new Set(['mp4', 'webm'])
export const PDF_EXTS = new Set(['pdf'])
export const TEXT_EXTS = new Set(['txt', 'json', 'csv', 'yaml', 'yml', 'xml', 'tsv'])
export const CODE_EXTS = new Set([
    'py',
    'js',
    'ts',
    'tsx',
    'jsx',
    'mjs',
    'sh',
    'bash',
    'go',
    'rb',
    'java',
    'kt',
    'rs',
    'c',
    'cpp',
    'h',
    'hpp'
])
export const MARKDOWN_EXTS = new Set(['md', 'markdown'])

// Autosave debounce (ms). Matches v1 SkillFolderEditorDialog cadence.
export const AUTOSAVE_DELAY_MS = 1500

// The compiler emits this literal when a placeholder cannot be resolved.
// The Preview / Validate flows count it.
export const BROKEN_REF_MARKER = '[SKILL_V2_BROKEN_REFERENCE]'
