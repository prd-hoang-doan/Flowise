import { Response } from 'express'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import deepAgentsService from '../../services/deep-agents'
import { DeepAgentStepStatus } from '../../Interface'
import { getErrorMessage } from '../../errors/utils'
import { createResearchAgent } from './deep-agent'
import { type FileData } from 'deepagents'
import logger from '../../utils/logger'

/**
 * DeepAgentOrchestratorV2 — Powered by the `deepagents` LangChain Framework
 *
 * Replaces the custom planning/tool/artifact loop with:
 * - `createResearchAgent()` from deep-agent.ts (ChatOpenAI + Tavily + sub-agents)
 * - `agent.streamEvents()` v2 for fine-grained, real-time SSE updates
 * - Framework-managed todo list → mapped to DeepAgentStep DB entities
 * - Framework file system (`final_report.md`) → mapped to DeepAgentArtifact
 *
 * Public API is identical to the original DeepAgentOrchestrator so the controller
 * (`index.ts`) requires no changes.
 */

type SSEClient = { response: Response }

interface TodoItem {
    content: string
    status: 'pending' | 'in_progress' | 'completed'
}

// Status mapping from deepagents framework todos → DB DeepAgentStepStatus
const TODO_STATUS_MAP: Record<TodoItem['status'], DeepAgentStepStatus> = {
    pending: 'PENDING',
    in_progress: 'RUNNING',
    completed: 'COMPLETED'
}

class DeepAgentOrchestratorV2 {
    private clients: Map<string, SSEClient[]> = new Map()
    private cancelledSessions: Set<string> = new Set()
    private abortControllers: Map<string, AbortController> = new Map()

    // ==============================|| SSE CLIENT MANAGEMENT ||============================== //

    addClient(sessionId: string, res: Response) {
        const existing = this.clients.get(sessionId) || []
        existing.push({ response: res })
        this.clients.set(sessionId, existing)
    }

    removeClient(sessionId: string, res: Response) {
        const existing = this.clients.get(sessionId)
        if (!existing) return
        const filtered = existing.filter((c) => c.response !== res)
        if (filtered.length === 0) {
            this.clients.delete(sessionId)
        } else {
            this.clients.set(sessionId, filtered)
        }
    }

    private sendSSE(sessionId: string, event: string, data: any) {
        const clients = this.clients.get(sessionId)
        if (!clients || clients.length === 0) return

        const payload = JSON.stringify({ event, data })
        const toRemove: SSEClient[] = []

        for (const client of clients) {
            try {
                client.response.write(`data: ${payload}\n\n`)
            } catch {
                toRemove.push(client)
            }
        }

        if (toRemove.length > 0) {
            const filtered = clients.filter((c) => !toRemove.includes(c))
            if (filtered.length === 0) {
                this.clients.delete(sessionId)
            } else {
                this.clients.set(sessionId, filtered)
            }
        }
    }

    // ==============================|| CANCELLATION ||============================== //

    cancelExecution(sessionId: string) {
        this.cancelledSessions.add(sessionId)
        const ac = this.abortControllers.get(sessionId)
        if (ac) ac.abort()
    }

    private isCancelled(sessionId: string): boolean {
        return this.cancelledSessions.has(sessionId)
    }

    // ==============================|| MAIN EXECUTION ENTRY POINT ||============================== //

    async execute(sessionId: string, userPrompt: string, workspaceId: string): Promise<void> {
        this.cancelledSessions.delete(sessionId)
        const abortController = new AbortController()
        this.abortControllers.set(sessionId, abortController)

        try {
            await deepAgentsService.updateSessionStatus(sessionId, 'RUNNING', workspaceId)
            this.sendSSE(sessionId, 'status', { status: 'RUNNING' })

            await this.runAgent(sessionId, userPrompt, workspaceId, abortController)

            if (this.isCancelled(sessionId)) {
                return await this.handleCancellation(sessionId, workspaceId)
            }
        } catch (error) {
            if (this.isCancelled(sessionId)) {
                return await this.handleCancellation(sessionId, workspaceId)
            }

            logger.error(`[DeepAgentOrchestratorV2] Session ${sessionId} failed: ${getErrorMessage(error)}`)
            try {
                await deepAgentsService.addMessage(sessionId, 'assistant', `Research execution failed: ${getErrorMessage(error)}`)
                await deepAgentsService.updateSessionStatus(sessionId, 'FAILED', workspaceId)
            } catch {
                // Best effort
            }
            this.sendSSE(sessionId, 'error', { message: getErrorMessage(error) })
            this.sendSSE(sessionId, 'status', { status: 'FAILED' })
        } finally {
            this.cancelledSessions.delete(sessionId)
            this.abortControllers.delete(sessionId)
        }
    }

    private async handleCancellation(sessionId: string, workspaceId: string): Promise<void> {
        logger.info(`[DeepAgentOrchestratorV2] Session ${sessionId} cancelled by user`)
        await deepAgentsService.updateSessionStatus(sessionId, 'CANCELLED', workspaceId)
        this.sendSSE(sessionId, 'status', { status: 'CANCELLED' })
        this.cancelledSessions.delete(sessionId)
    }

    // ==============================|| CONVERSATION MEMORY ||============================== //

    /**
     * Loads previous messages from the DB and converts them to LangChain BaseMessage objects.
     * Excludes the most recent user message (the current `userPrompt` already handled by the caller).
     */
    private async buildConversationHistory(sessionId: string): Promise<BaseMessage[]> {
        const dbMessages = await deepAgentsService.getMessagesBySessionId(sessionId)

        // The controller already saved the current user message before calling execute(),
        // so the last message in DB is the current prompt. We include everything *before* it
        // as history, and the current prompt is appended separately.
        const history = dbMessages.slice(0, -1)

        return history.map((msg) => {
            switch (msg.role) {
                case 'user':
                    return new HumanMessage(msg.content)
                case 'assistant':
                    return new AIMessage(msg.content)
                default:
                    // system / tool messages → treat as AI context
                    return new AIMessage(msg.content)
            }
        })
    }

    /**
     * Builds initial file state from the latest artifact so the agent can read/edit
     * the existing report without starting from scratch.
     */
    private buildInitialFiles(artifactContent: string | null): Record<string, FileData> | undefined {
        if (!artifactContent) return undefined

        const now = new Date().toISOString()
        return {
            '/final_report.md': {
                content: artifactContent.split('\n'),
                created_at: now,
                modified_at: now
            }
        }
    }

    // ==============================|| AGENT STREAMING LOOP ||============================== //

    private async runAgent(sessionId: string, userPrompt: string, workspaceId: string, abortController: AbortController): Promise<void> {
        const agent = createResearchAgent()

        // State tracked across stream events
        // Maps todo content string → DB step id (todos have no stable id from the framework)
        const todoToStepId = new Map<string, string>()
        let previousTodos: TodoItem[] = []
        let reportContent = ''
        let artifactId: string | null = null
        let stepCounter = 0

        // ── Load conversation memory ────────────────────────────────────────
        const conversationHistory = await this.buildConversationHistory(sessionId)
        const messages: BaseMessage[] = [...conversationHistory, new HumanMessage(userPrompt)]

        logger.info(`[DeepAgentOrchestratorV2] Session ${sessionId} starting stream ` + `(${conversationHistory.length} history messages)`)

        // ── Load existing artifact into agent file state ────────────────────
        const existingArtifact = await deepAgentsService.getLatestArtifact(sessionId)
        const initialFiles = this.buildInitialFiles(existingArtifact?.content ?? null)

        if (existingArtifact) {
            artifactId = existingArtifact.id
            reportContent = existingArtifact.content || ''
            logger.info(`[DeepAgentOrchestratorV2] Session ${sessionId} loaded existing artifact ${artifactId}`)
        }

        // ── Build agent input state ─────────────────────────────────────────
        const agentInput: { messages: BaseMessage[]; files?: Record<string, FileData> } = { messages }
        if (initialFiles) {
            agentInput.files = initialFiles
        }

        const streamEvents = agent.streamEvents(agentInput as any, { version: 'v2', recursionLimit: 1000, signal: abortController.signal })

        for await (const event of streamEvents) {
            if (this.isCancelled(sessionId)) {
                abortController.abort()
                return
            }

            const { event: eventType, name: toolName, data } = event as any

            // ── Todo list updates → step tracking ──────────────────────────────
            if (eventType === 'on_tool_start' && toolName === 'write_todos') {
                console.log('write_todos event data:', data)
                const newTodos: TodoItem[] = data?.input?.todos || []
                console.log('Received todos:', newTodos)
                const planSteps = newTodos.map((t: TodoItem) => ({ description: t.content, status: t.status }))

                // Emit plan event on first todo write
                if (previousTodos.length === 0 && newTodos.length > 0) {
                    this.sendSSE(sessionId, 'plan', { steps: planSteps })
                }

                await this.syncTodos(sessionId, newTodos, previousTodos, todoToStepId, stepCounter)
                stepCounter = Math.max(stepCounter, newTodos.length)
                previousTodos = newTodos
            }

            // ── write_file targeting final_report.md → artifact DRAFTING ───────
            if (eventType === 'on_tool_start' && toolName === 'write_file') {
                console.log('write_file event data:', data)
                const input: string = data?.input?.input || '{}'
                const inputObject: { file_path: string; content: string } = typeof input === 'string' ? JSON.parse(input) : input
                const filePath = inputObject.file_path || ''
                if (filePath === '/final_report.md') {
                    const content: string = inputObject.content || ''
                    reportContent = content
                    artifactId = await this.upsertArtifact(sessionId, artifactId, content, 'DRAFTING')
                    this.sendSSE(sessionId, 'artifact_patch', { artifactId, status: 'DRAFTING', content })
                }
            }

            // ── edit_file targeting final_report.md → artifact UPDATING ────────
            if (eventType === 'on_tool_start' && toolName === 'edit_file') {
                console.log('edit_file event data:', data)
                const input: string = data?.input?.input || '{}'
                const inputObject: { file_path: string; old_string: string; new_string: string; replace_all: boolean } =
                    typeof input === 'string' ? JSON.parse(input) : input
                const filePath = inputObject.file_path || ''
                if (filePath === '/final_report.md') {
                    const oldString: string = inputObject.old_string || ''
                    const newString: string = inputObject.new_string || ''
                    const replaceAll: boolean = inputObject.replace_all ?? false

                    reportContent = replaceAll
                        ? reportContent.split(oldString).join(newString)
                        : reportContent.replace(oldString, newString)

                    artifactId = await this.upsertArtifact(sessionId, artifactId, reportContent, 'UPDATING')
                    this.sendSSE(sessionId, 'artifact_patch', { artifactId, status: 'UPDATING', content: reportContent })
                }
            }

            // ── Token streaming from the main agent LLM ─────────────────────────
            // Only handle top-level agent messages (not sub-agent internal messages)
            if (eventType === 'on_chat_model_stream') {
                const tags: string[] = event.tags || []
                const isMainAgent = !tags.some((t: string) => t.includes('research-agent') || t.includes('critique-agent'))
                if (isMainAgent) {
                    const chunk = data?.chunk
                    const token = typeof chunk?.content === 'string' ? chunk.content : ''
                    if (token) {
                        this.sendSSE(sessionId, 'message', { role: 'assistant', content: token, streaming: true })
                    }
                }
            }
        }

        // ── Post-stream: finalize artifact and session ──────────────────────────
        if (this.isCancelled(sessionId)) return

        // Ensure all completed todos are reflected in DB
        if (previousTodos.length > 0) {
            const completedTodos = previousTodos.map((t) => ({ ...t, status: 'completed' as const }))
            await this.syncTodos(sessionId, completedTodos, previousTodos, todoToStepId, stepCounter)
        }

        // Finalize artifact
        if (artifactId && reportContent) {
            await deepAgentsService.updateArtifact(artifactId, { status: 'COMPLETED' })
            this.sendSSE(sessionId, 'artifact_patch', { artifactId, status: 'COMPLETED', content: reportContent })
        } else if (reportContent) {
            // Artifact was never created (shouldn't happen, but guard)
            artifactId = await this.upsertArtifact(sessionId, null, reportContent, 'COMPLETED')
            this.sendSSE(sessionId, 'artifact_patch', { artifactId, status: 'COMPLETED', content: reportContent })
        }

        // Persist final assistant summary message
        const summary = reportContent
            ? `Research completed. The report has been generated and is available in the artifact panel.`
            : `Research completed for "${userPrompt}".`
        await deepAgentsService.addMessage(sessionId, 'assistant', summary)
        this.sendSSE(sessionId, 'message', { role: 'assistant', content: summary })

        await deepAgentsService.updateSessionStatus(sessionId, 'COMPLETED', workspaceId)
        this.sendSSE(sessionId, 'status', { status: 'COMPLETED' })

        logger.info(`[DeepAgentOrchestratorV2] Session ${sessionId} completed`)
    }

    // ==============================|| TODO → STEP SYNC ||============================== //

    /**
     * Synchronises the deepagents framework todo list with database DeepAgentStep entities.
     * New todos are inserted; changed-status todos are updated.
     */
    private async syncTodos(
        sessionId: string,
        newTodos: TodoItem[],
        previousTodos: TodoItem[],
        todoToStepId: Map<string, string>,
        baseStepIndex: number
    ): Promise<void> {
        const prevMap = new Map(previousTodos.map((t) => [t.content, t.status]))

        for (let i = 0; i < newTodos.length; i++) {
            const todo = newTodos[i]
            const dbStatus = TODO_STATUS_MAP[todo.status] ?? 'PENDING'

            if (!todoToStepId.has(todo.content)) {
                // New todo — create DB step
                try {
                    const step = await deepAgentsService.addStep(sessionId, baseStepIndex + i, todo.content)
                    todoToStepId.set(todo.content, step.id)

                    // Set initial status if not PENDING
                    if (dbStatus !== 'PENDING') {
                        await deepAgentsService.updateStep(step.id, {
                            status: dbStatus,
                            startedAt: dbStatus === 'RUNNING' ? new Date() : undefined,
                            completedAt: dbStatus === 'COMPLETED' ? new Date() : undefined
                        })
                    }

                    this.sendSSE(sessionId, 'step_update', {
                        stepId: step.id,
                        stepIndex: baseStepIndex + i,
                        status: dbStatus,
                        description: todo.content
                    })
                } catch (err) {
                    logger.warn(`[DeepAgentOrchestratorV2] Failed to create step: ${getErrorMessage(err)}`)
                }
            } else {
                // Existing todo — check for status change
                const prevStatus = prevMap.get(todo.content)
                if (prevStatus !== todo.status) {
                    const stepId = todoToStepId.get(todo.content)!
                    try {
                        await deepAgentsService.updateStep(stepId, {
                            status: dbStatus,
                            startedAt: dbStatus === 'RUNNING' ? new Date() : undefined,
                            completedAt: dbStatus === 'COMPLETED' ? new Date() : undefined
                        })
                        this.sendSSE(sessionId, 'step_update', { stepId, status: dbStatus, description: todo.content })
                    } catch (err) {
                        logger.warn(`[DeepAgentOrchestratorV2] Failed to update step ${stepId}: ${getErrorMessage(err)}`)
                    }
                }
            }
        }
    }

    // ==============================|| ARTIFACT HELPERS ||============================== //

    /**
     * Creates or updates the artifact for this session.
     * Returns the artifact id.
     */
    private async upsertArtifact(
        sessionId: string,
        existingId: string | null,
        content: string,
        status: 'DRAFTING' | 'UPDATING' | 'COMPLETED'
    ): Promise<string> {
        try {
            if (existingId) {
                await deepAgentsService.updateArtifact(existingId, { content, status })
                return existingId
            } else {
                const existing = await deepAgentsService.getLatestArtifact(sessionId)
                if (existing) {
                    await deepAgentsService.updateArtifact(existing.id, { content, status })
                    return existing.id
                }
                const artifact = await deepAgentsService.createArtifact(sessionId, content, 'markdown', 1)
                return artifact.id
            }
        } catch (err) {
            logger.warn(`[DeepAgentOrchestratorV2] Artifact upsert failed: ${getErrorMessage(err)}`)
            return existingId ?? ''
        }
    }
}

// Singleton instance — same export name pattern as the original orchestrator
export const deepAgentOrchestrator = new DeepAgentOrchestratorV2()
