import stepRunService from './stepRunService'
import debugVariableService from './debugVariableService'
import debugNodeExecutionService from './debugNodeExecutionService'

export { stepRunService, debugVariableService, debugNodeExecutionService }

export default {
    ...stepRunService,
    ...debugVariableService,
    ...debugNodeExecutionService
}
