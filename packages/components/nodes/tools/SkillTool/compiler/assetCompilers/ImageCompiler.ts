import fs from 'fs'
import { IAssetCompiler, NormalizedAsset, CompileConfig, AssetCompileResult } from '../types'

export class ImageCompiler implements IAssetCompiler {
    readonly category = 'Images'
    readonly mimePatterns = ['image/']

    matches(mimeType: string): boolean {
        return this.mimePatterns.some((p) => mimeType.startsWith(p))
    }

    compileSummary(asset: NormalizedAsset): AssetCompileResult {
        if (!asset.caption) return {}
        return { textBlock: `- ${asset.filename} → ${asset.caption}` }
    }

    compileMultimodal(asset: NormalizedAsset, config: CompileConfig): AssetCompileResult {
        const parts = []
        const dataUri = this.readAsDataUri(asset.storagePath, asset.mimeType)

        if (dataUri) {
            if (asset.caption) {
                parts.push({ type: 'text' as const, text: `Image: ${asset.filename} — ${asset.caption}` })
            }
            parts.push({ type: 'image_url' as const, image_url: { url: dataUri } })
        } else if (asset.caption) {
            parts.push({ type: 'text' as const, text: `Image: ${asset.filename} → ${asset.caption}` })
        }

        return parts.length > 0 ? { multimodalPayload: parts } : {}
    }

    private readAsDataUri(filePath: string, mimeType: string): string | null {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null
            const buffer = fs.readFileSync(filePath)
            return `data:${mimeType};base64,${buffer.toString('base64')}`
        } catch {
            return null
        }
    }
}
