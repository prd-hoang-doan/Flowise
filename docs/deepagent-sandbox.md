# Sandboxes

> deepagents → Sandboxes

Sandboxes provide isolated execution environments for deep agents that need to run shell commands, execute code, or interact with external systems safely.

> **Learn more:** For patterns and deployment considerations, see the [Backends documentation](https://docs.langchain.com/oss/javascript/deepagents/backends).

## Why Use Sandboxes?

Sandboxes are essential when your agent needs to:

-   **Execute shell commands** (`execute` tool) in a controlled environment
-   **Run untrusted code** safely without affecting the host system
-   **Isolate side effects** from agent actions
-   **Provide reproducible environments** for consistent agent behavior

## Available Sandbox Providers

Deep agents ships with built-in integrations for several sandbox providers:

| Provider | Package               | Description                                          |
| -------- | --------------------- | ---------------------------------------------------- |
| Modal    | `@langchain/modal`    | Serverless Docker container-based sandboxes          |
| Deno     | `@langchain/deno`     | Linux microVM sandboxes via Deno Deploy              |
| Daytona  | `@langchain/daytona`  | Cloud development environments with resource control |
| Node VFS | `@langchain/node-vfs` | In-memory virtual filesystem for local development   |

## Quick Start

Each provider follows a consistent creation pattern:

```typescript
import { ModalSandbox } from '@langchain/modal'

const sandbox = await ModalSandbox.create({
    imageName: 'python:3.12-slim'
})

try {
    const result = await sandbox.execute("echo 'Hello from sandbox'")
    console.log(result.output)
} finally {
    await sandbox.close()
}
```

## Using a Sandbox with an Agent

### Direct Backend

Pass the sandbox directly as the agent's backend:

```typescript
import { createDeepAgent } from 'deepagents'
import { ModalSandbox } from '@langchain/modal'

const sandbox = await ModalSandbox.create({
    imageName: 'python:3.12-slim'
})

const agent = createDeepAgent({
    model: new ChatAnthropic({ model: 'claude-sonnet-4-20250514' }),
    systemPrompt: 'You are a coding assistant with sandbox access.',
    backend: sandbox
})
```

### Via Middleware

Use sandbox factory functions for middleware integration:

```typescript
import { createDeepAgent, createFilesystemMiddleware } from 'deepagents'
import { ModalSandbox, createModalSandboxFactoryFromSandbox } from '@langchain/modal'

const sandbox = await ModalSandbox.create()

const agent = createDeepAgent({
    model: new ChatAnthropic({ model: 'claude-sonnet-4-20250514' }),
    systemPrompt: 'You are a coding assistant.',
    middlewares: [
        createFilesystemMiddleware({
            backend: createModalSandboxFactoryFromSandbox(sandbox)
        })
    ]
})
```

When a sandbox backend is configured, the filesystem middleware automatically registers these tools: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, and `execute`.

## The BaseSandbox Class

All sandbox implementations extend [`BaseSandbox`](#index.BaseSandbox) which provides default implementations for file operations via POSIX shell commands. Subclasses only need to implement `execute()`, `uploadFiles()`, and `downloadFiles()`:

```typescript
import { BaseSandbox, ExecuteResponse } from 'deepagents'

class MySandbox extends BaseSandbox {
    async execute(command: string): Promise<ExecuteResponse> {
        // Run command in isolated environment
        return { exitCode: 0, output: '...', truncated: false }
    }

    async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
        // Upload files to sandbox
    }

    async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
        // Download files from sandbox
    }

    get id(): string {
        return 'my-sandbox-id'
    }
}
```

`BaseSandbox` provides the following operations out of the box (implemented via shell commands through `execute()`):

| Method     | Description                                               |
| ---------- | --------------------------------------------------------- |
| `lsInfo`   | List directory contents with file metadata                |
| `read`     | Read file contents with line numbers, offset, and limit   |
| `write`    | Create new files (uses `uploadFiles()` + existence check) |
| `edit`     | String replacement editing with `replaceAll` support      |
| `grepRaw`  | Literal string search with optional glob filtering        |
| `globInfo` | Find files matching glob patterns                         |

## Sandbox Execution Response

The [`ExecuteResponse`](#index.ExecuteResponse) type provides structured output from command execution:

| Field       | Type             | Description                              |
| ----------- | ---------------- | ---------------------------------------- |
| `exitCode`  | `number \| null` | Exit code from the command (0 = success) |
| `output`    | `string`         | Combined stdout and stderr output        |
| `truncated` | `boolean`        | Whether the output was truncated         |

## Provider Configuration

### Modal

```typescript
import { ModalSandbox } from '@langchain/modal'

const sandbox = await ModalSandbox.create({
    appName: 'deepagents-sandbox', // Modal app name
    imageName: 'alpine:3.21', // Docker image
    timeoutMs: 30000, // Command timeout
    memoryMiB: 512, // Memory allocation
    volumes: { 'my-volume': '/data' }, // Volume mounts
    secrets: ['my-secret'], // Secret names to inject
    initialFiles: {
        // Files to create on startup
        '/workspace/main.py': "print('hello')"
    },
    auth: {
        tokenId: '...', // Or set MODAL_TOKEN_ID env var
        tokenSecret: '...' // Or set MODAL_TOKEN_SECRET env var
    }
})

// Reconnect to an existing sandbox
const existing = await ModalSandbox.fromId('sandbox-id')
```

### Deno

```typescript
import { DenoSandbox } from '@langchain/deno'

const sandbox = await DenoSandbox.create({
    memoryMb: 768, // 768-4096 MB
    lifetime: 'session', // "session" | "${n}s" | "${n}m"
    region: 'ord', // "ams" | "ord"
    initialFiles: {
        '/tmp/script.sh': 'echo hello'
    },
    auth: {
        token: '...' // Or set DENO_DEPLOY_TOKEN env var
    }
})

// Reconnect to an existing sandbox
const existing = await DenoSandbox.fromId('sandbox-id')
```

### Daytona

```typescript
import { DaytonaSandbox } from '@langchain/daytona'

const sandbox = await DaytonaSandbox.create({
    language: 'typescript', // "typescript" | "python" | "javascript"
    timeout: 300, // Startup timeout in seconds
    image: 'ubuntu:22.04', // Custom Docker image
    envVars: { NODE_ENV: 'production' },
    resources: {
        cpu: 2, // CPU cores
        memory: 4, // GiB
        disk: 20 // GiB
    },
    autoStopInterval: 15, // Minutes until auto-stop
    labels: { project: 'my-app' }, // Organization labels
    target: 'us', // "us" | "eu"
    auth: {
        apiKey: '...', // Or set DAYTONA_API_KEY env var
        apiUrl: '...' // Or set DAYTONA_API_URL env var
    }
})

// Reconnect to an existing sandbox
const existing = await DaytonaSandbox.fromId('sandbox-id')

// Bulk cleanup by label
await DaytonaSandbox.deleteAll({ project: 'my-app' })
```

### Node VFS (Local Development)

```typescript
import { VfsSandbox } from '@langchain/node-vfs'

const sandbox = await VfsSandbox.create({
    timeout: 30000, // Command timeout in ms
    initialFiles: {
        '/workspace/index.js': "console.log('Hello')",
        '/workspace/data.bin': new Uint8Array([1, 2, 3])
    }
})
```

The VFS sandbox uses an in-memory virtual filesystem that syncs to a temp directory for command execution. No external services are required, making it ideal for local development and testing.

## Factory Functions

Each provider exports factory functions for creating sandbox backends compatible with the middleware system:

```typescript
import { createModalSandboxFactory, createModalSandboxFactoryFromSandbox } from '@langchain/modal'

// Create a new sandbox per invocation
const factory = createModalSandboxFactory({
    imageName: 'python:3.12-slim'
})

// Reuse an existing sandbox across invocations
const sandbox = await ModalSandbox.create()
const sharedFactory = createModalSandboxFactoryFromSandbox(sandbox)
```

## Type Guard

Use `isSandboxBackend` to check if a backend supports command execution:

```typescript
import { isSandboxBackend } from 'deepagents'

if (isSandboxBackend(backend)) {
    const result = await backend.execute('ls -la')
    console.log(result.output)
}
```

## File Operations

Sandboxes support batch file upload and download with per-file error reporting:

```typescript
const encoder = new TextEncoder()

// Upload files
const uploads = await sandbox.uploadFiles([
    ['/workspace/main.py', encoder.encode("print('hello')")],
    ['/workspace/config.json', encoder.encode('{"key": "value"}')]
])

// Download files
const downloads = await sandbox.downloadFiles(['/workspace/main.py', '/workspace/output.txt'])

for (const download of downloads) {
    if (!download.error) {
        console.log(new TextDecoder().decode(download.content))
    }
}
```

File operations support **partial success** — individual file failures don't abort the entire batch.

## Error Handling

Sandbox file operations use standardized error codes:

| Error Code          | Description                            |
| ------------------- | -------------------------------------- |
| `file_not_found`    | The requested file does not exist      |
| `permission_denied` | Insufficient permissions               |
| `is_directory`      | Path points to a directory, not a file |
| `invalid_path`      | The provided path is invalid           |

## API Reference

## Classes

-   [`BaseSandbox`](https://reference.langchain.com/javascript/deepagents/index/BaseSandbox)

## Interfaces

-   [`SandboxBackendProtocol`](https://reference.langchain.com/javascript/deepagents/index/SandboxBackendProtocol)
-   [`ExecuteResponse`](https://reference.langchain.com/javascript/deepagents/index/ExecuteResponse)
-   [`FileUploadResponse`](https://reference.langchain.com/javascript/deepagents/index/FileUploadResponse)
-   [`FileDownloadResponse`](https://reference.langchain.com/javascript/deepagents/index/FileDownloadResponse)
