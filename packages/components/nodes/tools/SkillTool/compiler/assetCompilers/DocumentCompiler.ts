import fs from 'fs'
import { IAssetCompiler, NormalizedAsset, CompileConfig, AssetCompileResult } from '../types'

const READABLE_TEXT_MIMES = ['text/plain', 'text/html', 'text/csv', 'text/markdown']

export class DocumentCompiler implements IAssetCompiler {
    readonly category = 'Documents'
    readonly mimePatterns = [
        'application/pdf',
        'text/html',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml'
    ]

    matches(mimeType: string): boolean {
        return this.mimePatterns.some((p) => mimeType.startsWith(p))
    }

    compileSummary(asset: NormalizedAsset): AssetCompileResult {
        if (!asset.caption) return {}
        return { textBlock: `- ${asset.filename} → ${asset.caption}` }
    }

    compileMultimodal(asset: NormalizedAsset, config: CompileConfig): AssetCompileResult {
        const text = this.readDocumentText(asset.storagePath, asset.mimeType, config.maxDocumentChars)
        if (text) {
            return { multimodalPayload: [{ type: 'text', text: `Document: ${asset.filename}\n${text}` }] }
        }
        if (asset.caption) {
            return { multimodalPayload: [{ type: 'text', text: `Documents: ${asset.filename} → ${asset.caption}` }] }
        }
        return {}
    }

    private readDocumentText(filePath: string, mimeType: string, maxChars: number): string | null {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null
            if (!READABLE_TEXT_MIMES.some((m) => mimeType.startsWith(m))) return null

            let text = fs.readFileSync(filePath, 'utf-8')

            if (mimeType === 'text/html') {
                text = text
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
            }

            return text.length > maxChars ? text.slice(0, maxChars) + '\n… (truncated)' : text
        } catch {
            return null
        }
    }
}
