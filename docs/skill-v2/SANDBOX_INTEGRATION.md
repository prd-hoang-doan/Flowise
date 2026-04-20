# Skill Sandbox Integration

This document expands on [`ARCHITECTURE.md` → Sandbox Integration](./ARCHITECTURE.md#sandbox-integration) and answers one practical question:

> **How does an LLM node execute or read a binary file that was uploaded as a skill asset?**

Skills and the sandbox are two layers that meet at one place: the `Sandbox` object's attribute map. Skills tell the LLM _what_ files and tools exist; the sandbox VM tells the LLM _where_ the bytes physically live and _how_ to run commands against them. This document walks through that handshake end to end.

---

## Table of Contents

-   [Big Picture](#big-picture)
-   [The Two Attribute Keys](#the-two-attribute-keys)
-   [Default Initializer Stack](#default-initializer-stack)
    -   [Published Mode (Production Runs)](#published-mode-production-runs)
    -   [Draft Mode (Debug / Preview Runs)](#draft-mode-debug--preview-runs)
-   [Initialization Order and Why It Matters](#initialization-order-and-why-it-matters)
-   [What Lives on the Sandbox Filesystem](#what-lives-on-the-sandbox-filesystem)
-   [What Lives in `sandbox.attrs`](#what-lives-in-sandboxattrs)
-   [LLM Node Reads: The Two Access Points](#llm-node-reads-the-two-access-points)
-   [Executing a Binary File via a Skill](#executing-a-binary-file-via-a-skill)
    -   [1. Authoring: Reference the Binary in a Skill](#1-authoring-reference-the-binary-in-a-skill)
    -   [2. Build: FileBuilder Passes It Through](#2-build-filebuilder-passes-it-through)
    -   [3. Sandbox Init: Bytes Materialized on Disk](#3-sandbox-init-bytes-materialized-on-disk)
    -   [4. Prompt Compile: Placeholder → Path String](#4-prompt-compile-placeholder--path-string)
    -   [5. Runtime: The LLM Uses the Bash Tool](#5-runtime-the-llm-uses-the-bash-tool)
    -   [6. Output Files: Harvested from `output/`](#6-output-files-harvested-from-output)
-   [Reading a Binary File via a Skill](#reading-a-binary-file-via-a-skill)
-   [What Happens When a Piece Is Missing](#what-happens-when-a-piece-is-missing)
-   [Skill Assets vs Workflow File Variables](#skill-assets-vs-workflow-file-variables)
-   [Sequence Diagram](#sequence-diagram)
-   [Reference: Source Files](#reference-source-files)

---

## Big Picture

The "sandbox integration" for skills is a three-part contract:

1. **A `SkillBundle` is loaded into `sandbox.attrs`** so the LLM node can compile prompts and derive tool policy.
2. **The `AppAssetFileTree` is loaded into `sandbox.attrs`** so the compiler can resolve `§[file]...§` placeholders to paths relative to the sandbox working directory.
3. **The asset bytes are materialized on the sandbox VM's filesystem** under `skills/` so the LLM can actually `cat`, `python3`, `node`, `pdftotext`, etc. them through the bash tool.

Without step 1 or 2, skill compilation is silently skipped. Without step 3, any path the LLM sees in its prompt would be dangling.

---

## The Two Attribute Keys

Two `AttrKey` constants define the entire surface between skills and the sandbox:

```python
class SkillAttrs:
    BUNDLE = AttrKey("skill_bundle", SkillBundle)

class AppAssetsAttrs:
    FILE_TREE = AttrKey("file_tree", AppAssetFileTree)
    APP_ASSETS_ID = AttrKey("app_assets_id", str)
```

`Sandbox.attrs` is a typed map (`AttrMap`). Setting a value with `AttrKey[T]` guarantees the getter returns a `T | None`. This is why the LLM node can do:

```python
bundle: SkillBundle | None = sandbox.attrs.get(SkillAttrs.BUNDLE)
file_tree: AppAssetFileTree | None = sandbox.attrs.get(AppAssetsAttrs.FILE_TREE)
```

…with full type safety and no dictionary keys sprinkled across the code base.

---

## Default Initializer Stack

A `Sandbox` is built through a fluent builder (`services/sandbox/sandbox_service.py`). Each `.initializer(...)` call appends a `SandboxInitializer` that runs before the workflow starts. Initializers come in two flavors:

| Marker                    | Meaning                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SyncSandboxInitializer`  | Must complete before any async/remote setup. Pure in-process work (setting attrs, loading cached objects). |
| `AsyncSandboxInitializer` | Runs against the VM (downloads, unzips, shell commands). Can run in the background.                        |

### Published Mode (Production Runs)

When a user triggers a published workflow:

```python
(
    .initializer(AppAssetAttrsInitializer(tenant, app, assets.id))   # sync
    .initializer(AppAssetsInitializer(tenant, app, assets.id))       # async
    .initializer(DifyCliInitializer(tenant, user, app, assets.id))   # async
    .initializer(SkillInitializer(tenant, user, app, assets.id))     # sync
)
```

| Step                       | What it does                                                                                                                                               | Side effect                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `AppAssetAttrsInitializer` | Loads the published `AppAssets` record, sets `FILE_TREE` and `APP_ASSETS_ID` on `sandbox.attrs`.                                                           | In-memory metadata ready.   |
| `AppAssetsInitializer`     | Downloads `artifacts/{assets_id}/build.zip` via a signed URL, unzips into `/sandbox/workdir/skills/`, and `chmod -R u+rwX,go+rX` to guarantee readability. | Asset bytes land on the VM. |
| `DifyCliInitializer`       | Installs the Dify CLI into the VM (so `PATH` prefixed bin is ready for API/builtin tools).                                                                 | CLI available.              |
| `SkillInitializer`         | Calls `SkillManager.load_bundle(tenant, app, assets.id)` (Redis first, object storage on miss) and stores it under `SkillAttrs.BUNDLE`.                    | `SkillBundle` ready.        |

### Draft Mode (Debug / Preview Runs)

When running a draft (unpublished) workflow:

```python
(
    .initializer(AppAssetAttrsInitializer(tenant, app, assets.id))     # sync
    .initializer(DraftAppAssetsInitializer(tenant, app, assets.id))    # async
    .initializer(DifyCliInitializer(tenant, user, app, assets.id))     # async
    .initializer(SkillInitializer(tenant, user, app, assets.id))       # sync
)
```

`DraftAppAssetsInitializer` replaces `AppAssetsInitializer`. It walks `FILE_TREE` (which the previous sync step already populated) and downloads each file **individually**, choosing between the _resolved_ and _raw draft_ payload per file extension:

```python
keys = [
    AssetPaths.resolved(tenant, app, build_id, node.id)   # compiled .md
    if node.extension == "md"
    else AssetPaths.draft(tenant, app, node.id)            # raw bytes for everything else
    for node in tree.walk_files()
]
```

This is the rule the ARCHITECTURE overview mentions: **`.md` files use the compiled (resolved) output; every other extension uses the original uploaded bytes.** Both land under `/sandbox/workdir/skills/` with the same tree-relative paths.

---

## Initialization Order and Why It Matters

Order in the builder stack matches execution order:

```
AppAssetAttrsInitializer  ← sync  ┐
(Draft|Published)AppAssets ← async │ file tree is needed by both
DifyCliInitializer         ← async │ the asset init and the skill init
SkillInitializer           ← sync  ┘
```

Two invariants drive this order:

1. `DraftAppAssetsInitializer` reads `sandbox.attrs.get(AppAssetsAttrs.FILE_TREE)` to know which files to download. So `AppAssetAttrsInitializer` **must** run first.
2. `SkillInitializer` does not touch the VM — it only populates `sandbox.attrs`. Because it is a `SyncSandboxInitializer`, the runtime can treat it as "ready immediately", independent of how long the async download takes.

By the time the workflow engine enters the first LLM node, all four initializers have completed:

-   `sandbox.attrs[FILE_TREE]` → the authored asset tree.
-   `sandbox.attrs[APP_ASSETS_ID]` → the build/publish ID.
-   `sandbox.attrs[BUNDLE]` → the compiled `SkillBundle`.
-   `sandbox.vm:/sandbox/workdir/skills/` → all asset bytes on disk.
-   `sandbox.vm:$PATH` → `DifyCli`-managed binaries for API/builtin tools.

---

## What Lives on the Sandbox Filesystem

For a recruiting workflow that authored three skills, one data file, and one code file, the VM ends up looking like this:

```
/sandbox/workdir/
├── skills/
│   ├── resume-screener.md          ← compiled (placeholders replaced)
│   ├── interview-questions.md      ← compiled
│   ├── email-drafter.md            ← compiled
│   ├── job-description.txt         ← raw draft bytes
│   ├── scoring_algorithm.py        ← raw draft bytes (executable)
│   └── brand_guide.pdf             ← raw draft bytes (binary)
├── output/                         ← LLM-written artifacts land here
└── ... (DifyCli binaries on $PATH)
```

Every file's on-disk path matches `tree.get_path(node.id)` exactly, so the compiler can round-trip between `asset_id` and filesystem path deterministically.

---

## What Lives in `sandbox.attrs`

| Key                            | Producer                   | Consumer(s)                                                          | Nullable?                                                                         |
| ------------------------------ | -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `SkillAttrs.BUNDLE`            | `SkillInitializer`         | `LLMNode.handle_list_messages`, `LLMNode._extract_tool_dependencies` | Yes — if `SkillManager.load_bundle` returns `None`, skill compilation is skipped. |
| `AppAssetsAttrs.FILE_TREE`     | `AppAssetAttrsInitializer` | `LLMNode` compile, `DraftAppAssetsInitializer`                       | Yes — same behavior.                                                              |
| `AppAssetsAttrs.APP_ASSETS_ID` | `AppAssetAttrsInitializer` | Telemetry / diagnostics                                              | Yes.                                                                              |

The _required_ pair for skill resolution is `(BUNDLE, FILE_TREE)`. If either is `None`, the LLM node executes with literal prompt text — placeholders are left as-is and no tool dependencies are collected.

---

## LLM Node Reads: The Two Access Points

### 1. `handle_list_messages` — prompt text resolution

```python
bundle = sandbox.attrs.get(SkillAttrs.BUNDLE)
file_tree = sandbox.attrs.get(AppAssetsAttrs.FILE_TREE)

if bundle is not None and file_tree is not None:
    skill_entry = SkillCompiler().compile_one(
        bundle=bundle,
        document=SkillDocument(
            skill_id="anonymous",
            content=plain_text,
            metadata=message.metadata or {},
        ),
        file_tree=file_tree,
        base_path=AppAssets.PATH,   # "/sandbox/workdir/skills"
    )
    plain_text = skill_entry.content
```

`base_path=AppAssets.PATH` is the bridge: it tells the compiler what prefix to put in front of resolved file paths so the string that lands in the LLM's prompt points at the _actual VM path_.

### 2. `_extract_tool_dependencies` — tool access policy

The same `compile_one` call is replayed, but the consumer uses `skill_entry.tools` instead of `skill_entry.content`. The aggregated `ToolDependencies` feed into `ToolAccessPolicy`, which is passed to `SandboxBashSession(tools=tool_dependencies)` — so the policy is enforced at the point of execution.

---

## Executing a Binary File via a Skill

This is the most frequently asked question. The short answer: **the LLM never executes a file directly — it issues a `bash(...)` tool call whose command references the path the skill compiler produced.**

### 1. Authoring: Reference the Binary in a Skill

```markdown
# Resume Screening Skill

Run the scoring algorithm:
§[file].[app].[file-scorer]§

Execute it like:
python3 §[file].[app].[file-scorer]§ "<resume>" "<jd>"
```

`file-scorer` is the asset ID of `scoring_algorithm.py` in the app's asset tree.

### 2. Build: FileBuilder Passes It Through

At publish time, `AssetBuildPipeline` routes the file to `FileBuilder` (since its extension is not `.md`). `FileBuilder` records the draft storage key **unchanged** — no compilation, no transformation. The raw bytes are packaged into `build.zip`.

### 3. Sandbox Init: Bytes Materialized on Disk

-   **Published**: `AppAssetsInitializer` unzips `build.zip` into `skills/`.
-   **Draft**: `DraftAppAssetsInitializer` downloads `AssetPaths.draft(...)` for the `.py` node (since `extension != "md"`) and writes it to `skills/scoring_algorithm.py`.

Both paths guarantee the exact original bytes of `scoring_algorithm.py` end up at `/sandbox/workdir/skills/scoring_algorithm.py`.

### 4. Prompt Compile: Placeholder → Path String

When the LLM node runs:

```
§[file].[app].[file-scorer]§
```

…`SkillCompiler._resolve_content()` replaces it with the resolved path:

```
skills/scoring_algorithm.py
```

The LLM receives:

```
Run the scoring algorithm:
skills/scoring_algorithm.py

Execute it like:
python3 skills/scoring_algorithm.py "<resume>" "<jd>"
```

The compiler never inlines the file's source code — only its path.

### 5. Runtime: The LLM Uses the Bash Tool

When computer-use (sandbox) mode is enabled, `LLMNode._invoke_llm_with_sandbox` opens a `SandboxBashSession`:

```python
with SandboxBashSession(sandbox=sandbox, node_id=self.id, tools=tool_dependencies) as session:
    strategy = StrategyFactory.create_strategy(
        tools=[session.bash_tool],                  # the only tool exposed
        agent_strategy=AgentEntity.Strategy.FUNCTION_CALLING,
        ...
    )
    outputs = strategy.run(prompt_messages=..., stream=True)
```

Inside the function-calling loop, the LLM emits:

```json
{
    "name": "bash",
    "arguments": { "bash": "python3 skills/scoring_algorithm.py 'John has 8 years...' 'Senior Python Dev...'" }
}
```

`SandboxBashTool._invoke` prepends environment exports and executes:

```python
env_exports = (
    f"export PATH={self._tools_path}:/usr/local/bin:/usr/bin:/bin && "
    f"export DIFY_CLI_CONFIG={self._tools_path}/{DifyCli.CONFIG_FILENAME} && "
)
full_command = env_exports + command
cmd_list = ["bash", "-c", full_command]
future = submit_command(self._sandbox, conn, cmd_list)
result = future.result(timeout=timeout)
```

`stdout` and `stderr` are truncated to `MAX_OUTPUT_LENGTH = 8000` chars (head 2500 / tail 2500) and returned as a `ToolInvokeMessage`. The `FunctionCallStrategy` appends the truncated stdout as a `ToolPromptMessage`, feeds the whole transcript back to the model, and the loop continues until the model responds without a tool call.

### 6. Output Files: Harvested from `output/`

If the Python script (or any subsequent LLM-issued command) writes files, **only files under `/sandbox/workdir/output/` are collected back**:

```python
file_states = vm.list_files("output", limit=MAX_OUTPUT_FILES)
for file_state in file_states:
    file_content = vm.download_file(file_state.path)
    tool_file = tool_file_manager.create_file_by_raw(
        user_id=self._user_id,
        tenant_id=self._tenant_id,
        file_binary=file_content.getvalue(),
        mimetype=mime_type,
        filename=filename,
    )
```

These become `ToolFile` records and surface as `File` objects in the node's output, where downstream workflow nodes can consume them (attach to email, render, etc.).

---

## Reading a Binary File via a Skill

Reading is the same mechanism as executing, just with a different command:

| Goal                          | Example bash tool call                       |
| ----------------------------- | -------------------------------------------- |
| Read a text file              | `cat skills/job-description.txt`             |
| Peek at the first KB of a PDF | `head -c 1024 skills/brand_guide.pdf \| xxd` |
| Extract text from a PDF       | `pdftotext skills/brand_guide.pdf -`         |
| Convert an image to base64    | `base64 skills/portfolio.png`                |
| List what's available         | `ls skills/`                                 |

Crucially, **the binary bytes never enter the LLM's prompt context directly** through the skill path. They enter only through `stdout` of a bash command — which means:

1. The LLM must _choose_ to run a command that emits the content.
2. The content is clipped to 8000 chars (head/tail) before the LLM sees it.
3. Unreadable blobs (e.g. piping raw PDF bytes through `cat`) will look like garbled text; the LLM typically recognizes this and switches to a proper extractor (`pdftotext`, `pdfinfo`, `exiftool`, etc.).

If you need the model to _natively_ consume an image or PDF (vision, document understanding), you cannot do it via a skill asset — promote the file to a workflow variable instead. See [Skill Assets vs Workflow File Variables](#skill-assets-vs-workflow-file-variables).

---

## What Happens When a Piece Is Missing

| Missing piece                        | Symptom                                                                                                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkillAttrs.BUNDLE` is `None`        | Skill compilation is skipped. `§[...]§` placeholders appear literally in the LLM's prompt. No `ToolDependencies` collected. `_extract_tool_dependencies` will raise if the node is in sandbox mode (because `Sandbox` is also required).                       |
| `AppAssetsAttrs.FILE_TREE` is `None` | Same as above — compilation is skipped.                                                                                                                                                                                                                        |
| Bytes missing on disk (`skills/...`) | Compilation still succeeds (the compiler only works with the tree), but the LLM's bash command fails: `python3: can't open file 'skills/scoring_algorithm.py': No such file`. The stderr flows back to the LLM which typically retries or reports the failure. |
| `DifyCliInitializer` skipped         | API/builtin tools that rely on the Dify CLI shim on `$PATH` won't resolve. Bash commands targeting bare `python3`/`node`/`cat` still work because they're in `/usr/local/bin:/usr/bin:/bin`.                                                                   |
| No `.md` files at all                | `SkillBuilder` still writes an **empty** `SkillBundle` on publish so `SkillManager.load_bundle` always succeeds. `bundle.get(skill_id)` returns `None` for any ID, placeholders fall back to their anonymous form.                                             |

---

## Skill Assets vs Workflow File Variables

Both can end up in an LLM prompt, but they travel on entirely different rails:

| Dimension                 | Skill Asset (`§[file].[app].[asset-id]§`)                   | Workflow Variable (`{{#sys.files#}}`, `{{#start.x#}}`)                              |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Where bytes live          | On the sandbox VM filesystem under `skills/`                | In object storage, referenced by a `File` object                                    |
| How the LLM "sees" them   | A path string embedded in prompt text                       | A multimodal block (`ImagePromptMessageContent`, `DocumentPromptMessageContent`, …) |
| Transport                 | None — bytes stay local to the VM                           | Base64 inline **or** signed URL (`MULTIMODAL_SEND_FORMAT`)                          |
| Model capability required | None for the path; `bash` execution to actually read bytes  | `ModelFeature.VISION` / `DOCUMENT` / `AUDIO` / `VIDEO`                              |
| Typical use               | Scripts, data files, reference material the LLM manipulates | Resumes, screenshots, audio the LLM perceives                                       |
| Binary sent to LLM        | **No**                                                      | **Yes**                                                                             |

The skill placeholder system is intentionally a **text composition layer**, not a binary ingestion layer. If your workflow requires the model to natively _see_ a PDF or image, use a workflow variable; if it requires the model to _act on_ a file (parse, run, transform, inspect), a skill asset plus `bash` is the right tool.

---

## Sequence Diagram

```
┌───────────────────── BUILD TIME ─────────────────────┐
│                                                       │
│  AssetBuildPipeline                                   │
│    SkillBuilder ─ compile_all() → SkillBundle         │
│                 ─ save_bundle() → object storage      │
│    FileBuilder  ─ passthrough *.py, *.pdf, *.txt      │
│    All assets   → build.zip                           │
└───────────────────────────────────────────────────────┘
                          │
                     RUN TRIGGERED
                          ▼
┌─────────────────── SANDBOX BUILD ────────────────────┐
│                                                       │
│  AppAssetAttrsInitializer (sync)                      │
│    sandbox.attrs[FILE_TREE]    = <AppAssetFileTree>   │
│    sandbox.attrs[APP_ASSETS_ID]= "<build-id>"         │
│                                                       │
│  AppAssetsInitializer / DraftAppAssetsInitializer     │
│    curl build.zip → unzip → /sandbox/workdir/skills/  │
│    (draft: per-file download; resolved .md else draft)│
│                                                       │
│  DifyCliInitializer                                   │
│    installs CLI, prepends $PATH                       │
│                                                       │
│  SkillInitializer (sync)                              │
│    SkillManager.load_bundle() ← Redis → object store  │
│    sandbox.attrs[BUNDLE] = <SkillBundle>              │
└───────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────── LLM NODE RUN ────────────────────┐
│                                                       │
│  bundle    = sandbox.attrs.get(SkillAttrs.BUNDLE)     │
│  file_tree = sandbox.attrs.get(AppAssetsAttrs        │
│                                  .FILE_TREE)          │
│                                                       │
│  for each prompt:                                     │
│      SkillCompiler.compile_one(bundle, doc, tree,     │
│                                base_path=skills/)     │
│       → resolved text (paths substituted)             │
│       → ToolDependencies                              │
│                                                       │
│  ToolAccessPolicy ← ToolDependencies                  │
│                                                       │
│  with SandboxBashSession(sandbox, node_id, tools):    │
│    FunctionCallStrategy loop:                         │
│      LLM → { "bash": "python3 skills/x.py ..." }      │
│      SandboxBashTool → execute in VM                  │
│      stdout/stderr (truncated) → ToolPromptMessage    │
│      ... repeat until no tool_calls ...               │
│                                                       │
│  collect_output_files("output/")                      │
│    → File objects for downstream nodes                │
└───────────────────────────────────────────────────────┘
```

---

## Reference: Source Files

| Concern                                            | File                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `SkillAttrs`                                       | `api/core/skill/constants.py`                                             |
| `SkillBundle`, `SkillCompiler`, `SkillManager`     | `api/core/skill/`                                                         |
| `AppAssetsAttrs`, `AppAssets.PATH`                 | `api/core/app_assets/constants.py`, `api/core/sandbox/entities/config.py` |
| Skill initializer (loads `SkillBundle` into attrs) | `api/core/sandbox/initializer/skill_initializer.py`                       |
| File-tree initializer (loads `AppAssetFileTree`)   | `api/core/sandbox/initializer/app_asset_attrs_initializer.py`             |
| Published asset materialization (zip → VM)         | `api/core/sandbox/initializer/app_assets_initializer.py`                  |
| Draft asset materialization (per-file download)    | `api/core/sandbox/initializer/draft_app_assets_initializer.py`            |
| Initializer wiring (default stacks)                | `api/services/sandbox/sandbox_service.py`                                 |
| LLM node reads                                     | `api/core/workflow/nodes/llm/node.py`                                     |
| Bash tool (command execution)                      | `api/core/sandbox/bash/bash_tool.py`                                      |
| Bash session + output harvesting                   | `api/core/sandbox/bash/session.py`                                        |

See also:

-   [`ARCHITECTURE.md`](./ARCHITECTURE.md) — overall skill feature design.
-   [`skill_invocation.md`](./skill_invocation.md) — end-to-end recruiting workflow example, including the full code-file and multimodal-file walkthroughs this document links into.
