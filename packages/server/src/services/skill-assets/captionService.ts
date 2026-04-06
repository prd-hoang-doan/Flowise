import fs from 'fs'
import path from 'path'
import { HumanMessage } from '@langchain/core/messages'
import { ICommonObject } from 'flowise-components'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { databaseEntities } from '../../utils'
import logger from '../../utils/logger'

const VISION_CAPTION_PROMPT = 'Describe this image in one concise sentence for use as context in an AI tool prompt.'

const generateFallbackCaption = (filename: string): string => {
    const name = filename.replace(/\.[^.]+$/, '')
    const readable = name.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
    return `Image: ${readable}`
}

const imageToBase64DataUri = (filePath: string, mimeType: string): string | null => {
    try {
        if (!fs.existsSync(filePath)) return null
        const buffer = fs.readFileSync(filePath)
        const base64 = buffer.toString('base64')
        return `data:${mimeType};base64,${base64}`
    } catch {
        return null
    }
}

/**
 * Generate a vision-LLM caption for an image asset.
 * Falls back to generateFallbackCaption() if no model is configured or the call fails.
 */
const generateVisionCaption = async (filePath: string, mimeType: string, captionModelConfig: ICommonObject | null): Promise<string> => {
    const filename = path.basename(filePath)

    if (!captionModelConfig || !captionModelConfig.name) {
        return generateFallbackCaption(filename)
    }

    const dataUri = imageToBase64DataUri(filePath, mimeType)
    if (!dataUri) {
        return generateFallbackCaption(filename)
    }

    try {
        const appServer = getRunningExpressApp()
        const nodeInstanceFilePath = appServer.nodesPool.componentNodes[captionModelConfig.name].filePath as string
        const nodeModule = await import(nodeInstanceFilePath)
        const newNodeInstance = new nodeModule.nodeClass()

        const nodeData = {
            credential: captionModelConfig.credential || captionModelConfig.inputs?.['FLOWISE_CREDENTIAL_ID'] || undefined,
            inputs: captionModelConfig.inputs || {},
            id: `${captionModelConfig.name}_caption`
        }
        const options: ICommonObject = {
            appDataSource: appServer.AppDataSource,
            databaseEntities,
            logger
        }

        const llmInstance = await newNodeInstance.init(nodeData, '', options)

        const message = new HumanMessage({
            content: [
                { type: 'text', text: VISION_CAPTION_PROMPT },
                { type: 'image_url', image_url: { url: dataUri } }
            ]
        })

        const response = await llmInstance.invoke([message])
        const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)

        if (content && content.trim()) {
            return content.trim()
        }
        return generateFallbackCaption(filename)
    } catch (error) {
        logger.error(`Vision captioning failed for ${filename}, using fallback: ${error}`)
        return generateFallbackCaption(filename)
    }
}

export default {
    generateFallbackCaption,
    imageToBase64DataUri,
    generateVisionCaption
}
