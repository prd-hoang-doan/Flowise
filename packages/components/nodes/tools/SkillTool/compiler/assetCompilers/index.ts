import { IAssetCompiler, NormalizedAsset } from '../types'
import { ImageCompiler } from './ImageCompiler'
import { DocumentCompiler } from './DocumentCompiler'
import { DataCompiler } from './DataCompiler'
import { FallbackCompiler } from './FallbackCompiler'

export class AssetCompilerRegistry {
    private compilers: IAssetCompiler[] = []
    private fallback: IAssetCompiler

    constructor() {
        this.fallback = new FallbackCompiler()
        this.register(new ImageCompiler())
        this.register(new DocumentCompiler())
        this.register(new DataCompiler())
    }

    register(compiler: IAssetCompiler): void {
        this.compilers.push(compiler)
    }

    resolve(mimeType: string): IAssetCompiler {
        for (const compiler of this.compilers) {
            if (compiler.matches(mimeType)) return compiler
        }
        return this.fallback
    }

    categorize(asset: NormalizedAsset): string {
        return this.resolve(asset.mimeType).category
    }

    static readonly CATEGORY_ORDER = ['Images', 'Documents', 'Data', 'Other']
}

export { ImageCompiler, DocumentCompiler, DataCompiler, FallbackCompiler }
