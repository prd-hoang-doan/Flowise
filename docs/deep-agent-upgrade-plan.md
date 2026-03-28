# Deep Agents — Upgrade Plan: Migrate to `deepagents` Framework

> **Version:** 1.0
> **Status:** Draft
> **Created:** 2026-03-27

---

## 1. Overview

### Current State

The Deep Agents feature is fully implemented with a **custom orchestrator** (`orchestrator.ts`) that manually handles:

-   LLM-based planning (via `ChatOpenAI`)
-   Custom tool execution (`deepAgentToolRunner.ts` with 5 built-in tools)
-   Step tracking with retry logic
-   SSE streaming to the frontend
-   Incremental artifact generation (DRAFTING → UPDATING → COMPLETED)
-   Session persistence (messages, steps, artifacts via TypeORM)

### Target State

Replace the custom orchestrator with the **`deepagents` library** (v1.8.6 from LangChain), which provides:

-   `createDeepAgent()` — full agent orchestration with LangGraph
-   Sub-agent delegation (research + critique pattern)
-   Built-in todo management, filesystem, and summarization middleware
-   Tavily-powered web search (replaces DuckDuckGo scraping)
-   File-based artifact output (`final_report.md`, `question.txt`)
-   `ChatOpenAI` as the LLM model (user requirement — replacing the reference's `ChatAnthropic`)

### Why Upgrade

| Aspect             | Custom Orchestrator               | `deepagents` Framework                                 |
| ------------------ | --------------------------------- | ------------------------------------------------------ |
| Planning           | Manual LLM JSON parsing           | Built-in LangGraph planner with iterative reasoning    |
| Sub-agents         | None                              | Research + Critique delegation with parallel execution |
| Tool execution     | Custom sandboxed runner (Node.js) | Framework-managed with sandboxed backends              |
| Retry/Recovery     | Custom retry loop (3 retries)     | Framework-level error handling                         |
| Artifact quality   | Single-pass generation            | Multi-pass: research → write → critique → revise       |
| Context management | Manual accumulation               | Automatic summarization middleware                     |
| Maintainability    | ~400 lines custom code            | Framework-managed, community-supported                 |

---

## 2. Architecture Changes

### Before (Custom Orchestrator)

```
Controller (sendMessage)
  └── orchestrator.execute(sessionId, prompt, workspaceId)
        ├── planExecution()          → LLM JSON plan
        ├── executeStep() × N       → executeToolSandboxed()
        ├── updateIncrementalArtifact()
        ├── generateFinalArtifact()  → LLM streaming
        └── SSE events throughout
```

### After (`deepagents` Framework)

```
Controller (sendMessage)
  └── orchestrator.execute(sessionId, prompt, workspaceId)
        ├── createDeepAgent({ model: ChatOpenAI, tools, subagents })
        ├── agent.stream({ messages: [HumanMessage(prompt)] })
        │     ├── Research sub-agent (parallel topic research)
        │     ├── Critique sub-agent (report review)
        │     └── File output: final_report.md
        ├── Process stream events → SSE + DB persistence
        └── Extract final_report.md → Artifact
```

### Key Integration Points

| Component                         | Change                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `orchestrator.ts`                 | **Major rewrite** — Replace custom plan/execute with `createDeepAgent` + stream processing |
| `deep-agent.ts`                   | **Refactor** — Switch from `ChatAnthropic` to `ChatOpenAI`, export agent factory           |
| `deepAgentToolRunner.ts`          | **Deprecate** — Replaced by Tavily search + framework tools                                |
| `index.ts` (controller)           | **Minor changes** — Same API surface, different orchestrator internals                     |
| Services / Entities / Routes / UI | **No changes** — API contract remains identical                                            |

---

## 3. Implementation Plan

### Phase 1: Agent Configuration with ChatOpenAI

Modify `deep-agent.ts` to use `ChatOpenAI` instead of `ChatAnthropic`, and make it configurable via environment variables (matching the current orchestrator's config pattern).

**Files to modify:**

-   `packages/server/src/controllers/deep-agents/deep-agent.ts`

**Changes:**

-   Replace `ChatAnthropic` with `ChatOpenAI` from `@langchain/openai`
-   Use env vars: `DEEP_AGENT_MODEL`, `DEEP_AGENT_OPENAI_API_KEY` / `OPENAI_API_KEY`, `DEEP_AGENT_BASE_URL`
-   Export a factory function `createResearchAgent()` instead of a static singleton
-   Keep the same sub-agent structure (research-agent, critique-agent)
-   Keep the same research instructions / prompts

### Phase 2: Rewrite Orchestrator

Replace the custom orchestrator logic with `deepagents` framework streaming.

**Files to modify:**

-   `packages/server/src/controllers/deep-agents/orchestrator.ts`

**Changes:**

-   Remove `planExecution()`, `executeStep()`, `executeTool()` methods
-   Remove `getChatModel()`, `invokeLLM()`, `streamLLM()` methods
-   Remove `generateFinalArtifact()`, `updateIncrementalArtifact()` manual logic
-   New `execute()` flow:
    1. Create agent via `createResearchAgent()` factory
    2. Call `agent.stream({ messages: [new HumanMessage(prompt)] }, { recursionLimit: 1000 })`
    3. Process stream events → map to SSE events + DB persistence
    4. Extract `result.files["final_report.md"]` → save as artifact
-   Keep SSE client management (unchanged)
-   Keep cancellation support (use `AbortController` with stream)
-   Map framework events to existing SSE event types

### Phase 3: Stream Event Mapping

Map `deepagents` framework stream events to the existing SSE protocol so the **UI requires zero changes**.

| Framework Event                | SSE Event                   | Description                                    |
| ------------------------------ | --------------------------- | ---------------------------------------------- |
| Agent starts                   | `status: RUNNING`           | Session begins                                 |
| Todo list updates              | `step_update`               | Map todos to steps (PENDING/RUNNING/COMPLETED) |
| Sub-agent spawned              | `step_update` (new step)    | Research sub-agent launched                    |
| Sub-agent completed            | `step_update` (completed)   | Sub-agent returned result                      |
| File write (`final_report.md`) | `artifact_patch`            | Artifact content update                        |
| File edit (`final_report.md`)  | `artifact_patch` (UPDATING) | Artifact revision                              |
| Messages (AI response)         | `message`                   | Assistant message tokens                       |
| Agent completed                | `status: COMPLETED`         | Session finished                               |
| Agent error                    | `error` + `status: FAILED`  | Error handling                                 |

### Phase 4: Dependency & Cleanup

-   Add `@langchain/openai` as dependency (if not already present)
-   Add `@langchain/tavily` as dependency
-   Ensure `TAVILY_API_KEY` env var is documented
-   Deprecate `deepAgentToolRunner.ts` (keep for fallback, mark as legacy)
-   Update any relevant env var documentation

---

## 4. Environment Variables

### New / Updated Variables

| Variable                    | Required | Default       | Description                                     |
| --------------------------- | -------- | ------------- | ----------------------------------------------- |
| `DEEP_AGENT_OPENAI_API_KEY` | Yes\*    | —             | OpenAI API key for the deep agent LLM           |
| `OPENAI_API_KEY`            | Fallback | —             | Fallback if `DEEP_AGENT_OPENAI_API_KEY` not set |
| `DEEP_AGENT_MODEL`          | No       | `gpt-4o-mini` | OpenAI model name                               |
| `DEEP_AGENT_BASE_URL`       | No       | —             | Custom base URL (OpenAI-compatible providers)   |
| `TAVILY_API_KEY`            | Yes      | —             | **NEW** — Tavily API key for web search tool    |

---

## 5. Detailed Checklist

### Phase 1: Agent Configuration

-   [ ] **1.1** Replace `ChatAnthropic` with `ChatOpenAI` in `deep-agent.ts`
-   [ ] **1.2** Add env var configuration (`DEEP_AGENT_OPENAI_API_KEY`, `DEEP_AGENT_MODEL`, `DEEP_AGENT_BASE_URL`)
-   [ ] **1.3** Export `createResearchAgent(config?)` factory function instead of static `agent`
-   [ ] **1.4** Parameterize Tavily API key via `TAVILY_API_KEY` env var
-   [ ] **1.5** Keep research sub-agent with `internetSearch` tool
-   [ ] **1.6** Keep critique sub-agent with its system prompt
-   [ ] **1.7** Keep the full `researchInstructions` system prompt
-   [ ] **1.8** Add `recursionLimit` config option (default: `1000`)
-   [ ] **1.9** Verify `@langchain/openai` is in `package.json` dependencies
-   [ ] **1.10** Verify `@langchain/tavily` is in `package.json` dependencies

### Phase 2: Orchestrator Rewrite

-   [ ] **2.1** Remove `getChatModel()`, `invokeLLM()`, `streamLLM()` private methods
-   [ ] **2.2** Remove `planExecution()`, `callLLMForPlanning()`, `buildFallbackPlan()` methods
-   [ ] **2.3** Remove `executeStep()` and `executeTool()` methods
-   [ ] **2.4** Remove `generateFinalArtifact()`, `updateIncrementalArtifact()` methods
-   [ ] **2.5** Remove `buildArtifactPrompt()`, `buildFallbackArtifact()`, `extractSectionTitle()` helpers
-   [ ] **2.6** Import `createResearchAgent()` from `deep-agent.ts`
-   [ ] **2.7** Implement new `execute()` method using `agent.stream()`
-   [ ] **2.8** Process stream chunks: extract messages, todos, files from each event
-   [ ] **2.9** Map todo list changes to `step_update` SSE events
-   [ ] **2.10** Map file writes/edits to `artifact_patch` SSE events
-   [ ] **2.11** Extract `final_report.md` content from `result.files` for final artifact
-   [ ] **2.12** Persist steps to DB by mapping agent todos to `DeepAgentStep` entities
-   [ ] **2.13** Persist messages (assistant response) to DB
-   [ ] **2.14** Persist artifact from `final_report.md` content
-   [ ] **2.15** Keep SSE client management (`addClient`, `removeClient`, `sendSSE`) unchanged
-   [ ] **2.16** Implement cancellation via `AbortController` passed to `agent.stream()`
-   [ ] **2.17** Keep `maxRetries` concept (now framework-managed, configure via `recursionLimit`)
-   [ ] **2.18** Add error handling: catch stream errors → `FAILED` status + SSE error event

### Phase 3: Stream Event Mapping

-   [ ] **3.1** Define stream event type mapping (framework → SSE)
-   [ ] **3.2** Handle `__start__` / `__end__` events for agent lifecycle
-   [ ] **3.3** Map agent node outputs to `step_update` events
-   [ ] **3.4** Handle sub-agent events (research-agent, critique-agent) as nested steps
-   [ ] **3.5** Extract streamed message tokens for `message` SSE events
-   [ ] **3.6** Detect `write_file` tool calls targeting `final_report.md` → `artifact_patch` DRAFTING
-   [ ] **3.7** Detect `edit_file` tool calls targeting `final_report.md` → `artifact_patch` UPDATING
-   [ ] **3.8** On stream completion, emit `artifact_patch` COMPLETED
-   [ ] **3.9** Emit `plan` SSE event from initial todo list (if available)
-   [ ] **3.10** Test: UI receives all expected SSE events without changes

### Phase 4: Dependencies & Cleanup

-   [ ] **4.1** Verify `deepagents: ^1.8.6` in `packages/server/package.json`
-   [ ] **4.2** Add/verify `@langchain/openai` in dependencies
-   [ ] **4.3** Add/verify `@langchain/tavily` in dependencies
-   [ ] **4.4** Add `TAVILY_API_KEY` to `.env.example` (if exists)
-   [ ] **4.5** Mark `deepAgentToolRunner.ts` as deprecated (add JSDoc comment)
-   [ ] **4.6** Remove unused imports from `orchestrator.ts` (`executeToolSandboxed`, etc.)
-   [ ] **4.7** Run `pnpm build` — verify no TypeScript errors
-   [ ] **4.8** Run existing tests — verify no regressions

### Phase 5: Testing & Validation

-   [ ] **5.1** Test: Create new session → Send research prompt → Verify SSE events stream
-   [ ] **5.2** Test: Verify artifact is generated from `final_report.md`
-   [ ] **5.3** Test: Verify incremental artifact updates during generation
-   [ ] **5.4** Test: Cancel a running session → Verify execution stops
-   [ ] **5.5** Test: Verify session persistence (reload page, open existing session)
-   [ ] **5.6** Test: Export artifact as Markdown/HTML/Text
-   [ ] **5.7** Test: Multiple concurrent sessions
-   [ ] **5.8** Test: Error scenario (invalid API key) → Graceful failure
-   [ ] **5.9** Test: UI split panel renders correctly with new event stream
-   [ ] **5.10** Test: Step progress indicators display correctly

---

## 6. Risk Assessment

| Risk                                               | Impact | Mitigation                                                      |
| -------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `deepagents` API changes in future versions        | Medium | Pin to `^1.8.6`, add integration tests                          |
| Tavily API key required (new dependency)           | Low    | Document in setup guide, graceful error if missing              |
| Stream event format differs from expectations      | High   | Thorough stream event logging during development                |
| `ChatOpenAI` behavior differs from `ChatAnthropic` | Medium | Test with same prompts, tune temperature/tokens                 |
| Loss of custom tool fallbacks (DuckDuckGo)         | Low    | Keep `deepAgentToolRunner.ts` as deprecated fallback            |
| Longer execution times with sub-agent pattern      | Low    | `recursionLimit` cap, cancel support                            |
| Breaking SSE contract with UI                      | High   | Map all framework events to existing SSE types, zero UI changes |

---

## 7. Files Changed Summary

| File                                                          | Action            | Scope                                            |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------------ |
| `packages/server/src/controllers/deep-agents/deep-agent.ts`   | **Rewrite**       | ChatOpenAI + factory function                    |
| `packages/server/src/controllers/deep-agents/orchestrator.ts` | **Major rewrite** | Replace custom logic with `deepagents` framework |
| `packages/server/src/utils/deepAgentToolRunner.ts`            | **Deprecate**     | Add deprecation notice, keep for reference       |
| `packages/server/package.json`                                | **Minor update**  | Verify/add dependencies                          |
| `packages/server/src/controllers/deep-agents/index.ts`        | **No changes**    | API surface unchanged                            |
| `packages/server/src/services/deep-agents/index.ts`           | **No changes**    | DB layer unchanged                               |
| Database entities                                             | **No changes**    | Schema unchanged                                 |
| Routes                                                        | **No changes**    | Endpoints unchanged                              |
| UI components                                                 | **No changes**    | SSE event contract preserved                     |

---

## 8. Rollback Strategy

If issues arise post-migration:

1. The custom orchestrator code can be restored from git history
2. `deepAgentToolRunner.ts` remains in the codebase (deprecated, not deleted)
3. Environment variables are additive (no existing vars removed)
4. Database schema is unchanged — no migration needed
5. UI is unchanged — no frontend rollback needed

---

## 9. Code Sketch: Key Changes

### `deep-agent.ts` — Factory with ChatOpenAI

```typescript
import { ChatOpenAI } from '@langchain/openai'
import { createDeepAgent, type SubAgent } from 'deepagents'
// ... tool + prompt definitions remain the same ...

export function createResearchAgent(config?: { model?: string; apiKey?: string; baseURL?: string }) {
    const apiKey = config?.apiKey || process.env.DEEP_AGENT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
    const modelName = config?.model || process.env.DEEP_AGENT_MODEL || 'gpt-4o-mini'
    const baseURL = config?.baseURL || process.env.DEEP_AGENT_BASE_URL || undefined

    return createDeepAgent({
        model: new ChatOpenAI({ modelName, openAIApiKey: apiKey, temperature: 0.3, configuration: baseURL ? { baseURL } : undefined }),
        tools: [internetSearch],
        systemPrompt: researchInstructions,
        subagents: [researchSubAgent, critiqueSubAgent]
    })
}
```

### `orchestrator.ts` — Stream-based Execution

```typescript
import { HumanMessage } from '@langchain/core/messages'
import { createResearchAgent } from './deep-agent'

// Inside execute():
const agent = createResearchAgent()
const stream = await agent.stream(
    { messages: [new HumanMessage(userPrompt)] },
    { recursionLimit: 1000, signal: abortController.signal }
)

for await (const event of stream) {
    // Map event → SSE + DB persistence
    // Extract todos → step_update events
    // Extract file writes → artifact_patch events
    // Extract messages → message events
}

// After stream completes:
const result = await agent.invoke(...)  // or collect from stream
const reportContent = result.files?.['final_report.md']?.content?.join('\n')
// Save as artifact
```

---

_This document serves as the planning guide for upgrading the Deep Agents orchestrator from a custom implementation to the `deepagents` LangChain framework._
