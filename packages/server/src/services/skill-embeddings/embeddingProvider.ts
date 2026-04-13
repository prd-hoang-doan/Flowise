import { ICommonObject } from 'flowise-components'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { databaseEntities } from '../../utils'
import logger from '../../utils/logger'

export interface EmbeddingModelConfig {
    name: string
    label?: string
    inputs?: ICommonObject
    credential?: string
    [key: string]: any
}

/**
 * Create an embedding model instance from the stored config.
 * Reuses the Flowise nodesPool pattern (same as captionService).
 */
export async function createEmbeddingInstance(config: EmbeddingModelConfig): Promise<{
    embedDocuments: (texts: string[]) => Promise<number[][]>
    embedQuery: (text: string) => Promise<number[]>
}> {
    const appServer = getRunningExpressApp()
    const nodeInstanceFilePath = appServer.nodesPool.componentNodes[config.name].filePath as string
    const nodeModule = await import(nodeInstanceFilePath)
    const newNodeInstance = new nodeModule.nodeClass()

    const nodeData = {
        credential: config.credential || config.inputs?.['FLOWISE_CREDENTIAL_ID'] || undefined,
        inputs: config.inputs || {},
        id: `${config.name}_embedding`
    }
    const options: ICommonObject = {
        appDataSource: appServer.AppDataSource,
        databaseEntities,
        logger
    }

    const embeddingInstance = await newNodeInstance.init(nodeData, '', options)
    return embeddingInstance
}
