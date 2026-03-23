import { Response } from 'express'
import deepAgentsService from '../../services/deep-agents'
import { DeepAgentStepStatus } from '../../Interface'
import { getErrorMessage } from '../../errors/utils'
import { executeToolSandboxed } from '../../utils/deepAgentToolRunner'
import logger from '../../utils/logger'

/**
 * DeepAgentOrchestrator — FR-1 through FR-6 Implementation
 *
 * Handles:
 * - Task decomposition: breaks user request into ordered sub-tasks (FR-2)
 * - Real LLM integration for planning and artifact generation
 * - Tool execution via sandboxed runner (FR-3)
 * - Incremental artifact updates: DRAFTING → UPDATING → COMPLETED (FR-4, FR-6)
 * - Step tracking with retry logic (FR-2)
 * - SSE streaming for real-time updates (NFR-2)
 * - Cancellation support (NFR-1)
 */

type SSEClient = {
    response: Response
}

interface StepPlan {
    description: string
    toolName?: string
    toolInput?: string
}

class DeepAgentOrchestrator {
    private clients: Map<string, SSEClient[]> = new Map()
    private cancelledSessions: Set<string> = new Set()
    private maxRetries: number = 3

    // ==============================|| SSE CLIENT MANAGEMENT ||============================== //

    addClient(sessionId: string, res: Response) {
        const existing = this.clients.get(sessionId) || []
        existing.push({ response: res })
        this.clients.set(sessionId, existing)
    }

    removeClient(sessionId: string, res: Response) {
        const existing = this.clients.get(sessionId)
        if (existing) {
            const filtered = existing.filter((c) => c.response !== res)
            if (filtered.length === 0) {
                this.clients.delete(sessionId)
            } else {
                this.clients.set(sessionId, filtered)
            }
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

        // Clean up disconnected clients
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
    }

    private isCancelled(sessionId: string): boolean {
        return this.cancelledSessions.has(sessionId)
    }

    // ==============================|| LLM INTEGRATION ||============================== //

    /**
     * Gets or creates a ChatOpenAI instance for Deep Agent operations.
     * Uses environment variables for configuration:
     * - DEEP_AGENT_MODEL: model name (default: gpt-4o-mini)
     * - DEEP_AGENT_OPENAI_API_KEY or OPENAI_API_KEY: API key
     * - DEEP_AGENT_BASE_URL: optional base URL for API-compatible providers
     */
    private async getChatModel(): Promise<any> {
        const apiKey = process.env.DEEP_AGENT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
        if (!apiKey) {
            throw new Error('No LLM API key configured. Set DEEP_AGENT_OPENAI_API_KEY or OPENAI_API_KEY environment variable.')
        }

        const { ChatOpenAI } = await import('@langchain/openai')
        const modelName = process.env.DEEP_AGENT_MODEL || 'gpt-4o-mini'
        const baseURL = process.env.DEEP_AGENT_BASE_URL || undefined

        return new ChatOpenAI({
            modelName,
            openAIApiKey: apiKey,
            temperature: 0.3,
            maxTokens: 4096,
            configuration: baseURL ? { baseURL } : undefined
        })
    }

    /**
     * Invokes the LLM with a prompt and returns the text response.
     */
    private async invokeLLM(prompt: string): Promise<string> {
        const model = await this.getChatModel()
        const response = await model.invoke(prompt)
        return typeof response.content === 'string' ? response.content : String(response.content)
    }

    /**
     * Invokes the LLM with streaming, calling onToken for each chunk.
     */
    private async streamLLM(prompt: string, onToken: (token: string) => void): Promise<string> {
        const model = await this.getChatModel()
        const stream = await model.stream(prompt)
        let full = ''
        for await (const chunk of stream) {
            const token = typeof chunk.content === 'string' ? chunk.content : String(chunk.content)
            full += token
            onToken(token)
        }
        return full
    }

    // ==============================|| AGENT EXECUTION (FR-1) ||============================== //

    /**
     * Main execution entry point.
     * Implements: User Request → Planner → Tool Executor → Memory Accumulator → Artifact Generator
     */
    async execute(sessionId: string, userPrompt: string, workspaceId: string): Promise<void> {
        this.cancelledSessions.delete(sessionId) // Reset cancellation flag

        try {
            // 1. Update session to RUNNING
            await deepAgentsService.updateSessionStatus(sessionId, 'RUNNING', workspaceId)
            this.sendSSE(sessionId, 'status', { status: 'RUNNING' })

            // 2. Plan — decompose the task into steps
            const plan = await this.planExecution(sessionId, userPrompt)
            this.sendSSE(sessionId, 'plan', { steps: plan })

            if (this.isCancelled(sessionId)) return await this.handleCancellation(sessionId, workspaceId)

            // 3. Execute each step, accumulating results
            const results: string[] = []
            for (let i = 0; i < plan.length; i++) {
                if (this.isCancelled(sessionId)) return await this.handleCancellation(sessionId, workspaceId)

                const stepPlan = plan[i]
                const step = await deepAgentsService.addStep(sessionId, i, stepPlan.description, stepPlan.toolName)
                this.sendSSE(sessionId, 'step_update', {
                    stepId: step.id,
                    stepIndex: i,
                    status: 'PENDING',
                    description: stepPlan.description,
                    toolName: stepPlan.toolName
                })

                const result = await this.executeStep(sessionId, step.id, stepPlan, results, 0)
                if (result) {
                    results.push(result)
                }

                // FR-6: After each step, update artifact incrementally if we have results
                if (results.length > 0 && i < plan.length - 1) {
                    await this.updateIncrementalArtifact(sessionId, userPrompt, results, i, plan.length)
                }
            }

            if (this.isCancelled(sessionId)) return await this.handleCancellation(sessionId, workspaceId)

            // 4. Generate final artifact (FR-4)
            await this.generateFinalArtifact(sessionId, userPrompt, results)

            // 5. Add assistant response message
            const summary = this.buildSummary(userPrompt, results)
            await deepAgentsService.addMessage(sessionId, 'assistant', summary)
            this.sendSSE(sessionId, 'message', { role: 'assistant', content: summary })

            // 6. Mark session as completed
            await deepAgentsService.updateSessionStatus(sessionId, 'COMPLETED', workspaceId)
            this.sendSSE(sessionId, 'status', { status: 'COMPLETED' })
        } catch (error) {
            logger.error(`[DeepAgentOrchestrator] Session ${sessionId} failed: ${getErrorMessage(error)}`)

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
        }
    }

    private async handleCancellation(sessionId: string, workspaceId: string): Promise<void> {
        logger.info(`[DeepAgentOrchestrator] Session ${sessionId} cancelled by user`)
        await deepAgentsService.updateSessionStatus(sessionId, 'CANCELLED', workspaceId)
        this.sendSSE(sessionId, 'status', { status: 'CANCELLED' })
        this.cancelledSessions.delete(sessionId)
    }

    // ==============================|| PLANNING (FR-2) ||============================== //

    private async planExecution(sessionId: string, userPrompt: string): Promise<StepPlan[]> {
        this.sendSSE(sessionId, 'step_update', { phase: 'planning', status: 'RUNNING' })

        try {
            const plan = await this.callLLMForPlanning(userPrompt)
            this.sendSSE(sessionId, 'step_update', { phase: 'planning', status: 'COMPLETED' })
            return plan
        } catch (error) {
            logger.warn(`[DeepAgentOrchestrator] LLM planning failed, using fallback: ${getErrorMessage(error)}`)
            this.sendSSE(sessionId, 'step_update', { phase: 'planning', status: 'COMPLETED', fallback: true })
            return this.buildFallbackPlan(userPrompt)
        }
    }

    private async callLLMForPlanning(userPrompt: string): Promise<StepPlan[]> {
        const planningPrompt = `You are a research planning agent. Given the user request, create an ordered list of research steps.

User Request: "${userPrompt}"

Return a JSON array of steps. Each step must have:
- "description": a clear description of what to do
- "toolName": one of "web_search", "fetch_url", "summarize_source", "generate", or null if no tool is needed
- "toolInput": the specific input/query for the tool (the search query, URL, or text to process)

Rules:
- Keep steps focused and actionable (3-6 steps)
- Start with web_search to gather information
- Use summarize_source to synthesize findings
- Always end with a "generate" step to compile the final artifact
- toolInput for web_search should be an effective search query
- Return ONLY valid JSON array, no markdown code blocks, no other text

Example:
[{"description":"Search for information about AI regulation","toolName":"web_search","toolInput":"AI regulation policy 2024"},{"description":"Summarize the gathered findings","toolName":"summarize_source","toolInput":""},{"description":"Generate the final research report","toolName":"generate","toolInput":""}]`

        try {
            const responseText = await this.invokeLLM(planningPrompt)

            // Extract JSON from the response (handle markdown code blocks)
            const jsonMatch = responseText.match(/\[[\s\S]*\]/)
            if (!jsonMatch) {
                throw new Error('No JSON array found in LLM response')
            }

            const parsed = JSON.parse(jsonMatch[0])
            if (!Array.isArray(parsed) || parsed.length === 0) {
                throw new Error('Invalid plan format from LLM')
            }

            // Validate and normalize
            return parsed.map((step: any) => ({
                description: String(step.description || ''),
                toolName: step.toolName || undefined,
                toolInput: step.toolInput || undefined
            }))
        } catch (error) {
            logger.warn(`[DeepAgentOrchestrator] Failed to parse LLM plan: ${getErrorMessage(error)}`)
            throw error
        }
    }

    private buildFallbackPlan(userPrompt: string): StepPlan[] {
        return [
            { description: `Search for information about: ${userPrompt}`, toolName: 'web_search', toolInput: userPrompt },
            {
                description: 'Summarize the research findings',
                toolName: 'summarize_source',
                toolInput: ''
            },
            { description: 'Generate the final structured report', toolName: 'generate', toolInput: '' }
        ]
    }

    // ==============================|| STEP EXECUTION WITH RETRY (FR-2 + NFR-5) ||============================== //

    private async executeStep(
        sessionId: string,
        stepId: string,
        stepPlan: StepPlan,
        accumulatedResults: string[],
        retryCount: number
    ): Promise<string | null> {
        try {
            // Mark step as RUNNING
            await deepAgentsService.updateStep(stepId, {
                status: 'RUNNING' as DeepAgentStepStatus,
                startedAt: new Date()
            })
            this.sendSSE(sessionId, 'step_update', { stepId, status: 'RUNNING', description: stepPlan.description })

            // Execute the tool (FR-3)
            const result = await this.executeTool(stepPlan, accumulatedResults)

            // Store tool result as tool message for session persistence (FR-7)
            if (stepPlan.toolName) {
                await deepAgentsService.addMessage(sessionId, 'tool', `[${stepPlan.toolName}] ${result.substring(0, 2000)}`)
            }

            // Mark step as COMPLETED
            await deepAgentsService.updateStep(stepId, {
                status: 'COMPLETED' as DeepAgentStepStatus,
                toolInput: stepPlan.toolInput || stepPlan.description,
                toolOutput: result.substring(0, 10000), // Limit stored output size
                completedAt: new Date()
            })
            this.sendSSE(sessionId, 'step_update', {
                stepId,
                status: 'COMPLETED',
                output: result.substring(0, 500) // Send truncated output to frontend
            })

            return result
        } catch (error) {
            const errorMsg = getErrorMessage(error)

            if (retryCount < this.maxRetries) {
                logger.warn(`[DeepAgentOrchestrator] Step ${stepId} failed (attempt ${retryCount + 1}/${this.maxRetries}): ${errorMsg}`)
                this.sendSSE(sessionId, 'step_update', {
                    stepId,
                    status: 'RUNNING',
                    retry: retryCount + 1,
                    error: errorMsg
                })
                return this.executeStep(sessionId, stepId, stepPlan, accumulatedResults, retryCount + 1)
            }

            // Max retries exceeded — mark as FAILED and skip
            logger.error(`[DeepAgentOrchestrator] Step ${stepId} failed after ${this.maxRetries} retries: ${errorMsg}`)
            await deepAgentsService.updateStep(stepId, {
                status: 'FAILED' as DeepAgentStepStatus,
                error: errorMsg,
                completedAt: new Date()
            })
            this.sendSSE(sessionId, 'step_update', { stepId, status: 'FAILED', error: errorMsg })

            return null // Skip and continue (NFR-5: partial results)
        }
    }

    // ==============================|| TOOL EXECUTION (FR-3) ||============================== //

    /**
     * Executes a tool via the sandboxed tool runner.
     * Provides LLM callbacks for tools that need summarization/generation.
     */
    private async executeTool(stepPlan: StepPlan, accumulatedResults: string[]): Promise<string> {
        const toolName = stepPlan.toolName
        const input = stepPlan.toolInput || stepPlan.description

        if (!toolName) {
            // No tool — reasoning step. Use LLM if available, otherwise return analysis note.
            try {
                return await this.invokeLLM(
                    `Analyze the following and provide insights:\n\n${stepPlan.description}\n\nContext:\n${accumulatedResults
                        .slice(-3)
                        .join('\n\n')}`
                )
            } catch {
                return `Analysis completed: ${stepPlan.description}`
            }
        }

        // Build LLM callbacks for tools that need them
        const llmSummarize = async (text: string): Promise<string> => {
            try {
                return await this.invokeLLM(
                    `Summarize the following content concisely, highlighting key facts, data points, and conclusions:\n\n${text.substring(
                        0,
                        6000
                    )}`
                )
            } catch {
                // Fallback handled by tool runner
                throw new Error('LLM summarization unavailable')
            }
        }

        const llmGenerate = async (prompt: string): Promise<string> => {
            return await this.invokeLLM(prompt)
        }

        const result = await executeToolSandboxed(toolName, input, {
            llmSummarize,
            llmGenerate,
            accumulatedContext: accumulatedResults.join('\n\n---\n\n')
        })

        if (!result.success) {
            throw new Error(result.error || `Tool ${toolName} failed`)
        }

        return result.output
    }

    // ==============================|| ARTIFACT GENERATION (FR-4 + FR-6) ||============================== //

    /**
     * FR-6: Updates artifact incrementally during step execution.
     * Shows partial results as they accumulate.
     */
    private async updateIncrementalArtifact(
        sessionId: string,
        userPrompt: string,
        results: string[],
        currentStep: number,
        totalSteps: number
    ): Promise<void> {
        try {
            const existing = await deepAgentsService.getLatestArtifact(sessionId)
            const validResults = results.filter(Boolean)
            const draftContent = `# Research: ${userPrompt}\n\n_Step ${currentStep + 1} of ${totalSteps} completed..._\n\n${validResults
                .map((r, i) => `### Finding ${i + 1}\n\n${r.substring(0, 1000)}`)
                .join('\n\n---\n\n')}`

            if (existing) {
                await deepAgentsService.updateArtifact(existing.id, {
                    content: draftContent,
                    status: 'UPDATING'
                })
                this.sendSSE(sessionId, 'artifact_patch', {
                    artifactId: existing.id,
                    status: 'UPDATING',
                    content: draftContent
                })
            } else {
                const artifact = await deepAgentsService.createArtifact(sessionId, draftContent, 'markdown', 1)
                this.sendSSE(sessionId, 'artifact_patch', {
                    artifactId: artifact.id,
                    status: 'DRAFTING',
                    content: draftContent
                })
            }
        } catch (error) {
            // Non-critical — don't fail execution for incremental update errors
            logger.warn(`[DeepAgentOrchestrator] Incremental artifact update failed: ${getErrorMessage(error)}`)
        }
    }

    /**
     * FR-4: Generates the final artifact using LLM for synthesis.
     * Implements: DRAFTING → UPDATING → COMPLETED lifecycle.
     */
    private async generateFinalArtifact(sessionId: string, userPrompt: string, results: string[]): Promise<void> {
        const validResults = results.filter(Boolean)
        const existing = await deepAgentsService.getLatestArtifact(sessionId)

        // Phase 1: DRAFTING — show outline
        const draftContent = `# Research: ${userPrompt}\n\n_Generating final report..._\n\n${validResults
            .map((r, i) => `## Section ${i + 1}\n\n${r.substring(0, 200)}...`)
            .join('\n\n')}`

        let artifact: any
        if (existing) {
            await deepAgentsService.updateArtifact(existing.id, { content: draftContent, status: 'DRAFTING' })
            artifact = existing
        } else {
            artifact = await deepAgentsService.createArtifact(sessionId, draftContent, 'markdown', 1)
        }
        this.sendSSE(sessionId, 'artifact_patch', {
            artifactId: artifact.id,
            status: 'DRAFTING',
            content: draftContent
        })

        // Phase 2: UPDATING — generate full content via LLM (streaming)
        let fullContent: string
        try {
            let streamedContent = ''
            fullContent = await this.streamLLM(this.buildArtifactPrompt(userPrompt, validResults), (token) => {
                streamedContent += token
                // Send incremental tokens to frontend
                this.sendSSE(sessionId, 'artifact_patch', {
                    artifactId: artifact.id,
                    status: 'UPDATING',
                    content: streamedContent,
                    streaming: true
                })
            })
        } catch (error) {
            logger.warn(`[DeepAgentOrchestrator] LLM artifact generation failed, using structured fallback: ${getErrorMessage(error)}`)
            fullContent = this.buildFallbackArtifact(userPrompt, validResults)
        }

        // Persist the full content
        await deepAgentsService.updateArtifact(artifact.id, { content: fullContent, status: 'UPDATING' })
        this.sendSSE(sessionId, 'artifact_patch', {
            artifactId: artifact.id,
            status: 'UPDATING',
            content: fullContent
        })

        // Phase 3: COMPLETED
        await deepAgentsService.updateArtifact(artifact.id, { status: 'COMPLETED' })
        this.sendSSE(sessionId, 'artifact_patch', {
            artifactId: artifact.id,
            status: 'COMPLETED',
            content: fullContent
        })
    }

    private buildArtifactPrompt(userPrompt: string, results: string[]): string {
        const researchData = results.map((r, i) => `--- Research Finding ${i + 1} ---\n${r}`).join('\n\n')

        return `You are a professional research writer. Based on the following research findings, generate a comprehensive, well-structured Markdown document.

# User Request
${userPrompt}

# Research Findings
${researchData}

# Instructions
- Write a professional Markdown document with clear headings (##, ###)
- Start with an executive summary
- Organize findings into logical sections
- Include key data points, facts, and sources found
- End with a conclusion section
- Use bullet points and tables where appropriate
- Keep the tone professional and objective
- The document should be thorough but concise

Generate the complete Markdown document now:`
    }

    private buildFallbackArtifact(userPrompt: string, results: string[]): string {
        const sections = results.map((r, i) => `## ${i + 1}. ${this.extractSectionTitle(r)}\n\n${r}`).join('\n\n---\n\n')

        return `# Research Report: ${userPrompt}

> Generated by Flowise Deep Agent

## Executive Summary

This report presents findings from an automated deep research workflow analyzing: **${userPrompt}**

The research was conducted in ${results.length} steps, covering information gathering and synthesis.

---

${sections}

---

## Conclusion

This research covered ${results.length} key areas related to "${userPrompt}". The findings above represent a structured synthesis of the available information.

---

*Generated by Flowise Deep Agent*
`
    }

    private extractSectionTitle(result: string): string {
        // Try to extract a heading or bracket title
        const headingMatch = result.match(/^#+\s*(.+)/m)
        if (headingMatch) return headingMatch[1].substring(0, 80)

        const bracketMatch = result.match(/\[(.*?)\]/)
        if (bracketMatch) return bracketMatch[1].substring(0, 80)

        // Use first non-empty line
        const firstLine = result.split('\n').find((l) => l.trim().length > 10)
        return firstLine ? firstLine.trim().substring(0, 80) : 'Finding'
    }

    private buildSummary(userPrompt: string, results: string[]): string {
        const validResults = results.filter(Boolean)
        const failedCount = results.length - validResults.length
        let summary = `Research completed for "${userPrompt}". Generated a structured report with ${validResults.length} findings. You can view the artifact in the right panel.`
        if (failedCount > 0) {
            summary += ` (${failedCount} step${failedCount > 1 ? 's' : ''} failed and were skipped)`
        }
        return summary
    }
}

// Singleton instance
export const deepAgentOrchestrator = new DeepAgentOrchestrator()
