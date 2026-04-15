/**
 * Standalone embedding adapter that creates LangChain embedding instances
 * directly from model config, without depending on server-side nodesPool.
 *
 * Credential resolution requires the `options` bag (appDataSource + databaseEntities)
 * which is available at getTools() time in the SkillTool node.
 */

import { ICommonObject } from '../../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../../src/utils'

export interface EmbeddingInstance {
    embedDocuments: (texts: string[]) => Promise<number[][]>
    embedQuery: (text: string) => Promise<number[]>
}

/**
 * Create an embedding model instance directly from a stored config object.
 *
 * @param config - Flowise node data (name, inputs, credential) as persisted in SkillFolder.embeddingModelConfig
 * @param options - Must include appDataSource + databaseEntities for credential decryption
 */
export async function createEmbeddingInstance(config: ICommonObject, options: ICommonObject): Promise<EmbeddingInstance> {
    const credentialId = config.credential || config.inputs?.FLOWISE_CREDENTIAL_ID || ''
    const credentialData = await getCredentialData(credentialId, options)
    const inputs = config.inputs || {}

    switch (config.name) {
        case 'openAIEmbeddings': {
            const { OpenAIEmbeddings } = await import('@langchain/openai')
            const obj: any = {
                openAIApiKey: getCredentialParam('openAIApiKey', credentialData, { inputs } as any),
                modelName: inputs.modelName
            }
            if (inputs.stripNewLines) obj.stripNewLines = inputs.stripNewLines
            if (inputs.batchSize) obj.batchSize = parseInt(inputs.batchSize, 10)
            if (inputs.timeout) obj.timeout = parseInt(inputs.timeout, 10)
            if (inputs.dimensions) obj.dimensions = parseInt(inputs.dimensions, 10)
            if (inputs.encodingFormat) obj.encodingFormat = inputs.encodingFormat
            if (inputs.basepath || inputs.baseOptions) {
                let parsedBaseOptions: any
                if (inputs.baseOptions) {
                    try {
                        parsedBaseOptions = typeof inputs.baseOptions === 'object' ? inputs.baseOptions : JSON.parse(inputs.baseOptions)
                    } catch {
                        /* ignore */
                    }
                }
                obj.configuration = {
                    baseURL: inputs.basepath,
                    defaultHeaders: parsedBaseOptions
                }
            }
            return new OpenAIEmbeddings(obj)
        }

        case 'openAIEmbeddingsCustom': {
            const { OpenAIEmbeddings } = await import('@langchain/openai')
            const obj: any = {
                openAIApiKey: getCredentialParam('openAIApiKey', credentialData, { inputs } as any),
                modelName: inputs.modelName
            }
            if (inputs.basepath) {
                obj.configuration = { baseURL: inputs.basepath }
            }
            if (inputs.stripNewLines) obj.stripNewLines = inputs.stripNewLines
            if (inputs.batchSize) obj.batchSize = parseInt(inputs.batchSize, 10)
            if (inputs.timeout) obj.timeout = parseInt(inputs.timeout, 10)
            if (inputs.dimensions) obj.dimensions = parseInt(inputs.dimensions, 10)
            return new OpenAIEmbeddings(obj)
        }

        case 'azureOpenAIEmbeddings': {
            const { OpenAIEmbeddings } = await import('@langchain/openai')
            const obj: any = {
                azureOpenAIApiKey: getCredentialParam('azureOpenAIApiKey', credentialData, { inputs } as any),
                azureOpenAIApiInstanceName: getCredentialParam('azureOpenAIApiInstanceName', credentialData, { inputs } as any),
                azureOpenAIApiDeploymentName: getCredentialParam('azureOpenAIApiDeploymentName', credentialData, { inputs } as any),
                azureOpenAIApiVersion: getCredentialParam('azureOpenAIApiVersion', credentialData, { inputs } as any),
                modelName: inputs.modelName
            }
            if (inputs.batchSize) obj.batchSize = parseInt(inputs.batchSize, 10)
            if (inputs.timeout) obj.timeout = parseInt(inputs.timeout, 10)
            if (inputs.stripNewLines) obj.stripNewLines = inputs.stripNewLines
            return new OpenAIEmbeddings(obj)
        }

        case 'ollamaEmbedding': {
            const { OllamaEmbeddings } = await import('@langchain/ollama')
            const obj: any = {
                model: inputs.modelName,
                baseUrl: inputs.baseUrl || 'http://localhost:11434'
            }
            const requestOptions: any = {}
            if (inputs.numThread) requestOptions.numThread = parseFloat(inputs.numThread)
            if (inputs.numGpu) requestOptions.numGpu = parseFloat(inputs.numGpu)
            requestOptions.useMmap = inputs.useMMap ?? true
            if (Object.keys(requestOptions).length) obj.requestOptions = requestOptions
            return new OllamaEmbeddings(obj)
        }

        case 'cohereEmbeddings': {
            const { CohereEmbeddings } = await import('@langchain/cohere')
            const obj: any = {
                apiKey: getCredentialParam('cohereApiKey', credentialData, { inputs } as any)
            }
            if (inputs.modelName) obj.model = inputs.modelName
            if (inputs.inputType) obj.inputType = inputs.inputType
            return new CohereEmbeddings(obj)
        }

        case 'mistralAIEmbeddings': {
            const { MistralAIEmbeddings } = await import('@langchain/mistralai')
            const obj: any = {
                apiKey: getCredentialParam('mistralAIAPIKey', credentialData, { inputs } as any),
                modelName: inputs.modelName
            }
            if (inputs.batchSize) obj.batchSize = parseInt(inputs.batchSize, 10)
            if (inputs.stripNewLines) obj.stripNewLines = inputs.stripNewLines
            if (inputs.overrideEndpoint) obj.endpoint = inputs.overrideEndpoint
            return new MistralAIEmbeddings(obj)
        }

        // case 'googleGenerativeAiEmbeddings': {
        //     const { GoogleGenerativeAIEmbeddings, TaskType } = await import('@langchain/google-genai')
        //     const apiKey = getCredentialParam('googleGenerativeAPIKey', credentialData, { inputs } as any)
        //     const obj: any = {
        //         apiKey,
        //         modelName: inputs.modelName || 'gemini-embedding-001'
        //     }
        //     if (inputs.stripNewLines) obj.stripNewLines = inputs.stripNewLines
        //     if (inputs.tasktype) {
        //         const taskTypeMap: Record<string, any> = {
        //             RETRIEVAL_QUERY: TaskType.RETRIEVAL_QUERY,
        //             RETRIEVAL_DOCUMENT: TaskType.RETRIEVAL_DOCUMENT,
        //             SEMANTIC_SIMILARITY: TaskType.SEMANTIC_SIMILARITY,
        //             CLASSIFICATION: TaskType.CLASSIFICATION,
        //             CLUSTERING: TaskType.CLUSTERING,
        //             TASK_TYPE_UNSPECIFIED: TaskType.TASK_TYPE_UNSPECIFIED
        //         }
        //         obj.taskType = taskTypeMap[inputs.tasktype] ?? TaskType.TASK_TYPE_UNSPECIFIED
        //     }
        //     return new GoogleGenerativeAIEmbeddings(obj)
        // }

        case 'huggingFaceInferenceEmbeddings': {
            const { HuggingFaceInferenceEmbeddings } = await import('../../../../nodes/embeddings/HuggingFaceInferenceEmbedding/core')
            const obj: any = {
                apiKey: getCredentialParam('huggingFaceApiKey', credentialData, { inputs } as any)
            }
            if (inputs.modelName) obj.model = inputs.modelName
            if (inputs.endpoint) obj.endpoint = inputs.endpoint
            return new HuggingFaceInferenceEmbeddings(obj)
        }

        case 'localAIEmbeddings': {
            const { OpenAIEmbeddings } = await import('@langchain/openai')
            const obj: any = {
                openAIApiKey: getCredentialParam('localAIApiKey', credentialData, { inputs } as any) || 'sk-not-needed',
                modelName: inputs.modelName
            }
            if (inputs.basePath) {
                obj.configuration = { baseURL: inputs.basePath }
            }
            return new OpenAIEmbeddings(obj)
        }

        default:
            throw new Error(
                `Unsupported embedding model "${config.name}". ` +
                    `Supported: openAIEmbeddings, openAIEmbeddingsCustom, azureOpenAIEmbeddings, ` +
                    `ollamaEmbedding, cohereEmbeddings, mistralAIEmbeddings, googleGenerativeAiEmbeddings, ` +
                    `huggingFaceInferenceEmbeddings, localAIEmbeddings`
            )
    }
}
