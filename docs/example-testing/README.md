# Skill V2 — End-to-End Testing Assets

A ready-to-upload asset package for exercising every part of the
Flowise **Skill V2** pipeline: Markdown skills, text data files, and a
Node.js script, tied together by `{{skill.<nodeId>}}` and
`{{tool.<provider>.<toolName>.<uuid>}}` placeholders.

The scenario is the Recruiting workflow from
[`docs/dify_project/skill_invocation.md`](../dify_project/skill_invocation.md),
re-grammared for Flowise's native `{{…}}` placeholder system (see
[`docs/skill-v2/PLAN.md` §5](../skill-v2/PLAN.md)).

---

## What's in the box

```
docs/example-testing/
├── README.md                         ← this file
└── recruiting/
    ├── resume-screener.md            ← Skill (md) — entry point #1
    ├── interview-questions.md        ← Skill (md) — depends on the screener
    ├── email-drafter.md              ← Skill (md) — depends on the other two
    ├── job-description.txt           ← Data file (txt)
    └── scoring_algorithm.js          ← Code file (Node.js)
```

### File map

| File                     | Kind           | References                                                        | Exposes the tool name   |
| ------------------------ | -------------- | ----------------------------------------------------------------- | ----------------------- |
| `resume-screener.md`     | `kind = skill` | `job-description.txt`, `scoring_algorithm.js`, one `custom` tool  | `resume_screener`       |
| `interview-questions.md` | `kind = skill` | `resume-screener.md`, one `builtin` tool                          | `interview_questions`   |
| `email-drafter.md`       | `kind = skill` | `resume-screener.md`, `interview-questions.md`, one `custom` tool | `email_drafter`         |
| `job-description.txt`    | `kind = data`  | —                                                                 | — (path-only reference) |
| `scoring_algorithm.js`   | `kind = code`  | —                                                                 | — (path-only reference) |

Every markdown skill ships with its `Metadata` block already filled
in (see §2 below). Only the UUID strings need to be substituted
before publishing.

---

## 1. Upload into Flowise (Skill V2 workspace)

1. Start Flowise and open the **Skills** page.
2. Create a new skill named **`Recruiting`** (icon and colour to
   taste). This creates one `SkillV2` row + an empty `fileTree`.
3. Inside the Recruiting workspace editor, upload / create each file
   from `docs/example-testing/recruiting/`:
    - Upload `job-description.txt` and `scoring_algorithm.js` via the
      file-tree **Upload** action (they are stored verbatim as
      `skill` storage nodes of kind `data` / `code`).
    - Create the three `.md` files via **New File** → paste the
      contents from this folder.
4. After creation, every file has a freshly generated UUID visible in
   the URL of the editor (`…/skills-v2/<skillId>?node=<nodeId>`) and
   in the right-hand side panel.

---

## 2. Wire up the placeholders

Each markdown skill ships with placeholder **tokens** that need to be
rewritten to real UUIDs before you publish:

| Token (as written)                      | Replace with                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `<<NODE_ID_OF_job-description.txt>>`    | UUID of the `job-description.txt` tree node                                                         |
| `<<NODE_ID_OF_scoring_algorithm.js>>`   | UUID of the `scoring_algorithm.js` tree node                                                        |
| `<<NODE_ID_OF_resume-screener.md>>`     | UUID of the `resume-screener.md` tree node                                                          |
| `<<NODE_ID_OF_interview-questions.md>>` | UUID of the `interview-questions.md` tree node                                                      |
| `<<UUID_FOR_candidate_lookup>>`         | Any UUID you choose, as long as it matches between the placeholder **and** the `metadata.tools` key |
| `<<UUID_FOR_python_runner>>`            | Same (keep placeholder ↔ metadata key aligned)                                                      |
| `<<UUID_FOR_send_email>>`               | Same                                                                                                |

**Two ways to do the substitution**:

-   **Easy path** — use the **file/tool ref picker** built into the
    Skill V2 editor. Select a `<<…>>` token and click the picker; it
    inserts the canonical `{{skill.<uuid>}}` / `{{tool.…}}` string with
    the right UUID.
-   **Manual path** — Find-and-Replace inside the editor or in your
    checkout before uploading.

The UUIDs for the three tool placeholders are **author-chosen** and
only need to be stable within the same skill (the compiler matches
the token's UUID against the `metadata.tools` key). Use `crypto.randomUUID()`
or anything else (e.g. `tool-candidate-lookup`, `tool-python-runner`,
`tool-send-email`).

---

## 3. Publish and inspect the bundle

1. Click **Publish** in the skill editor. This runs
   `SkillV2Compiler.compileAll` server-side. If every placeholder
   resolved, the publish succeeds and you get a `bundleId` plus a
   `published.json` pointer in object storage (see
   [`docs/skill-v2/PLAN.md` §4](../skill-v2/PLAN.md)).
2. Use the **Graph** panel to verify the dependency graph looks like:
    ```
    email-drafter.md ─┬─▶ resume-screener.md ─┬─▶ job-description.txt
                      │                        └─▶ scoring_algorithm.js
                      └─▶ interview-questions.md ─▶ resume-screener.md (transitive)
    ```
3. Open the compiled artefact for `resume-screener.md`. The paths
   should now be resolved:
    - `{{skill.…job-description.txt}}` → `./job-description.txt`
    - `{{skill.…scoring_algorithm.js}}` → `./scoring_algorithm.js`
    - `{{tool.hr_platform.candidate_lookup.<uuid>}}` → `[Candidate Lookup: candidate_lookup_<uuid>]`
4. Open the compiled artefact for `email-drafter.md`. The transitive
   propagation pass should have merged the tool deps of both other
   skills into its `tools.dependencies` list. The graph panel should
   show that `email-drafter` transitively depends on
   `candidate_lookup` and `python` even though it only declares
   `send_email` itself.

---

## 4. Expose the skill to a chatflow

1. Create or open a **Chatflow / AgentFlow**.
2. Drop the **Skill** tool node (label: `Skill`, category `Tools`).
3. Set:
    - **Skill** → `Recruiting`
    - **Skill Files** → pick any subset of the three markdowns. Start
      with just `resume-screener.md` for a narrow blast radius.
4. Wire the tool into your agent (e.g. OpenAI Tool Agent,
   ConversationalAgent, AgentFlow v2).
5. Give the agent a model that actually supports function calling
   (GPT-4o, Claude 3.5, etc.).

Each selected markdown becomes one LangChain tool named after its
file (see `formatToolName` in
`packages/components/nodes/tools/Skill/utils.ts`). In addition, when
the server has `E2B_APIKEY` configured, the Skill node registers
**one** companion execution tool:

-   `bash_<SkillName>` — a full sandbox shell. The LLM sends
    `{command: "…"}` and can run `python3`, `node`, `cat`,
    `pdftotext`, `curl`, `ls`, … against every reachable skill file
    under `/home/user/skills/`.

When no sandbox is available (no `E2B_APIKEY`, or the
`Enable Sandbox Shell` toggle is off, or `SKILL_V2_ALLOW_EXEC=false`),
the node runs in **fallback / read-only mode**: only the per-file
skill tools are registered; the LLM sees the compiled markdown and
acts on it without any execution surface.

| File                     | Exposed tool name                                  |
| ------------------------ | -------------------------------------------------- |
| `resume-screener.md`     | `resume_screener`                                  |
| `interview-questions.md` | `interview_questions`                              |
| `email-drafter.md`       | `email_drafter`                                    |
| `scoring_algorithm.js`   | (reachable via `bash_<SkillName>` when configured) |

`<SkillName>` is taken from the `SkillV2.name` column — for the
`Recruiting` skill used in this test, the tool is `bash_Recruiting`.

---

## 5. Test prompts

Try these in the chatflow chat pane. See
[`test-prompts.md`](./test-prompts.md) for the full list plus the
expected LLM behaviour for each case.

Quick-start prompts (paste the whole block each time):

> Screen this resume for the Senior Python Developer role.
>
> ```
> Jane Doe — 8 years Python, 4 years AWS EKS, built real-time Kafka
> pipelines at scale. Led a team of 3. Strong with pytest, mypy,
> Terraform. Minimal Snowflake exposure but deep BigQuery experience.
> Active open-source contributor to Airflow.
> ```

> Now generate interview questions for that candidate.

> Draft the panel email but don't send it yet.

---

## 6. What the LLM actually sees (the point of the test)

`{{skill.<nodeId>}}` placeholders always resolve to **path strings**,
never to file content. The LLM therefore sees:

```
> Original data file reference (for audit trail):
> ./job-description.txt

Script path (pass this verbatim to the exec tool):
./scoring_algorithm.js
```

To actually get the JD content into the LLM's context, the skill
markdown inlines it verbatim inside a fenced code block. To actually
execute `.js` code (or `.py`, `.sh`, …), the Skill node auto-registers
a `bash_<SkillName>` companion tool when an E2B sandbox is configured.
See [`docs/skill-v2/SANDBOX_INTEGRATION.md`](../skill-v2/SANDBOX_INTEGRATION.md)
for the full sandbox architecture.

### Command helpers (authors don't have to spell out shell invocations)

Skill authors typically point at files in plain English — _"Job
description at `./job-description.txt`"_, _"Execute the scripts at
`./scoring-algorithm.js`"_ — and should not have to teach the LLM
which file wants `node`, which wants `python3`, and which wants
`cat`. The runtime does that for them.

Two helpers kick in automatically when a sandbox capability is
active:

-   The **bash tool's description** includes a _Suggested invocations_
    cheat-sheet grouped by file type: Node, Python, shell, Ruby, text,
    binary. Each line shows the file's absolute VM path and a concrete
    starting command (`node /home/user/skills/scoring_algorithm.js [args...]`,
    `cat /home/user/skills/job-description.txt`, etc.).
-   Every per-skill tool response gets an **Execution helpers** block
    appended to its markdown. For each `{{skill.…}}` reference the
    skill declares, the block emits one line like:

    ```
    - ./scoring_algorithm.js — execute with node.js: call `bash_Recruiting` with {"command": "node /home/user/skills/scoring_algorithm.js [args...]"}
    - ./job-description.txt — read as text: call `bash_Recruiting` with {"command": "cat /home/user/skills/job-description.txt"}
    ```

Extension mapping is defined in
`packages/components/nodes/tools/Skill/sandbox/commandRecipes.ts`.
Add a new entry there to teach the runtime about a new language.

### Capability detection at a glance

| Env                                          | Companion tool registered | Engine reported | Notes                                                      |
| -------------------------------------------- | ------------------------- | --------------- | ---------------------------------------------------------- |
| `E2B_APIKEY` set (default flags)             | `bash_<SkillName>`        | `e2b-bash`      | Full shell; files materialised under `/home/user/skills/`. |
| `E2B_APIKEY` set, `SKILL_V2_BASH_EXEC=false` | (none)                    | —               | Explicit opt-out at the env level.                         |
| `E2B_APIKEY` unset                           | (none)                    | —               | No sandbox available; read-only fallback.                  |
| `SKILL_V2_ALLOW_EXEC=false`                  | (none)                    | —               | Kill-switch; overrides everything else.                    |
| `Enable Sandbox Shell` toggle off            | (none)                    | —               | Author-level opt-out; takes effect immediately.            |

Tunables (all optional):

| Env                                   | Default    | Purpose                                          |
| ------------------------------------- | ---------- | ------------------------------------------------ |
| `SKILL_V2_EXEC_TIMEOUT_MS`            | `15000`    | Per-call `bash` timeout ceiling (ms).            |
| `SKILL_V2_MAX_OUTPUT_BYTES`           | `65536`    | Max captured stdout + stderr each (bytes).       |
| `SKILL_V2_SANDBOX_MAX_BYTES_PER_FILE` | `2097152`  | Cap for any single uploaded skill asset (bytes). |
| `SKILL_V2_SANDBOX_MAX_TOTAL_BYTES`    | `20971520` | Cap for the whole session upload (bytes).        |
| `SKILL_V2_SANDBOX_IDLE_MS`            | `300000`   | Idle shutdown window (ms).                       |
| `SKILL_V2_SANDBOX_LIFETIME_MS`        | `900000`   | Server-side VM lifetime (ms).                    |

### Two realistic test outcomes

1. **Sandbox shell on (E2B configured).** The LLM calls
   `resume_screener`, reads that the scoring script is at
   `/home/user/skills/scoring_algorithm.js`, and calls `bash_*` with
   `{command: "node /home/user/skills/scoring_algorithm.js '...' '...'"}`.
   The envelope's `engine` is `e2b-bash` and `stdout` contains the
   JSON scores. Parses back into the Scores table.
2. **Fallback / read-only mode** (no E2B, or
   `SKILL_V2_ALLOW_EXEC=false`, or the `Enable Sandbox Shell` toggle
   is off). Only the markdown tool is registered; the LLM scores the
   candidate manually from the JD + resume text and flags
   "execution unavailable" in the debug trace.

Both outcomes are exercised by the prompts in
[`test-prompts.md`](./test-prompts.md).

---

## 7. Regeneration / clean-up

-   To rebuild the bundle after editing any file, click **Publish**
    again. The bundleId is a hash of `(fileTree + per-node digests)`,
    so unchanged skills are a no-op at the storage layer.
-   To delete the whole test, delete the `Recruiting` skill from the
    Skills page. Its entire storage prefix
    (`skills-v2/<workspaceId>/<skillId>/**`) and any cached bundles
    are removed.

---

## References

-   `docs/dify_project/skill_invocation.md` — the conceptual walkthrough
    this test is modelled on.
-   `docs/skill-v2/PLAN.md` — Flowise-side architecture, placeholder
    grammar, and compiler contract.
-   `packages/server/src/services/skills-v2/compiler/` — implementation
    of the placeholder parser and resolvers.
-   `packages/components/nodes/tools/Skill/` — the LangChain tool
    wrapper that surfaces a published bundle to chatflow agents.
