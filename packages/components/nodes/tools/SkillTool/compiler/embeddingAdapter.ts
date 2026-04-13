/**
 * Lightweight embedding adapter for use inside SkillFileTool._call().
 * Creates an embedding model instance from the Flowise nodesPool at runtime.
 *
 * This module is dynamically imported only when embedding generation is needed.
 */

import { ICommonObject } from '../../../../src/Interface'

/**
 * Create an embedding model instance from a stored config object.
 * The config follows the same shape as captionModelConfig (serialized node data).
 */
export async function createEmbeddingInstance(config: ICommonObject): Promise<{
    embedDocuments: (texts: string[]) => Promise<number[][]>
    embedQuery: (text: string) => Promise<number[]>
}> {
    // Access the running server to get the nodesPool — dynamic imports resolved at runtime only
    // @ts-ignore - cross-package dynamic import, resolved at runtime in server process
    const { getRunningExpressApp } = await import(/* webpackIgnore: true */ '../../../../server/src/utils/getRunningExpressApp')
    // @ts-ignore - cross-package dynamic import, resolved at runtime in server process
    const { databaseEntities } = await import(/* webpackIgnore: true */ '../../../../server/src/utils')
    // @ts-ignore - cross-package dynamic import, resolved at runtime in server process
    const { default: logger } = await import(/* webpackIgnore: true */ '../../../../server/src/utils/logger')

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

    return await newNodeInstance.init(nodeData, '', options)
}
