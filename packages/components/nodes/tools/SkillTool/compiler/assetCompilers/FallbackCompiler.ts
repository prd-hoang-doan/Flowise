import { IAssetCompiler, NormalizedAsset, AssetCompileResult } from '../types'

export class FallbackCompiler implements IAssetCompiler {
    readonly category = 'Other'
    readonly mimePatterns: string[] = []

    matches(): boolean {
        return true
    }

    compileSummary(asset: NormalizedAsset): AssetCompileResult {
        if (!asset.caption) return {}
        return { textBlock: `- ${asset.filename} → ${asset.caption}` }
    }

    compileMultimodal(asset: NormalizedAsset): AssetCompileResult {
        if (!asset.caption) return {}
        return { multimodalPayload: [{ type: 'text', text: `${asset.category}: ${asset.filename} → ${asset.caption}` }] }
    }
}
