# Skill — Example Workspaces

A collection of ready-to-upload **Skill** workspaces you can drop into
Flowise to try out the different things a Skill can do — review a
contract, summarise a deck, run a sales pipeline review, write a
performance/comp packet, or screen a candidate.

You don't need to write any code or shell commands. Each workspace is
just a folder of files you upload; the Skill runtime takes care of
reading PDFs, spreadsheets, slides, and scripts on its own.

---

## What's in the box

```
docs/example-testing/
├── README.md                         ← this file (start here)
├── test-prompts.md                   ← starter prompts for each scenario
├── recruiting/                       ← Resume screening + interview plan + email
├── human-resources/                  ← Performance + compensation + HR memo
├── contract-review/                  ← Vendor SOW (DOCX) summariser
├── sales-pipeline/                   ← Multi-sheet pipeline review (XLSX)
├── qbr-summary/                      ← Quarterly business review deck (PPTX)
└── press-release/                    ← Earnings press release (HTML) → analyst brief
```

### Pick a scenario

| You want to try…                                                   | Use this folder    |
| ------------------------------------------------------------------ | ------------------ |
| A simple, single-skill summariser of a Word doc                    | `contract-review/` |
| Multi-sheet Excel analysis with KPIs + triage                      | `sales-pipeline/`  |
| PowerPoint deck → one-page exec summary                            | `qbr-summary/`     |
| HTML page (earnings release) → structured analyst brief            | `press-release/`   |
| A small, three-step skill chain for HR (perf → comp → memo)        | `human-resources/` |
| A small, three-step skill chain for Recruiting                     | `recruiting/`      |

The four single-file scenarios (`contract-review/`, `sales-pipeline/`,
`qbr-summary/`, `press-release/`) are the quickest to set up — each
is one Skill markdown plus one document. Use them when you just want
to feel out how Skills work.

`recruiting/` and `human-resources/` are bigger: each one has three
linked Skills that feed into each other. They're the right pick when
you want to see Skills compose into a small workflow.

Every scenario folder has its own `README.md` walking you through
that scenario in detail. The upload + wiring + publish steps are the
same across all of them and are documented once below (§1–§4).

---

## 1. Upload the workspace into Flowise

1. Open Flowise and go to the **Skills** page.
2. Click **New Skill** and give it a name. The name you pick shows up
   later inside chatflows. (For the recruiting folder a good choice
   is `Recruiting`; for HR, `Human Resources`; etc.)
3. In the Skill editor, upload every file from the scenario folder
   into the file tree:
    - Use the **Upload** button for documents (`.pdf`, `.docx`,
      `.xlsx`, `.pptx`, `.csv`, `.txt`) and any helper scripts.
    - Use **New File → paste contents** for the Skill markdown files
      (the `.md` files), or upload them directly.
4. Once uploaded, every file shows up in the file tree on the left.

> You don't need to know the file paths or commands. The runtime
> wires that up automatically when you publish.

---

## 2. Connect the placeholders (the drag-and-drop step)

Open each Skill markdown (`.md`) file in the editor. Inside, you'll
see placeholders that look like this:

```
{{skill.<<NODE_ID_OF_vendor-sow.docx>>}}
```

These are stand-ins that say *"point this reference at the file
called `vendor-sow.docx`."* You don't type a UUID by hand:

- **Click on the placeholder**, then use the editor's **file
  picker**. It lists every file you've uploaded — pick the matching
  one, and the placeholder is rewritten to its canonical reference.
- For tool placeholders that look like
  `<<UUID_FOR_send_email>>`, just leave the default — it's a stable
  identifier the editor recognises.

That's the entire wiring step: open each `.md`, replace the visible
placeholders with your uploaded files via the picker, save.

---

## 3. Publish the Skill

Click **Publish** in the Skill editor. Flowise checks every
placeholder you connected, packages the workspace, and produces a
ready-to-use bundle.

If you forgot to connect a placeholder, publish fails and tells you
which one. Fix it in the editor and try again.

---

## 4. Use the Skill from a chatflow

1. Create or open a **Chatflow** or **AgentFlow**.
2. Drag the **Skill** tool node onto the canvas (it lives under
   *Tools*).
3. In the node's settings:
    - **Skill** — pick the workspace you just published.
    - **Skill Files** — tick the markdown files you want this
      chatflow to be able to use. Start with one for a narrow trial,
      enable more as you go.
4. Wire the Skill node into your agent (any agent that supports
   tools — e.g. OpenAI Tool Agent, AgentFlow v2).
5. Pick a model that supports function calling (GPT-4o, Claude,
   etc.).

That's it — chat with the agent and the Skill is available as a
tool.

---

## 5. Try a prompt

Each scenario folder ships with a quick-start prompt in its README.
The shortest way to get going is to copy the happy-path prompt from
the scenario you uploaded and paste it into the chat. The agent
will figure out which file to read and produce the structured
output the Skill describes.

For example, after publishing `contract-review`, paste:

> Review the vendor SOW. Produce the full structured summary.

The agent will read the DOCX you uploaded and respond with a
contract summary that includes scope, deliverables, payment
milestones, key assumptions, termination, and a recommendation.

`test-prompts.md` collects the canonical prompts for the recruiting
scenario; the per-scenario READMEs cover the rest.

---

## 6. Reading documents — what the runtime handles for you

You don't need to teach the agent how to open a PDF, parse a
spreadsheet, or extract slide text. Whenever a Skill references one
of these formats, the runtime gives the agent a built-in way to read
it:

| File you uploaded     | What the agent can do with it                                 |
| --------------------- | ------------------------------------------------------------- |
| `.pdf`                | Extract the text and quote it.                                |
| `.docx`               | Extract paragraph-by-paragraph text.                          |
| `.xlsx`               | Pull rows from any/all sheets as a table.                     |
| `.pptx`               | Extract text per slide, slide-by-slide.                       |
| `.html` / `.htm`      | Strip tags + `<script>`/`<style>`, decode entities, get text. |
| `.csv` / `.txt`       | Read the contents directly.                                   |
| `.py` / `.js` / `.sh` | Run the script and use its output.                            |

When a Skill markdown points at a `.pdf`, the agent will know to
extract its text before answering. If the document doesn't have
extractable text (e.g. a scan, an image-only slide), the Skill is
written to refuse rather than make things up — you'll see a clear
"can't read this file" message and can re-upload a better source.

---

## 7. Cleaning up

To delete a workspace, open it on the Skills page and remove it.
That cleans up its files and any published bundles automatically.

To re-publish after editing, just hit **Publish** again. Unchanged
files are kept; only what you edited is rebuilt.
