export interface MultimodalContentPart {
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
}

export const MULTIMODAL_CONTENT_KEY = '__multimodal'

// --- Stage A: Load ---

export interface SkillFileInput {
    id: string
    name: string
    description?: string
    content?: string
}

export interface SkillAssetInput {
    id: string
    fileId: string
    filename: string
    mimeType: string
    storagePath: string
    caption?: string
}

export interface CompileConfig {
    executionMode: 'summary' | 'multimodal'
    maxAssetContext: number
    maxMultimodalAssets: number
    maxDocumentChars: number
}

export const DEFAULT_COMPILE_CONFIG: CompileConfig = {
    executionMode: 'summary',
    maxAssetContext: 2000,
    maxMultimodalAssets: 5,
    maxDocumentChars: 5000
}

export interface SkillRuntimeInput {
    skillId: string
    name: string
    description: string
    instructions: string
    files: SkillFileInput[]
    assets: SkillAssetInput[]
    executionMode: 'summary' | 'multimodal'
    config: CompileConfig
}

// --- Stage B: Normalize ---

export interface NormalizedSkill {
    header: { name: string; version?: string }
    role: string
    behavior: string[]
    knowledge: string[]
    assets: NormalizedAsset[]
    runtimeRules: string[]
}

export interface NormalizedAsset {
    id: string
    fileId: string
    filename: string
    mimeType: string
    storagePath: string
    caption: string
    category: string
}

// --- Stage C: Compile Assets ---

export interface AssetCompileResult {
    textBlock?: string
    multimodalPayload?: MultimodalContentPart[]
}

export interface IAssetCompiler {
    readonly category: string
    readonly mimePatterns: string[]
    matches(mimeType: string): boolean
    compileSummary(asset: NormalizedAsset, config: CompileConfig): AssetCompileResult
    compileMultimodal(asset: NormalizedAsset, config: CompileConfig): AssetCompileResult
}

// --- Stage D: Render ---

export interface SkillMetadata {
    skillName: string
    fileCount: number
    assetSummary: { category: string; count: number }[]
    executionMode: string
    compiledAt: string
    sections: string[]
}

export interface CompiledSkillOutput {
    compiledPrompt: string
    multimodalPayload: MultimodalContentPart[]
    metadata: SkillMetadata
    tokenEstimate: number
    hash: string
}
