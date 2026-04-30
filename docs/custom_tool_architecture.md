# Custom Tool Node Architecture

This document describes the architecture of the **Custom Tool** node in Flowise, focused on
`packages/components/nodes/tools/CustomTool/core.ts` and its surrounding collaborators
(`CustomTool.ts` and the utility helpers in `packages/components/src/utils.ts`).

The Custom Tool node lets a user persist a reusable tool in the database (name, description,
JSON schema and a JavaScript function body) and then expose it to any LLM-powered agent or
chatflow as a LangChain `StructuredTool`. At runtime the node wires the user-authored code
into a sandboxed execution environment, validates the arguments produced by the LLM against a
Zod schema, and returns the stringified result back to the agent.

---

## 1. High-level Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Flowise Chatflow                             │
│                                                                        │
│   ┌───────────────┐       ┌────────────────────────┐                   │
│   │  LLM / Agent  │──────▶│  CustomTool_Tools      │   (node class)    │
│   └───────────────┘       │  (CustomTool.ts)       │                   │
│          ▲                └───────────┬────────────┘                   │
│          │ tool result                │ init()                         │
│          │                            ▼                                │
│          │                ┌────────────────────────┐                   │
│          │                │ DynamicStructuredTool  │  (core.ts)        │
│          │                │  - name                │                   │
│          │                │  - description         │                   │
│          │                │  - schema  (Zod)       │                   │
│          │                │  - code    (JS)        │                   │
│          │                │  - variables / flow    │                   │
│          │                └───────────┬────────────┘                   │
│          │                            │ call(arg, cfg, flowConfig)     │
│          │                            ▼                                │
│          │                ┌────────────────────────┐                   │
│          │                │ parseWithTypeConversion│  (Zod coerce)     │
│          │                └───────────┬────────────┘                   │
│          │                            │ parsed args                    │
│          │                            ▼                                │
│          │                ┌────────────────────────┐                   │
│          │                │createCodeExecutionSan- │                   │
│          │                │       dbox             │                   │
│          │                └───────────┬────────────┘                   │
│          │                            ▼                                │
│          │                ┌────────────────────────┐                   │
│          └────────────────│ executeJavaScriptCode  │                   │
│            stringified    │  (E2B remote or NodeVM)│                   │
│            response       └────────────────────────┘                   │
└────────────────────────────────────────────────────────────────────────┘
```

Two files cooperate:

| File            | Role                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CustomTool.ts` | Flowise node wrapper. Loads tool definitions from DB, builds the `DynamicStructuredTool` instance, exposes inputs to the UI. |
| `core.ts`       | Runtime class. Extends LangChain's `StructuredTool`, handles schema parsing, sandbox preparation and JS execution.           |

---

## 2. File: `core.ts`

`core.ts` exports three TypeScript symbols that make up the runtime:

-   `BaseDynamicToolInput` – minimal config a dynamic tool needs.
-   `DynamicStructuredToolInput<T>` – extends `BaseDynamicToolInput` with a Zod schema and an
    optional `func` override.
-   `DynamicStructuredTool<T>` – the concrete class registered with LangChain.

Internally it also defines `ToolInputParsingException`, a small `Error` subclass used to
carry the malformed input back to the caller.

### 2.1 Types

```17:30:packages/components/nodes/tools/CustomTool/core.ts
export interface BaseDynamicToolInput extends ToolParams {
    name: string
    description: string
    code: string
    returnDirect?: boolean
}

export interface DynamicStructuredToolInput<
    // eslint-disable-next-line
    T extends z.ZodObject<any, any, any, any> = z.ZodObject<any, any, any, any>
> extends BaseDynamicToolInput {
    func?: (input: z.infer<T>, runManager?: CallbackManagerForToolRun) => Promise<string>
    schema: T
}
```

-   `code` is the raw JavaScript the user wrote in the Flowise UI.
-   `schema` is a Zod object describing the arguments the LLM must supply.
-   `func` is an optional native override; when provided it would bypass the dynamic code
    path, but in practice Flowise always uses `code`.

### 2.2 `DynamicStructuredTool`

The class derives from LangChain's `StructuredTool` so it fits seamlessly into any agent
(`AgentExecutor`, LangGraph, etc.). Important state:

| Field                 | Source               | Purpose                                                             |
| --------------------- | -------------------- | ------------------------------------------------------------------- |
| `name`, `description` | constructor          | used by the LLM to discover and invoke the tool                     |
| `schema`              | constructor (Zod)    | argument validation + JSON schema advertised to the model           |
| `code`                | constructor (string) | JS body executed inside the sandbox                                 |
| `variables`           | `setVariables()`     | workspace variables, injected as `$vars`                            |
| `flowObj`             | `setFlowObject()`    | chatflow context, injected as `$flow`                               |
| `returnDirect`        | constructor          | LangChain flag: when true, tool output is returned to user verbatim |

### 2.3 Execution Flow – `call()`

The `call(arg, configArg?, tags?, flowConfig?)` method is the public entry point an agent
hits. It overrides the default `StructuredTool.call` so it can accept the extra
`flowConfig` bag (sessionId, chatId, input, state) which Flowise threads through at runtime.

Sequence:

1. **Normalize the callback config** via `parseCallbackConfigArg`; default `runName` to the
   tool's `name` so traces show the correct label.
2. **Validate / coerce the arguments** with `parseWithTypeConversion(this.schema, arg)`.
   This wraps `schema.parseAsync` and, on `ZodError`, attempts best-effort type conversion
   (string ↔ number, string ↔ boolean, JSON string → object, etc.) before retrying. If
   validation still fails, a `ToolInputParsingException` is thrown carrying the offending
   payload.
3. **Build a `CallbackManager`** merging the run-time callbacks with the tool-level ones
   and fire `handleToolStart` so observability (LangSmith, streaming UI, analytics) gets a
   consistent event.
4. **Invoke `_call(parsed, runManager, flowConfig)`** – the actual code execution (see
   next section). Errors are routed to `handleToolError` and rethrown.
5. **Stringify non-string results** (`JSON.stringify(result)`) so downstream LangChain
   serializers don't have to care about the return type.
6. **Emit `handleToolEnd`** with the final string and return it.

```59:105:packages/components/nodes/tools/CustomTool/core.ts
    async call(
        arg: z.output<T>,
        configArg?: RunnableConfig | Callbacks,
        tags?: string[],
        flowConfig?: { sessionId?: string; chatId?: string; input?: string; state?: ICommonObject }
    ): Promise<string> {
        const config = parseCallbackConfigArg(configArg)
        if (config.runName === undefined) {
            config.runName = this.name
        }
        let parsed
        try {
            parsed = await parseWithTypeConversion(this.schema, arg)
        } catch (e) {
            throw new ToolInputParsingException(`Received tool input did not match expected schema`, JSON.stringify(arg))
        }
        ...
    }
```

### 2.4 Code Execution – `_call()`

`_call()` is the protected hook that bridges LangChain and Flowise's sandboxing layer.

```108:134:packages/components/nodes/tools/CustomTool/core.ts
    protected async _call(
        arg: z.output<T>,
        _?: CallbackManagerForToolRun,
        flowConfig?: { sessionId?: string; chatId?: string; input?: string; state?: ICommonObject }
    ): Promise<string> {
        const additionalSandbox: ICommonObject = {}

        if (typeof arg === 'object' && Object.keys(arg).length) {
            for (const item in arg) {
                additionalSandbox[`$${item}`] = arg[item]
            }
        }

        const flow = this.flowObj ? { ...this.flowObj, ...flowConfig } : {}

        const sandbox = createCodeExecutionSandbox('', this.variables || [], flow, additionalSandbox)

        let response = await executeJavaScriptCode(this.code, sandbox)

        if (typeof response === 'object') {
            response = JSON.stringify(response)
        }

        return response
    }
```

Responsibilities:

1. **Project tool arguments into the sandbox** using a `$`-prefixed convention – every
   property of `arg` becomes `$<property>` (e.g. `{ city: 'Oslo' }` → `$city`). This is the
   contract users rely on inside their code.
2. **Merge per-chatflow flow data** (`this.flowObj`, set during `init`) with the per-call
   `flowConfig` (sessionId, chatId, input, state) into a single object exposed as `$flow`.
3. **Create the sandbox object** via `createCodeExecutionSandbox`, which also adds
   `$vars` (workspace variables) and blanks out dangerous globals (`process`, `fs`,
   `child_process`, `util`, `Symbol`).
4. **Run the user code** with `executeJavaScriptCode`. Depending on environment variables
   this either:
    - Uses **E2B** (remote micro-VM) when `E2B_APIKEY` is set, giving strong isolation and
      the ability to `npm install` libraries referenced by the code, or
    - Falls back to **`NodeVM`** (vm2) with a curated list of allowed built-in and external
      dependencies, secure Axios / fetch wrappers, and `eval`/`wasm` disabled.
5. **Normalize the output** to a string and return it.

### 2.5 Setters

`setVariables(variables)` and `setFlowObject(flow)` are simple state injectors used by
`CustomTool.init()` after construction. Keeping them as post-construction setters avoids
extending the `DynamicStructuredToolInput` contract (which is shared with LangChain typings).

---

## 3. Node wrapper: `CustomTool.ts`

`CustomTool.ts` implements Flowise's `INode` interface. It translates UI configuration and
DB rows into a `DynamicStructuredTool` instance.

### 3.1 UI Inputs

| Input                                                                    | Type            | Notes                                                                                                                       |
| ------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `selectedTool`                                                           | `asyncOptions`  | Dropdown populated by `loadMethods.listTools` which queries the `Tool` repository.                                          |
| `returnDirect`                                                           | `boolean`       | Forwarded to `DynamicStructuredTool.returnDirect`.                                                                          |
| `customToolName`, `customToolDesc`, `customToolSchema`, `customToolFunc` | hidden `string` | Allow the selected tool's name / description / schema / code to be overridden per node (for example by agentflow handoffs). |

### 3.2 `init()`

```96:139:packages/components/nodes/tools/CustomTool/CustomTool.ts
    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const selectedToolId = nodeData.inputs?.selectedTool as string
        ...
        const tool = await appDataSource.getRepository(databaseEntities['Tool']).findOneBy({
            id: selectedToolId
        })

        if (!tool) throw new Error(`Tool ${selectedToolId} not found`)
        const obj = {
            name: tool.name,
            description: tool.description,
            schema: z.object(convertSchemaToZod(tool.schema)),
            code: tool.func
        }
        if (customToolFunc) obj.code = customToolFunc
        ...
        if (customToolSchema) {
            obj.schema = SecureZodSchemaParser.parseZodSchema(customToolSchema) as z.ZodObject<ICommonObject, 'strip', z.ZodTypeAny>
        }

        const variables = await getVars(appDataSource, databaseEntities, nodeData, options)
        const flow = { chatflowId: options.chatflowid }

        let dynamicStructuredTool = new DynamicStructuredTool(obj)
        dynamicStructuredTool.setVariables(variables)
        dynamicStructuredTool.setFlowObject(flow)
        dynamicStructuredTool.returnDirect = customToolReturnDirect

        return dynamicStructuredTool
    }
```

Steps performed by `init`:

1. **Fetch the `Tool` row** by the selected id (`tool.name`, `tool.description`,
   `tool.schema`, `tool.func`).
2. **Build a Zod schema** from the persisted JSON schema using `convertSchemaToZod` – a
   small mapper that converts Flowise's schema array (`[{ property, type, description,
required }, ...]`) into Zod primitives (`string`, `number`, `boolean`, `date`) with
   proper `required_error` / `optional()` and `describe()` metadata.
3. **Apply node-level overrides** (`customToolFunc`, `customToolName`, `customToolDesc`).
   When `customToolSchema` is supplied, it is parsed through
   `SecureZodSchemaParser.parseZodSchema` instead of `convertSchemaToZod` so that a full
   Zod expression string (written directly in the UI) can be accepted safely.
4. **Resolve workspace variables** via `getVars`, which reads `Variable` entities scoped
   to the workspace and applies any per-run overrides in `nodeData.inputs.vars`.
5. **Construct `DynamicStructuredTool`**, inject variables and `{ chatflowId }` flow
   context, honor `returnDirect`, and return the instance.

The result is a LangChain-compatible tool that any agent/executor in the chatflow can bind.

### 3.3 `baseClasses`

`baseClasses` is set to `[this.type, 'Tool', ...getBaseClasses(DynamicStructuredTool)]`.
The `getBaseClasses` utility walks the prototype chain so Flowise's edge-compatibility
system knows this node satisfies `StructuredTool`, `Tool`, etc.

---

## 4. Sandbox & Utility Collaborators

The Custom Tool relies heavily on three helpers in `packages/components/src/utils.ts`:

### 4.1 `convertSchemaToZod(schema)`

Input format:

```json
[
    { "property": "city", "type": "string", "description": "City name", "required": true },
    { "property": "units", "type": "string", "description": "metric|imperial", "required": false },
    { "property": "days", "type": "number", "description": "Forecast range", "required": true }
]
```

Produces a record of Zod validators that is then wrapped with `z.object(...)`. Supported
types: `string`, `number`, `boolean`, `date`. `description` is surfaced to the LLM via
Zod's `.describe()`.

### 4.2 `parseWithTypeConversion(schema, arg)`

A tolerant wrapper over `schema.parseAsync(arg)`. If the LLM returns values with the wrong
primitive type (a very common failure mode, e.g. `"42"` instead of `42`), this helper
attempts a targeted conversion at the specific Zod error path, rewrites the offending
value, and retries. A `maxDepth` guard (default 10) prevents infinite loops.

### 4.3 `createCodeExecutionSandbox(input, variables, flow, additionalSandbox)`

Returns the object that becomes `sandbox` inside the VM:

```ts
{
  $input: '',                // empty for CustomTool – arguments come via $<field>
  util: undefined,
  Symbol: undefined,
  child_process: undefined,
  fs: undefined,
  process: undefined,
  ...additionalSandbox,      // $city, $units, $days, ...
  $vars: prepareSandboxVars(variables),
  $flow: { chatflowId, sessionId?, chatId?, input?, state? }
}
```

Nulling out `process`, `fs`, `child_process`, `util`, `Symbol` prevents the user code from
breaking out of the intended scope (the NodeVM already isolates the global object, but
these are defense-in-depth).

### 4.4 `executeJavaScriptCode(code, sandbox, options?)`

Two backends with the same contract:

**A. E2B remote sandbox** – chosen when `process.env.E2B_APIKEY` is set.

-   Serializes every sandbox entry into top-level `const` declarations.
-   Extracts ES module / `require` imports, auto-detects packages and installs them with
    `npm install` inside the micro-VM (with a strict name validation regex to block
    command-injection).
-   Wraps the user code in `module.exports = async function() { ... }()` and runs it via
    `sbx.runCode(..., { language: 'js' })`.
-   Returns `parseOutput(output)` or rethrows as `Sandbox Execution Error`.

**B. Local `NodeVM`** – the default fallback.

-   Allows built-in modules from `defaultAllowBuiltInDep` (plus `TOOL_FUNCTION_BUILTIN_DEP`).
-   Allows external modules from `defaultAllowExternalDependencies` (plus
    `TOOL_FUNCTION_EXTERNAL_DEP`, optionally the full `availableDependencies` list when
    `ALLOW_BUILTIN_DEP=true`).
-   Mocks `axios` and `node-fetch` with SSRF-aware secure wrappers
    (`secureAxiosRequest`, `secureFetch`) so tools cannot reach internal network ranges.
-   Disables `eval` and `wasm`, sets a timeout (300 s default, or `SANDBOX_TIMEOUT`).
-   Executes `module.exports = async function() { ${code} }()`.

In both backends the user code can:

-   `return` any JSON-serializable value (objects are JSON-stringified by `_call`).
-   `await` promises (the body is wrapped in an async IIFE).
-   Access `$vars.<name>`, `$flow.chatflowId`, `$flow.sessionId`, `$flow.chatId`,
    `$flow.input`, `$flow.state`, and `$<arg>` for every LLM-supplied argument.

### 4.5 `getVars`

Loads `Variable` rows for the current `workspaceId`. Supports two types:

-   `static` – value stored in DB.
-   `runtime` – value read from `process.env[name]` at sandbox build time (via
    `prepareSandboxVars`).

Per-run overrides passed in `nodeData.inputs.vars` are coerced to `static` in memory so
chatflow-level configuration can override persisted values without mutating the DB.

---

## 5. Runtime Sequence Diagram

```
Agent                DynamicStructuredTool       parseWithType       createCodeExec      executeJavaScriptCode
  │                         │                    Conversion           Sandbox                 (E2B / NodeVM)
  │  invoke(name, args)     │                        │                   │                           │
  │────────────────────────▶│                        │                   │                           │
  │                         │ parseAsync(args)       │                   │                           │
  │                         │───────────────────────▶│                   │                           │
  │                         │◀── parsed args ────────│                   │                           │
  │                         │ build additionalSandbox                    │                           │
  │                         │ merge flowObj + flowConfig                 │                           │
  │                         │──────────────────────────────────────────▶│                           │
  │                         │◀── sandbox ({$vars,$flow,$args,…}) ───────│                           │
  │                         │ executeJavaScriptCode(code, sandbox)                                   │
  │                         │────────────────────────────────────────────────────────────────────────▶│
  │                         │                                                                        │ run in VM
  │                         │◀────────────── return value ──────────────────────────────────────────│
  │                         │ JSON.stringify if object                                                │
  │◀── string result ───────│                                                                        │
```

Error paths:

-   Invalid input → `ToolInputParsingException` bubbles up and the agent receives a schema
    mismatch, which most agents handle by re-prompting the model.
-   Code execution error → `executeJavaScriptCode` throws `Sandbox Execution Error:` or
    `NodeVM Execution Error:`, which is forwarded to the callback manager via
    `handleToolError` and rethrown to the agent.

---

## 6. Security Considerations

The design assumes user-authored tool code is **semi-trusted** (the user owns the
workspace) but defends against both accidental and malicious code:

-   **Isolation** – E2B (preferred) provides full VM isolation; `NodeVM` provides process-level
    isolation with no `eval` / `wasm`.
-   **Dependency allowlist** – only `defaultAllowBuiltInDep` / `defaultAllowExternalDependencies`
    plus explicit opt-ins via `TOOL_FUNCTION_BUILTIN_DEP`, `TOOL_FUNCTION_EXTERNAL_DEP`, or
    `ALLOW_BUILTIN_DEP=true` are importable.
-   **SSRF protection** – Axios and node-fetch are replaced with `secureAxiosRequest` and
    `secureFetch` that block private / metadata IP ranges.
-   **No filesystem / process access** – `fs`, `child_process`, `process`, `util`, `Symbol`
    are forcefully set to `undefined` in the sandbox.
-   **Safe schema parsing** – custom Zod schemas coming from the UI are routed through
    `SecureZodSchemaParser` instead of raw `eval`.
-   **Safe npm installs (E2B)** – installed package names are validated against
    `^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$` to prevent shell injection.
-   **Timeouts** – 5 min default, overridable via `SANDBOX_TIMEOUT`.

---

## 7. Extension Points

Because `DynamicStructuredTool` is a thin subclass of `StructuredTool`, it can be extended
in several ways without forking Flowise:

| Extension                                                 | How                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Add new schema primitives (e.g. `enum`, `array`)          | Extend `convertSchemaToZod` in `packages/components/src/utils.ts`.                                                            |
| Provide a native JS implementation instead of a DB string | Pass a `func` on `DynamicStructuredToolInput`; override `_call` to prefer `func` when defined.                                |
| Inject more runtime context                               | Add fields to `flowConfig` in `call()` signature and surface them through `createCodeExecutionSandbox`'s `additionalSandbox`. |
| Use a different sandbox (e.g. Deno, isolated-vm)          | Swap the backend inside `executeJavaScriptCode`; the sandbox object shape is already backend-agnostic.                        |
| Emit streaming output                                     | Pass `options.streamOutput` to `executeJavaScriptCode`; both E2B and NodeVM paths honor it.                                   |

---

## 8. Summary

`core.ts` is a compact adapter (~140 lines) that:

1. Wraps a user-defined JS function as a LangChain `StructuredTool`.
2. Validates arguments against a Zod schema with forgiving type coercion.
3. Projects arguments, workspace variables, and flow context into a carefully curated
   sandbox.
4. Delegates execution to a hardened runtime (E2B remote sandbox or local `NodeVM`).
5. Emits proper LangChain callbacks so tracing / streaming / analytics stay intact.

`CustomTool.ts` is the Flowise node wrapper that hydrates that class from the database and
UI inputs. Together they provide the Flowise platform's "bring-your-own-function" tool
primitive while keeping a defensible isolation boundary around user code.
