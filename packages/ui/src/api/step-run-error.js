/**
 * Standalone error class for the Step Debugger fetch transport. Lives in
 * its own module so non-browser environments (e.g. Jest with Node) can
 * import it without pulling in `@/store/constant` (which uses Vite's
 * import.meta.env and breaks under CommonJS).
 */
export class StepRunFetchError extends Error {
    constructor({ status, message, code, missingVariables, raw }) {
        super(message || `Step Run failed with status ${status}`)
        this.name = 'StepRunFetchError'
        this.status = status
        this.code = code || null
        this.missingVariables = missingVariables || []
        this.raw = raw
    }
}
