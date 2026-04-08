import fs from 'fs'
import { IAssetCompiler, NormalizedAsset, CompileConfig, AssetCompileResult } from '../types'

export class DataCompiler implements IAssetCompiler {
    readonly category = 'Data'
    readonly mimePatterns = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml', 'application/vnd.ms-excel']

    matches(mimeType: string): boolean {
        return this.mimePatterns.some((p) => mimeType.startsWith(p))
    }

    compileSummary(asset: NormalizedAsset): AssetCompileResult {
        if (!asset.caption) return {}
        return { textBlock: `- ${asset.filename} → ${asset.caption}` }
    }

    compileMultimodal(asset: NormalizedAsset, config: CompileConfig): AssetCompileResult {
        const text = this.readDataText(asset.storagePath, asset.mimeType, config.maxDocumentChars)
        if (text) {
            return { multimodalPayload: [{ type: 'text', text: `Document: ${asset.filename}\n${text}` }] }
        }
        if (asset.caption) {
            return { multimodalPayload: [{ type: 'text', text: `Data: ${asset.filename} → ${asset.caption}` }] }
        }
        return {}
    }

    private readDataText(filePath: string, mimeType: string, maxChars: number): string | null {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null
            if (!mimeType.startsWith('text/csv')) return null

            const text = fs.readFileSync(filePath, 'utf-8')
            return text.length > maxChars ? text.slice(0, maxChars) + '\n… (truncated)' : text
        } catch {
            return null
        }
    }
}
