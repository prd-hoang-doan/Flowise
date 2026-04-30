Now I have a clear picture of the system. Let me walk you through a concrete Recruiting Workflow example that covers the full lifecycle.

## Recruiting Workflow: End-to-End Skill Example

## The Scenario

A hiring manager builds a Dify workflow that:

1. Screens resumes against a job description
2. Generates interview questions
3. Sends results via email

They author three skill assets (.md files) and one data file, then wire them into LLM nodes.

Step 1: The User's Asset Tree

The user creates these files in the Dify UI (stored in the AppAssetFileTree):

Asset ID
File Name
Type

skill-screen
resume-screener.md
Skill

skill-interview
interview-questions.md
Skill

skill-email
email-drafter.md
Skill

file-jd
job-description.txt
Data file

Step 2: What the User Writes (Skill Documents)

resume-screener.md — references the job description file and an API tool for fetching candidate data:

# Resume Screening Skill

You are an expert recruiter. Compare the candidate's resume against
the job description found at: §[file].[app].[file-jd]§
Use the candidate lookup tool to fetch structured profile data:
§[tool].[hr_platform].[candidate_lookup].[tool-uuid-1]§
Score the candidate 1-10 on: technical fit, culture fit, experience level.

Metadata:

```json
{
    "tools": {
        "tool-uuid-1": {
            "type": "api",
            "provider": "hr_platform",
            "tool_name": "candidate_lookup",
            "credential_id": "cred-hr-api",
            "enabled": true
        }
    }
}
```

interview-questions.md — references the screener skill (transitive dependency) and a built-in tool:

````md
# Interview Question Generator

Based on the screening results from: §[file].[app].[skill-screen]§
Generate 5 behavioral and 5 technical interview questions.
Use §[tool].[sandbox].[python].[tool-uuid-2]§ to format the output as
a structured JSON with question categories and difficulty levels.

Metadata:

```json
{
    "tools": {
        "tool-uuid-2": {
            "type": "builtin",
            "provider": "sandbox",
            "tool_name": "python",
            "enabled": true
        }
    }
}
```
````

email-drafter.md — references both the screener and interview skills, plus an email-sending tool:

```md
# Email Drafter

Draft a professional email to the hiring panel summarizing:

-   Screening report: §[file].[app].[skill-screen]§
-   Interview questions: §[file].[app].[skill-interview]§
    Send the email using: §[tool].[comms].[send_email].[tool-uuid-3]§

Metadata:

{
"tools": {
"tool-uuid-3": {
"type": "api",
"provider": "comms",
"tool_name": "send_email",
"credential_id": "cred-smtp",
"enabled": true
}
}
}
```

Step 3: Compilation (compile_all)

When the user publishes, SkillBuilder loads all three .md files and calls SkillCompiler.compile_all(). Here's what happens in each phase:
Phase 1 — Parse & Build Dependency Graph:

```json
skill-screen   → [file-jd]                    (data file, not a skill)
skill-interview → [skill-screen]               (skill-to-skill edge)
skill-email    → [skill-screen, skill-interview] (two skill edges)

The forward dependency graph:


{
  "skill-screen":    [],
  "skill-interview": ["skill-screen"],
  "skill-email":     ["skill-screen", "skill-interview"]
}
```

The reverse graph:

```json
{
    "skill-screen": ["skill-interview", "skill-email"],
    "skill-interview": ["skill-email"]
}
```

Phase 2 — Direct Compilation (resolve placeholders independently):
Each skill gets its own placeholders resolved:

```md
Skill
Resolved Content (excerpt)
Direct Tools
Direct Files

skill-screen
...job description found at: ./job-description.txt ... [Candidate Lookup: candidate_lookup_tool-uuid-1]...
candidate_lookup
file-jd

skill-interview
...screening results from: ./resume-screener.md ... [Python: python_tool-uuid-2]...
python
skill-screen

skill-email
...Screening report: ./resume-screener.md ... Interview questions: ./interview-questions.md ... [Send Email: send_email_tool-uuid-3]...
send_email
skill-screen, skill-interview
```

Phase 3 — Transitive Dependency Propagation (fixed-point iteration):
This is where it gets interesting. The compiler iterates until no changes occur:
Iteration 1:

-   skill-interview depends on skill-screen → inherits candidate_lookup tool + file-jd file reference
-   skill-email depends on skill-screen → inherits candidate_lookup + file-jd
-   skill-email depends on skill-interview → inherits python + skill-screen (already has it)

Iteration 2:

-   skill-email now has skill-interview which pulled in candidate_lookup from skill-screen → already present, no change
-   Fixed point reached. Done.

Final SkillBundle entries:

Skill
All Tool Dependencies
All File References

skill-screen
candidate_lookup
file-jd

skill-interview
python, candidate_lookup (transitive)
skill-screen, file-jd (transitive)

skill-email
send_email, candidate_lookup (transitive), python (transitive)
skill-screen, skill-interview, file-jd (transitive)

The key insight: skill-email never directly declares candidate_lookup or python, but because it references skills that use them, it inherits those tool dependencies transitively. This mirrors the test pattern in TestSkillCompilerTransitiveDependencies:
test_skill_compiler.py
Lines 141-186

class TestSkillCompilerTransitiveDependencies:
def test_references_are_transitive(self): # ... # skill-a references skill-b via file placeholder # skill-b declares tool "api_tool" # After compilation, skill-a inherits "api_tool" transitively

Step 4: Runtime Execution (LLM Node invokes the skill)

Now the workflow runs. The LLM node for "Generate Interview Questions" has this prompt message:

LLMNodeChatModelMessage(
role="system",
text="You are a recruiting assistant.",
skill=False,
metadata=None,
)
LLMNodeChatModelMessage(
role="user",
text="§[file].[app].[skill-interview]§\n\nCandidate resume: {{resume_text}}",
skill=True,
metadata={
"tools": {},
"files": [{"source": "app", "asset_id": "skill-interview"}]
},
)

The LLM node calls SkillCompiler.compile_one() on this prompt. This works exactly like TestSkillCompilerCompileOne.test_compile_one_resolves_context:
test_skill_compiler.py
Lines 189-223

```python
class TestSkillCompilerCompileOne:
    def test_compile_one_resolves_context(self):
        # ...
        # The prompt is an "anonymous" skill referencing a bundle entry
        # compile_one looks up "skill-lib" in the bundle
        # and inherits its tool dependencies transitively
```

Here's what happens:

1. The prompt is treated as an anonymous skill that references skill-interview via §[file].[app].[skill-interview]§.
2. The compiler looks up skill-interview in the pre-built SkillBundle.
3. It resolves the file placeholder to skills/interview-questions.md.
4. It pulls in skill-interview's transitive tool dependencies: python + candidate_lookup.
5. The final prompt text sent to the LLM becomes:

```md
skills/interview-questions.md
Candidate resume: <actual resume content from variable>

1. The ToolDependencies returned contain both python and candidate_lookup, which feed into ToolAccessPolicy — the LLM is authorized to call both tools during this node's execution.
```

Step 5: Tool Access Policy (Security Gate)

The \_extract_tool_dependencies() method on the LLM node collects ToolDependencies from all compiled prompts and creates a ToolAccessPolicy:

ToolAccessPolicy:
allowed tools: - (api, hr_platform, candidate_lookup) with credential "cred-hr-api" - (builtin, sandbox, python)

If the LLM tries to call send_email during this node, the policy blocks it — that tool is only in the skill-email bundle entry, not in skill-interview. Each LLM node only gets access to the tools declared by the skills it actually references.

Visual Summary

┌─────────────────── AUTHORING ───────────────────┐
│ │
│ resume-screener.md ──→ job-description.txt │
│ ↑ (data file) │
│ │ │
│ interview-questions.md ──→ resume-screener.md │
│ ↑ │
│ │ │
│ email-drafter.md ──→ resume-screener.md │
│ ──→ interview-questions.md │
└───────────────────────────────────────────────────┘
│
PUBLISH
▼
┌─────────────────── COMPILE ─────────────────────┐
│ │
│ SkillCompiler.compile_all() │
│ 1. Parse placeholders, build dep graph │
│ 2. Resolve each skill's own placeholders │
│ 3. Propagate tools transitively: │
│ email ← interview ← screen │
│ email gets: send_email + python │
│ + candidate_lookup │
│ │
│ Output: SkillBundle (stored in object storage) │
└───────────────────────────────────────────────────┘
│
RUNTIME
▼
┌─────────────────── LLM NODE ────────────────────┐
│ │
│ LLM Node: "Generate Interview Questions" │
│ │
│ Prompt: §[file].[app].[skill-interview]§ │
│ │
│ SkillCompiler.compile_one() │
│ → resolved text: "skills/interview-questions.md"│
│ → tools: [python, candidate_lookup] │
│ │
│ ToolAccessPolicy gates tool invocations │
│ ✓ python (allowed) │
│ ✓ candidate_lookup (allowed, cred-hr-api) │
│ ✗ send_email (not in scope) │
└───────────────────────────────────────────────────┘

The core design principle: skills are composable prompt modules. A skill references other skills and tools via placeholders. The compiler resolves placeholders into readable text and propagates tool authorizations transitively, so each LLM node gets exactly the tool access it needs — no more, no less.

---

## Deep Dive: Code File Execution in Skills

The previous sections showed how `.md` skills and `.txt` data files work — the LLM receives their **paths** as resolved text in the prompt. But what happens when the user uploads a Python script, a JavaScript module, or any executable file as an asset? How does the LLM call it, how is it executed, and how does the LLM see the result?

### The Key Insight: Files Become Filesystem Paths, Not Inline Content

When a skill references any file via `§[file].[app].[asset-id]§`, the `SkillCompiler` resolves it to a **path string** — not the file's content. The `FileTreePathResolver` computes either a relative path (skill-to-skill) or a prefixed path like `skills/lib/scoring.py` (for anonymous prompts in LLM nodes).

The LLM sees something like:

```
Run the scoring algorithm at: skills/lib/scoring.py
```

It never sees the raw Python source inlined into its prompt. Instead, the actual file bytes exist **on disk inside the sandbox VM**, and the LLM must use a **tool** to interact with them.

---

### Extended Recruiting Example: Adding a Scoring Script

Building on our recruiting workflow, suppose the hiring manager uploads a Python script that implements a proprietary scoring algorithm.

#### Updated Asset Tree

| Asset ID          | File Name                  | Type          |
| ----------------- | -------------------------- | ------------- |
| `skill-screen`    | `resume-screener.md`       | Skill         |
| `skill-interview` | `interview-questions.md`   | Skill         |
| `skill-email`     | `email-drafter.md`         | Skill         |
| `file-jd`         | `job-description.txt`      | Data file     |
| **`file-scorer`** | **`scoring_algorithm.py`** | **Code file** |

The Python script (`scoring_algorithm.py`):

```python
"""Candidate scoring algorithm used by the recruiting workflow."""
import json
import sys

def score_candidate(resume_text: str, jd_text: str) -> dict:
    technical_keywords = jd_text.lower().split()
    resume_lower = resume_text.lower()
    match_count = sum(1 for kw in technical_keywords if kw in resume_lower)
    technical_score = min(10, round(match_count / max(len(technical_keywords), 1) * 10, 1))
    experience_years = 0
    for word in resume_text.split():
        if word.isdigit() and 1 <= int(word) <= 40:
            experience_years = max(experience_years, int(word))
    experience_score = min(10, experience_years)
    culture_score = 7.0  # baseline, refined by LLM
    return {
        "technical_fit": technical_score,
        "experience_level": experience_score,
        "culture_fit": culture_score,
        "overall": round((technical_score + experience_score + culture_score) / 3, 1),
    }

if __name__ == "__main__":
    resume = sys.argv[1] if len(sys.argv) > 1 else ""
    jd = sys.argv[2] if len(sys.argv) > 2 else ""
    print(json.dumps(score_candidate(resume, jd), indent=2))
```

The updated `resume-screener.md` now references the script:

```markdown
# Resume Screening Skill

You are an expert recruiter. Compare the candidate's resume against
the job description found at: §[file].[app].[file-jd]§

First, run the scoring algorithm to get a baseline score:
§[file].[app].[file-scorer]§

Execute it with: python3 §[file].[app].[file-scorer]§ "<resume>" "<jd>"

Then use the candidate lookup tool to fetch structured profile data:
§[tool].[hr_platform].[candidate_lookup].[tool-uuid-1]§

Combine the algorithmic score with your qualitative assessment.
```

---

### How Code Files Get Into the Sandbox

#### Build Pipeline: SkillBuilder vs FileBuilder

When the user publishes, the `AssetBuildPipeline` distributes files to builders in priority order:

1. **`SkillBuilder`** claims `.md` files → compiles them into a `SkillBundle`.
2. **`FileBuilder`** claims everything else (`.py`, `.js`, `.txt`, etc.) → passes them through as-is.

`FileBuilder` does not transform code files. It simply records their storage key and tree path:

```python
# FileBuilder.build() — passthrough for non-md assets
AssetItem(
    asset_id="file-scorer",
    path="scoring_algorithm.py",         # tree-relative path
    file_name="scoring_algorithm.py",
    extension="py",
    storage_key="app_assets/{tenant}/{app}/draft/{node_id}",  # raw draft blob
)
```

All `AssetItem`s (from both builders) are packaged into a ZIP at:

```
app_assets/{tenant}/{app}/artifacts/{assets_id}/build.zip
```

#### Sandbox Initialization: Files Materialized on Disk

Before the workflow runs, sandbox initializers prepare the VM:

**Published mode** (`AppAssetsInitializer`):
Downloads the artifact ZIP and extracts it under `skills/` in the sandbox working directory.

**Draft mode** (`DraftAppAssetsInitializer`):
Downloads each file individually. For `.md` files it uses the **resolved** (compiled) content. For everything else, it uses the **raw draft** content — the original uploaded bytes:

```python
# DraftAppAssetsInitializer — chooses resolved vs draft per file type
keys = [
    AssetPaths.resolved(tenant_id, app_id, build_id, node.id)
    if node.extension == "md"
    else AssetPaths.draft(tenant_id, app_id, node.id)
    for node in nodes
]
```

After initialization, the sandbox filesystem looks like:

```
/sandbox/workdir/
└── skills/
    ├── resume-screener.md          # compiled (resolved) content
    ├── interview-questions.md      # compiled (resolved) content
    ├── email-drafter.md            # compiled (resolved) content
    ├── job-description.txt         # raw draft content
    └── scoring_algorithm.py        # raw draft content (original Python)
```

The code file exists as a real file on the sandbox filesystem — it can be `cat`'d, `python3`'d, `chmod +x`'d, etc.

---

### Runtime: The LLM-Tool Execution Loop

#### Step 1: Prompt Compilation

The LLM node compiles the prompt. The `§[file].[app].[file-scorer]§` placeholder resolves to `skills/scoring_algorithm.py`. The LLM receives:

```
You are an expert recruiter. Compare the candidate's resume against
the job description found at: skills/job-description.txt

First, run the scoring algorithm to get a baseline score:
skills/scoring_algorithm.py

Execute it with: python3 skills/scoring_algorithm.py "<resume>" "<jd>"

Then use the candidate lookup tool to fetch structured profile data:
[Candidate Lookup: candidate_lookup_tool-uuid-1]

Combine the algorithmic score with your qualitative assessment.
```

#### Step 2: LLM Node Selects the Execution Strategy

The LLM node checks if `computer_use` (sandbox mode) is enabled. When it is, it calls `_invoke_llm_with_sandbox`:

```python
# LLMNode._invoke_llm_with_sandbox — creates a bash session with tool dependencies
with SandboxBashSession(sandbox=sandbox, node_id=self.id, tools=tool_dependencies) as session:
    strategy = StrategyFactory.create_strategy(
        tools=[session.bash_tool],  # only the bash tool is available
        agent_strategy=AgentEntity.Strategy.FUNCTION_CALLING,
        ...
    )
    outputs = strategy.run(prompt_messages=..., stream=True)
```

The LLM is given exactly one tool: **`bash`**. It must use shell commands to interact with files.

#### Step 3: The Function Call Loop

The `FunctionCallStrategy` drives an iterative conversation:

```
┌──────────────────────────────────────────────────────┐
│                   ROUND 1                            │
│                                                      │
│  LLM receives: system prompt + user prompt           │
│  LLM thinks: "I need to run the scoring script"      │
│  LLM generates tool_call:                            │
│    {                                                 │
│      "name": "bash",                                 │
│      "arguments": {                                  │
│        "bash": "cat skills/job-description.txt"      │
│      }                                               │
│    }                                                 │
│                                                      │
│  System executes in sandbox VM → returns text        │
│  Messages: [..., assistant(tool_call), tool(result)] │
└──────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│                   ROUND 2                            │
│                                                      │
│  LLM sees the JD content from round 1                │
│  LLM generates tool_call:                            │
│    {                                                 │
│      "name": "bash",                                 │
│      "arguments": {                                  │
│        "bash": "python3 skills/scoring_algorithm.py  │
│                 'John has 8 years of Python...'      │
│                 'Senior Python Developer...'"        │
│      }                                               │
│    }                                                 │
│                                                      │
│  System executes → Python script runs in sandbox     │
│  Returns:                                            │
│    {                                                 │
│      "technical_fit": 7.5,                           │
│      "experience_level": 8,                          │
│      "culture_fit": 7.0,                             │
│      "overall": 7.5                                  │
│    }                                                 │
│                                                      │
│  Messages: [..., assistant(tool_call), tool(result)] │
└──────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│                   ROUND 3                            │
│                                                      │
│  LLM sees the scoring output from round 2            │
│  LLM generates final answer (no tool_call):          │
│                                                      │
│  "Based on the algorithmic scoring and my            │
│   qualitative assessment:                            │
│   - Technical Fit: 8/10 (strong Python, AWS match)   │
│   - Experience: 8/10 (8 years, senior level)         │
│   - Culture Fit: 7/10 (collaborative signals)        │
│   - Overall: 7.7/10 — RECOMMEND for interview"      │
│                                                      │
│  Loop ends: no tool_calls in response                │
└──────────────────────────────────────────────────────┘
```

#### Step 4: Inside the Bash Tool Execution

When the LLM emits a tool call with `{"bash": "python3 skills/scoring_algorithm.py ..."}`, the `SandboxBashTool` executes it inside the sandbox VM:

```python
# SandboxBashTool._invoke — runs shell command in the VM
with with_connection(self._sandbox) as conn:
    env_exports = (
        f"export PATH={self._tools_path}:/usr/local/bin:/usr/bin:/bin && "
        f"export DIFY_CLI_CONFIG={self._tools_path}/{DifyCli.CONFIG_FILENAME} && "
    )
    full_command = env_exports + command   # "python3 skills/scoring_algorithm.py ..."

    cmd_list = ["bash", "-c", full_command]
    future = submit_command(self._sandbox, conn, cmd_list)
    result = future.result(timeout=timeout)

    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")

    # Truncate to avoid overwhelming the model
    stdout = _truncate_output(stdout, "stdout")
    stderr = _truncate_output(stderr, "stderr")

    yield self.create_text_message(...)
```

The tool returns a `ToolInvokeMessage` with the stdout/stderr text.

#### Step 5: Result Flows Back to the LLM

The `FunctionCallStrategy` appends the tool result as a `ToolPromptMessage` to the conversation:

```python
# FunctionCallStrategy — append tool result, then loop
messages.append(assistant_message_with_tool_calls)

for tool_call_id, tool_name, tool_args in tool_calls:
    tool_response, tool_files, _, _ = yield from self._handle_tool_call(
        tool_name, tool_args, tool_call_id, messages, round_log
    )
    # tool_response = '{"technical_fit": 7.5, ...}' (stdout from python3)

messages.append(ToolPromptMessage(content=tool_response, tool_call_id=tool_call_id))
# Next iteration: LLM sees the full conversation including tool results
```

The LLM receives the **entire conversation history** on the next `invoke_llm` call, including all prior assistant messages, tool calls, and tool results.

---

### What About JavaScript Files?

The same mechanism applies. If the user uploads a `format_report.js` file:

1. `FileBuilder` passes it through as-is → it lands at `skills/format_report.js` in the sandbox.
2. The skill references it: `§[file].[app].[file-formatter]§` → resolves to `skills/format_report.js`.
3. The LLM sees the path in its prompt and can run: `node skills/format_report.js --input data.json`.
4. The bash tool executes it in the VM → stdout returned to LLM.

The sandbox VM has standard runtimes (`python3`, `node`, `bash`) available on `PATH`.

---

### Output Files: Sandbox → Workflow

If the script writes output files (charts, CSVs, PDFs), the `SandboxBashSession.collect_output_files()` method harvests them from the sandbox `output/` directory after the LLM conversation ends:

```python
# SandboxBashSession.collect_output_files
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
    # Returns File objects that downstream workflow nodes can reference
```

So if the LLM runs `python3 skills/scoring_algorithm.py ... > output/scores.json`, the resulting file is collected, stored as a `ToolFile`, and passed as a `File` object to subsequent workflow nodes.

---

### Complete Execution Flow Diagram

```
┌─────────────────────── PUBLISH TIME ──────────────────────┐
│                                                            │
│  AssetBuildPipeline                                        │
│    ├── SkillBuilder claims .md files                       │
│    │     → compile_all() → SkillBundle                     │
│    │     → resolved .md content (placeholders replaced)    │
│    │                                                       │
│    └── FileBuilder claims .py, .js, .txt, etc.             │
│          → passthrough (raw bytes, no transformation)      │
│                                                            │
│  All AssetItems → packaged into build.zip                  │
└────────────────────────────────────────────────────────────┘
                            │
                        RUNTIME
                            ▼
┌─────────────────────── SANDBOX INIT ──────────────────────┐
│                                                            │
│  AppAssetsInitializer / DraftAppAssetsInitializer          │
│    → download + extract into sandbox VM filesystem         │
│                                                            │
│  /sandbox/workdir/skills/                                  │
│    ├── resume-screener.md     (compiled)                   │
│    ├── scoring_algorithm.py   (raw Python)                 │
│    ├── job-description.txt    (raw text)                   │
│    └── ...                                                 │
│                                                            │
│  SkillInitializer                                          │
│    → loads SkillBundle into sandbox.attrs                   │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────── LLM NODE ──────────────────────────┐
│                                                            │
│  1. SkillCompiler.compile_one()                            │
│     § placeholders → path strings + tool deps              │
│                                                            │
│  2. _invoke_llm_with_sandbox()                             │
│     SandboxBashSession provides bash tool                  │
│     ToolAccessPolicy from skill's ToolDependencies         │
│                                                            │
│  3. FunctionCallStrategy loop:                             │
│     ┌─────────────────────────────────────────┐            │
│     │  LLM sees prompt with paths + tool list │            │
│     │              │                          │            │
│     │              ▼                          │            │
│     │  LLM emits tool_call:                   │            │
│     │    bash("python3 skills/scoring.py ...") │            │
│     │              │                          │            │
│     │              ▼                          │            │
│     │  SandboxBashTool executes in VM          │            │
│     │    → stdout/stderr captured              │            │
│     │    → truncated for model context         │            │
│     │              │                          │            │
│     │              ▼                          │            │
│     │  ToolPromptMessage appended to messages  │            │
│     │              │                          │            │
│     │              ▼                          │            │
│     │  Next invoke_llm with full history       │            │
│     │              │                          │            │
│     │  (repeat until no tool_calls)            │            │
│     └─────────────────────────────────────────┘            │
│                                                            │
│  4. Final LLM response = node output                       │
│                                                            │
│  5. collect_output_files("output/")                        │
│     → any files written to output/ become File objects     │
│     → passed to downstream workflow nodes                  │
└────────────────────────────────────────────────────────────┘
```

### Summary: Text vs Code Files in Skills

| Aspect                  | `.md` Skill                          | `.txt` Data File                             | `.py` / `.js` Code File                              |
| ----------------------- | ------------------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| Builder                 | SkillBuilder (compiled)              | FileBuilder (passthrough)                    | FileBuilder (passthrough)                            |
| In SkillBundle?         | Yes (entry with tools, deps)         | No                                           | No                                                   |
| Placeholder resolves to | Relative path (e.g. `./b.md`)        | Relative path (e.g. `./job-description.txt`) | Relative path (e.g. `skills/scoring_algorithm.py`)   |
| LLM sees content?       | Path in prompt, not inlined          | Path in prompt, not inlined                  | Path in prompt, not inlined                          |
| How LLM uses it         | References its compiled instructions | `bash("cat skills/file.txt")`                | `bash("python3 skills/file.py ...")`                 |
| Execution               | N/A (prompt text)                    | N/A (data)                                   | Sandbox VM via bash tool                             |
| Result to LLM           | N/A                                  | stdout as ToolPromptMessage                  | stdout/stderr as ToolPromptMessage                   |
| Tool dep propagation    | Yes (transitive)                     | No                                           | No (but the skill that references it may have tools) |
| Output files            | N/A                                  | N/A                                          | Collected from `output/` dir                         |

---

## Deep Dive: Images, PDFs, and Multimodal Files in Skills

The hiring manager's workflow isn't just text — they often need to feed **images** (candidate portfolios, whiteboard photos, charts) and **PDFs** (resumes, certifications, reference letters) into the LLM. This section traces how binary files reach the model.

### Two Completely Different Paths

This is the single most important distinction to understand:

| Path                     | Source                                                                                       | Mechanism                                                                             | Binary Sent to LLM?                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **A. Workflow Variable** | User uploads via a `File` input or "start" node → bound to a variable like `{{#sys.files#}}` | `FileSegment` → `file_manager.to_prompt_message_content()` → multimodal content block | **Yes** — as base64 or URL                                |
| **B. Skill Asset**       | User uploads via the skill/asset tree → referenced with `§[file].[app].[asset-id]§`          | `SkillCompiler._resolve_content()` → **path string**                                  | **No** — only the path string, bytes stay on sandbox disk |

**Skill asset placeholders never become multimodal prompt blocks.** The skill compiler is a pure text transformer: it replaces `§[file]...§` with a filesystem path string. If the asset is a PDF, the LLM sees `skills/candidate-resume.pdf` — not the PDF bytes.

To actually feed binary content to the LLM, the file must be passed through **Path A** (as a workflow variable).

---

### Extended Recruiting Example: Handling Uploaded Resumes and Portfolios

Suppose the hiring manager's workflow accepts per-candidate uploads at runtime:

-   `candidate_resume.pdf` — the candidate's CV (binary PDF)
-   `portfolio_screenshot.png` — a screenshot of their portfolio
-   `whiteboard_photo.jpg` — their whiteboard solution from a screening call

These arrive as **workflow variables**, not as skill assets. The "Start" node has a `files` input; users upload the candidate's docs when triggering the workflow. The LLM node template looks like this:

```markdown
§[file].[app].[skill-screen]§

Candidate Resume:
{{#sys.files#}}

Portfolio screenshot:
{{#start.portfolio#}}
```

Two kinds of references coexist in the same prompt:

-   `§[file].[app].[skill-screen]§` → **skill asset** (static, published with the workflow)
-   `{{#sys.files#}}`, `{{#start.portfolio#}}` → **workflow variables** (dynamic, per-run)

---

### Path A in Detail: How a Workflow File Becomes Multimodal Content

#### Step 1: The LLM Node Walks Template Segments

`LLMNode.handle_list_messages()` iterates the template's variable segments. For each `FileSegment` or `ArrayFileSegment`, it checks the file type:

```python
# LLMNode.handle_list_messages — collect multimodal content blocks
file_contents = []
for segment in segment_group.value:
    if isinstance(segment, ArrayFileSegment):
        for file in segment.value:
            if file.type in {FileType.IMAGE, FileType.VIDEO, FileType.AUDIO, FileType.DOCUMENT}:
                file_content = file_manager.to_prompt_message_content(
                    file, image_detail_config=vision_detail_config
                )
                file_contents.append(file_content)
    elif isinstance(segment, FileSegment):
        file = segment.value
        if file.type in {FileType.IMAGE, FileType.VIDEO, FileType.AUDIO, FileType.DOCUMENT}:
            file_content = file_manager.to_prompt_message_content(
                file, image_detail_config=vision_detail_config
            )
            file_contents.append(file_content)

# text message first, then a second message with only the file_contents
if file_contents:
    prompt_message = _combine_message_content_with_role(contents=file_contents, role=message.role)
    prompt_messages.append(prompt_message)
```

Only four file types qualify for multimodal content: `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`. Anything else (`CUSTOM`, archives, code) is skipped.

#### Step 2: `to_prompt_message_content` — Binary Becomes a Prompt Block

`file_manager.to_prompt_message_content()` is the conversion chokepoint:

```python
# api/core/file/file_manager.py
prompt_class_map = {
    FileType.IMAGE: ImagePromptMessageContent,
    FileType.AUDIO: AudioPromptMessageContent,
    FileType.VIDEO: VideoPromptMessageContent,
    FileType.DOCUMENT: DocumentPromptMessageContent,
}

params = {
    "base64_data": _get_encoded_string(f) if dify_config.MULTIMODAL_SEND_FORMAT == "base64" else "",
    "url":         _to_url(f)             if dify_config.MULTIMODAL_SEND_FORMAT == "url"    else "",
    "format":      f.extension.removeprefix("."),
    "mime_type":   f.mime_type,
    "filename":    f.filename or "",
    "file_ref":    _encode_file_ref(f),
}
```

Two transmission modes, controlled by the global config `MULTIMODAL_SEND_FORMAT`:

| Mode                 | What the LLM receives                                              | When used                                                          |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `"base64"` (default) | `data:image/png;base64,iVBORw0KGg...` (the whole file inlined)     | Full file content, works with providers that want inline data      |
| `"url"`              | A signed URL pointing to the file in object storage / tool storage | Larger files, providers that prefer URLs (e.g. OpenAI `image_url`) |

#### Step 3: Transfer Method Drives How Bytes Are Loaded

The `FileTransferMethod` enum determines where the bytes come from:

| Transfer Method                          | Base64 mode                           | URL mode                                                  |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `LOCAL_FILE` (user upload)               | `storage.load(storage_key)` → base64  | `get_signed_file_url(related_id)` — signed preview URL    |
| `REMOTE_URL` (external link)             | `ssrf_proxy.get(remote_url)` → base64 | Pass the `remote_url` through as-is                       |
| `TOOL_FILE` (tool output)                | `storage.load(storage_key)` → base64  | `sign_tool_file(related_id, extension)` — signed tool URL |
| `DATASOURCE_FILE` (connected datasource) | `storage.load(storage_key)` → base64  | _(not supported — URL mode would raise)_                  |

Concretely, when the hiring manager uploads `candidate_resume.pdf`:

1. Dify stores the bytes in object storage (S3, OSS, etc.) at a path like `upload_files/{tenant_id}/{uuid}.pdf`.
2. The workflow variable carries a `File` object with `transfer_method=LOCAL_FILE`, `storage_key=<path>`, `type=DOCUMENT`, `mime_type=application/pdf`.
3. In base64 mode: `storage.load(...)` reads the PDF bytes, `base64.b64encode()` produces the inlined string.
4. In URL mode: a signed URL is generated with a TTL; the LLM provider fetches the file directly.

#### Step 4: The Wire Shape

The produced `PromptMessageContent` has a `.data` property that abstracts the two modes:

```python
# MultiModalPromptMessageContent.data
@property
def data(self):
    return self.url or f"data:{self.mime_type};base64,{self.base64_data}"
```

The provider plugin (OpenAI, Anthropic, Gemini, etc.) takes this structure and serializes it into the provider's exact JSON shape. For OpenAI-compatible providers, an image becomes something like:

```json
{
    "role": "user",
    "content": [
        { "type": "text", "text": "Candidate Resume:" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0..." } }
    ]
}
```

For a PDF on Anthropic Claude:

```json
{
    "role": "user",
    "content": [
        { "type": "text", "text": "Candidate Resume:" },
        { "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "JVBERi0xL..." } }
    ]
}
```

The exact JSON keys live in each provider plugin; Dify's contract to the plugin is always the same: populate either `url` or `base64_data`, plus `mime_type` and `format`.

#### Step 5: Model Capability Gating

Before messages are actually sent, `_filter_messages` drops multimodal blocks the model cannot understand:

```python
# LLMNode._filter_messages
feature_map = {
    PromptMessageContentType.IMAGE:    ModelFeature.VISION,
    PromptMessageContentType.DOCUMENT: ModelFeature.DOCUMENT,
    PromptMessageContentType.VIDEO:    ModelFeature.VIDEO,
    PromptMessageContentType.AUDIO:    ModelFeature.AUDIO,
}
required_feature = feature_map.get(content_item.type)
if required_feature and required_feature not in model_config.model_schema.features:
    continue
```

So if the user wires a PDF into a text-only model, the `DocumentPromptMessageContent` is silently filtered out — only the surrounding text survives. The model sees a prompt without the document.

Additionally, `sys_files` / `context_files` (conversation-level attachments) are gated by the node's `vision.enabled` flag. Template-embedded `File` variables only need the model feature; they don't check `vision.enabled`.

#### Step 6: Context Restoration (for long conversations)

Multimodal payloads are heavy. When conversation history is stored, the backend can **strip** the `base64_data`/`url` and keep only the compact `file_ref`:

```python
# encoded in to_prompt_message_content
"file_ref": _encode_file_ref(f)   # "local:<id>" | "remote:<url>" | "tool:<id>"
```

On the next turn, `restore_multimodal_content_in_messages` uses `file_ref` to re-fetch the bytes (or re-sign the URL) and rebuild the prompt block. This keeps stored transcripts small while allowing faithful replays.

---

### What Happens to Image/PDF Skill Assets

Suppose the hiring manager uploads a **company brand guide** as a skill asset: `brand_guide.pdf`. The skill-editor UI adds it to the asset tree with `asset_id=file-brand`. A skill references it:

```markdown
Ensure the draft email follows our brand style: §[file].[app].[file-brand]§
```

This does **not** feed the PDF to the LLM as a multimodal block. Here's what actually happens:

1. **Build time:** `FileBuilder` passes `brand_guide.pdf` through as-is (`extension="pdf"`, not `.md`, so not compiled).
2. **Sandbox init:** `AppAssetsInitializer` extracts the PDF to `skills/brand_guide.pdf` in the VM filesystem.
3. **Compile time:** `SkillCompiler._resolve_content` replaces the placeholder with the path string `skills/brand_guide.pdf`. The prompt becomes:

    ```
    Ensure the draft email follows our brand style: skills/brand_guide.pdf
    ```

4. **LLM sees:** Just the text path. No image block, no document block, no binary data.

If the hiring manager wants the LLM to _read_ the brand guide's content, they have options:

**Option 1 — Convert to a text skill.** Extract the brand guide to Markdown and save it as `brand-guide.md`. Now it's a skill that gets compiled into the prompt text:

```markdown
# Brand Guide

Voice: Warm, professional, concise.
Colors: #1A2B3C, #FF6B35.
...
```

**Option 2 — Sandbox tool extraction.** In sandbox mode, the LLM can `bash("pdftotext skills/brand_guide.pdf -")` to extract text at runtime, then reason over the stdout.

**Option 3 — Promote to a workflow variable.** Re-upload the PDF as a `File` variable (not a skill asset) and reference it via `{{#...#}}` in the template. It then goes through `to_prompt_message_content` and becomes a real `DocumentPromptMessageContent` block — binary bytes sent to the model.

**Option 4 — Use a document extractor node.** Put a Document Extractor node before the LLM node to parse the PDF into text, then feed the text variable into the LLM prompt.

The skill feature's placeholder system is intentionally for **prompt composition** (text templates that reference other text artifacts) — not for binary content transfer.

---

### Three Kinds of Files, Three Destinies

This extended table captures the full picture for our recruiting workflow:

| File                       | Source                                 | Kind        | Path                                           | Reaches LLM as                                                |
| -------------------------- | -------------------------------------- | ----------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `resume-screener.md`       | Skill asset                            | `.md` skill | Published, compiled                            | Text (resolved content inlined via `compile_one`)             |
| `scoring_algorithm.py`     | Skill asset                            | Code        | `skills/scoring_algorithm.py` on sandbox disk  | Path string in prompt; LLM runs it via `bash` tool            |
| `job-description.txt`      | Skill asset                            | Text data   | `skills/job-description.txt` on sandbox disk   | Path string in prompt; LLM reads it via `bash` tool           |
| `brand_guide.pdf`          | Skill asset                            | PDF         | `skills/brand_guide.pdf` on sandbox disk       | Path string in prompt; binary **not** sent to LLM             |
| `candidate_resume.pdf`     | Workflow variable (`sys.files`)        | PDF         | Object storage, `transfer_method=LOCAL_FILE`   | `DocumentPromptMessageContent` as base64 or signed URL        |
| `portfolio_screenshot.png` | Workflow variable (`start.portfolio`)  | Image       | Object storage, `transfer_method=LOCAL_FILE`   | `ImagePromptMessageContent` as base64 or signed URL           |
| `whiteboard_photo.jpg`     | Workflow variable (`start.whiteboard`) | Image       | Object storage, `transfer_method=LOCAL_FILE`   | `ImagePromptMessageContent` as base64 or signed URL           |
| `chart_from_tool.png`      | Tool output (e.g., chart generator)    | Image       | Tool file storage, `transfer_method=TOOL_FILE` | `ImagePromptMessageContent` as base64 or `sign_tool_file` URL |

---

### End-to-End Flow Diagram: A Real Recruiting Run

```
┌──────────────────── USER TRIGGERS WORKFLOW ─────────────────────┐
│                                                                  │
│  HR Manager fills out the "Start" node form:                    │
│    sys.files:         [candidate_resume.pdf]                     │
│    start.portfolio:   portfolio_screenshot.png                   │
│    start.resume_text: "John has 8 years of Python..."            │
│                                                                  │
│  Files uploaded to object storage:                               │
│    upload_files/{tenant}/{uuid1}.pdf                             │
│    upload_files/{tenant}/{uuid2}.png                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────── LLM NODE: RESUME SCREENING ─────────────────┐
│                                                                  │
│  Template:                                                       │
│    §[file].[app].[skill-screen]§                                 │
│    Candidate Resume: {{#sys.files#}}                             │
│    Portfolio: {{#start.portfolio#}}                              │
│                                                                  │
│  STEP 1: Variable substitution                                   │
│    → skill placeholder stays as §[file]...§                      │
│    → {{#sys.files#}}, {{#start.portfolio#}} become               │
│      FileSegment / ArrayFileSegment objects                      │
│                                                                  │
│  STEP 2: SkillCompiler.compile_one() on text only                │
│    → §[file].[app].[skill-screen]§ → resolved skill content     │
│      (text of the compiled screener skill, path replacements)    │
│                                                                  │
│  STEP 3: Walk segments for multimodal                            │
│    sys.files → ArrayFileSegment                                  │
│      candidate_resume.pdf (DOCUMENT) → to_prompt_message_content │
│        → DocumentPromptMessageContent(                           │
│            base64_data="JVBERi0xLjQK...",                        │
│            mime_type="application/pdf",                          │
│            file_ref="local:uuid1"                                │
│          )                                                       │
│    start.portfolio → FileSegment                                 │
│      portfolio_screenshot.png (IMAGE) → to_prompt_message_content│
│        → ImagePromptMessageContent(                              │
│            base64_data="iVBORw0KGg...",                          │
│            mime_type="image/png",                                │
│            detail=LOW,                                           │
│            file_ref="local:uuid2"                                │
│          )                                                       │
│                                                                  │
│  STEP 4: _filter_messages                                        │
│    model_schema.features includes VISION + DOCUMENT?             │
│      ✓ Keep ImagePromptMessageContent                            │
│      ✓ Keep DocumentPromptMessageContent                         │
│      ✗ If missing, drop the block (text survives)                │
│                                                                  │
│  STEP 5: Provider plugin serializes                              │
│    OpenAI:    { "type": "image_url", "image_url": {...} }        │
│    Anthropic: { "type": "document",  "source": {...}  }          │
│                                                                  │
│  STEP 6: HTTPS request to LLM provider                           │
│    multipart JSON body with base64'd PDF + PNG                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    LLM reads PDF + image natively
                              │
                              ▼
                   Next workflow node (email, etc.)
```

---

### Quick Reference: Common Questions

**Q: Does the skill feature ever send binary files to the LLM?**
No. Skill asset placeholders (`§[file]...§`) always resolve to path strings. Binary ingestion requires a separate workflow variable.

**Q: Why are skill asset paths still useful then?**
Because sandbox-mode LLM nodes can execute bash commands. The LLM can `cat`, `pdftotext`, `python3`, or otherwise process the on-disk file through the bash tool. The path is all it needs to _act_ on the file, not just _see_ it.

**Q: If I want the LLM to read a PDF that's part of my skill, what do I do?**
Three options: (1) extract to Markdown in advance and make it a `.md` skill; (2) use sandbox mode and let the LLM call `pdftotext`; (3) pass the PDF as a workflow variable instead of a skill asset.

**Q: Does `MULTIMODAL_SEND_FORMAT=url` save money?**
It shifts the cost: your server no longer reads and base64-encodes bytes (cheap but blocking), but the LLM provider does fetch via HTTPS (latency, plus egress billing on your side). URL mode also requires the provider to be able to reach your signed URLs.

**Q: What about audio and video?**
Exactly the same code path. `AudioPromptMessageContent` and `VideoPromptMessageContent` go through `to_prompt_message_content` and are filtered by `ModelFeature.AUDIO` / `ModelFeature.VIDEO`. Most hiring workflows won't use these, but the plumbing is identical.

**Q: What if the file is an unsupported type (e.g. `.zip`)?**
`to_prompt_message_content` returns a `TextPromptMessageContent` with `"[Unsupported file type: archive.zip (custom)]"`. The LLM sees a text placeholder, not the bytes.

**Q: Who filters out the `base64_data` to keep stored history small?**
The context-restoration helpers (`restore_multimodal_content_in_messages`) re-hydrate multimodal blocks from `file_ref` on the way _in_ to the model, and strip them on the way _out_ to storage. The stored transcript holds a compact reference string; the live prompt gets the heavy payload only when it's about to be sent.

The design cleanly separates **composition** (text, paths, skill references — cheap, stored verbatim) from **ingestion** (binary bytes — expensive, computed just-in-time, re-hydratable on demand).
