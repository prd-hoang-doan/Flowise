import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { IStepRunArgs, IStepRunResult } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { StepRunner } from '../../utils/agentflow-step-debug/StepRunner'

export interface RunStepServiceArgs {
    chatflow: ChatFlow
    args: IStepRunArgs
}

/**
 * Thinnest possible wrapper over StepRunner so the controller can stay
 * Express-aware and the runner can stay framework-free.
 */
const runStep = async ({ chatflow, args }: RunStepServiceArgs): Promise<IStepRunResult> => {
    try {
        const appServer = getRunningExpressApp()
        const runner = new StepRunner({
            chatflow,
            args,
            appDataSource: appServer.AppDataSource,
            componentNodes: appServer.nodesPool.componentNodes,
            cachePool: appServer.cachePool,
            usageCacheManager: appServer.usageCacheManager,
            telemetry: appServer.telemetry,
            sseStreamer: appServer.sseStreamer
        })
        return await runner.run()
    } catch (err) {
        if (err instanceof InternalFlowiseError) throw err
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: stepRunService.runStep - ${getErrorMessage(err)}`)
    }
}

export default {
    runStep
}
