# Middleware

> deepagents → Middleware

Deep agents use a modular middleware architecture where each core capability is implemented as composable middleware. This design allows you to customize agent behavior by adding, removing, or modifying middleware.

> **Learn more:** For architecture details and customization patterns, see the [Middleware documentation](https://docs.langchain.com/oss/javascript/deepagents/middleware).

## Built-in Middleware

### Filesystem Middleware

Provides tools for context management through file operations. This is one of the main challenges in building effective agents—the filesystem middleware helps agents work with large amounts of context without overflowing the context window.

| Tool         | Description                                |
| ------------ | ------------------------------------------ |
| `ls`         | List files in a directory                  |
| `read_file`  | Read file contents                         |
| `write_file` | Write content to a file                    |
| `edit_file`  | Edit an existing file                      |
| `glob`       | Find files matching a pattern              |
| `grep`       | Search for text within files               |
| `execute`    | Run shell commands (sandbox backends only) |

### SubAgent Middleware

Provides the `task` tool for spawning specialized subagents. Subagents are useful for:

-   **Context isolation:** Keep the main agent's context clean
-   **Specialization:** Give subagents specific tools and prompts for focused tasks
-   **Parallel work:** Delegate independent subtasks

> **Learn more:** See [Subagents](https://docs.langchain.com/oss/javascript/deepagents/subagents) for usage patterns.

### Memory Middleware

Enables long-term memory capabilities using LangGraph Store.

> **Learn more:** See [Long-term Memory](https://docs.langchain.com/oss/javascript/deepagents/long-term-memory) for usage patterns.

### Agent Memory Middleware

Provides agent-scoped memory that persists across conversations.

### Summarization Middleware

Automatically summarizes long conversations to prevent context overflow.

### Skills Middleware

Loads reusable skill modules to extend agent capabilities.

> **Learn more:** See [Skills](https://docs.langchain.com/oss/javascript/deepagents/skills) for creating and loading skills.

## API Reference

## Functions

-   [`createFilesystemMiddleware()`](https://reference.langchain.com/javascript/deepagents/index/createFilesystemMiddleware)
-   [`createSubAgentMiddleware()`](https://reference.langchain.com/javascript/deepagents/index/createSubAgentMiddleware)
-   [`createMemoryMiddleware()`](https://reference.langchain.com/javascript/deepagents/index/createMemoryMiddleware)
-   [`createAgentMemoryMiddleware()`](https://reference.langchain.com/javascript/deepagents/index/createAgentMemoryMiddleware)
-   [`createSummarizationMiddleware()`](https://reference.langchain.com/javascript/deepagents/middleware/createSummarizationMiddleware)
-   [`createSkillsMiddleware()`](https://reference.langchain.com/javascript/deepagents/index/createSkillsMiddleware)

## Interfaces

-   [`FilesystemMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/index/FilesystemMiddlewareOptions)
-   [`SubAgentMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/index/SubAgentMiddlewareOptions)
-   [`MemoryMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/index/MemoryMiddlewareOptions)
-   [`AgentMemoryMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/index/AgentMemoryMiddlewareOptions)
-   [`SummarizationMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/middleware/SummarizationMiddlewareOptions)
-   [`SkillsMiddlewareOptions`](https://reference.langchain.com/javascript/deepagents/index/SkillsMiddlewareOptions)
