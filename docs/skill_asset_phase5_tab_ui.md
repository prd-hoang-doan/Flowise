Good — now we’re getting into the part that really determines whether this feature feels _powerful_ or _overwhelming_.

Given your backend is already quite sophisticated (node extraction, compile cache, retrieval pipeline ), the UI must **hide that complexity but still align with it structurally**. That’s the key.

I’ll design this in a way that:

-   Maps cleanly to your runtime pipeline (Load → Normalize → Compile → Inject )
-   Keeps non-technical users comfortable
-   Still exposes power when needed

---

# 🧭 Full UI Flow (Folder Creation → First Skill → Editing)

We’ll break it into **3 layers**:

1. **Entry Wizard (Folder Creation)**
2. **First-Time Setup Flow (Conditional)**
3. **Main Workspace (Tabs + States)**

---

# 1. Entry Wizard (Folder Creation)

### 🎯 Goal: Zero confusion in <10 seconds

---

## 🟦 Screen 1 — Choose Your Goal

```plaintext
Create New Skill Folder

What do you want to do?

(•) Write content only
    Create and preview skills using markdown

( ) Add media with AI
    Upload images/files and generate captions

( ) Build full AI workflow
    Use embeddings, nodes, and automation
```

### 🔑 System Mapping

| UI Choice        | Internal Config                               |
| ---------------- | --------------------------------------------- |
| Write content    | executionMode = summary                       |
| Add media        | executionMode = summary + asset pipeline      |
| Full AI workflow | executionMode = multimodal + node + embedding |

👉 This aligns perfectly with your runtime pipeline.

---

## 🟦 Screen 2 — Folder Basics

```plaintext
Folder Name: [ Content Creator ]
Description: [ Optional ]

Color: ● Blue
Icon: 📁
```

👉 Keep this simple. No AI config yet.

---

## 🟦 Screen 3 — Confirmation (Important)

Dynamic summary:

### Example (Simple mode)

```plaintext
You're creating a simple content folder.

✔ Write markdown skills
✔ Preview output

You can upgrade later anytime.
```

### Example (Full mode)

```plaintext
You're creating a full AI-powered folder.

✔ Assets + captions
✔ Node extraction & retrieval
✔ Embedding-based execution

You can change settings later.
```

👉 This reduces fear before clicking **Create**.

---

# 2. First-Time Setup Flow (Conditional)

This is where most systems fail. You should **NOT block creation**.

---

## 🟨 Only trigger setup when needed

### Case A — Simple Mode

👉 Skip everything → go to editor

---

### Case B — Advanced Mode (Assets)

Trigger when:

> User clicks **“Upload Asset”**

---

### 🟧 Modal: Connect AI for Captions

```plaintext
To generate captions for your assets,
connect an AI model.

(•) Use default model (Recommended)
( ) Custom configuration

[ Continue ]
```

👉 Maps to:

-   `SkillFolder.captionModelConfig`

---

### Case C — Dedicated Mode (Full AI)

Trigger when:

> User opens “Nodes” OR “Run Skill”

---

### 🟥 Modal: Enable AI Pipeline

```plaintext
To use full AI features, set up:

✔ LLM (for reasoning)
✔ Embedding model (for retrieval)

LLM:
(•) Default
( ) Custom

Embedding:
(•) Default
( ) Custom

[ Continue ]
```

👉 Maps to:

-   Node retrieval + embedding (Phase 4)
-   Compile pipeline (critical)

---

# 3. Main Workspace (Core UX)

Now the most important part: **Tabs + Progressive States**

---

## 🧩 Tab Visibility by Mode

| Tab     | Simple | Advanced | Dedicated |
| ------- | ------ | -------- | --------- |
| Source  | ✅     | ✅       | ✅        |
| Preview | ✅     | ✅       | ✅        |
| Asset   | ❌     | ✅       | ✅        |
| Summary | ❌     | ✅       | ✅        |
| Nodes   | ❌     | ❌       | ✅        |

---

## 🟩 Empty State (Critical UX)

### First time opening folder:

```plaintext
No skills yet.

[ Create your first skill ]
```

---

### First time opening a skill (Simple mode)

```plaintext
Start writing your skill in markdown.

Example:

# Role
You are a content strategist...

# Instructions
- Keep tone concise
- Adapt to platform
```

👉 This aligns with your **node extraction pipeline** later.

---

## 🟦 Source Tab

Main editor (Tiptap or Markdown)

### Key UX Enhancements:

-   Inline hints:

    -   “Use headings like Role, Instructions, Knowledge”

-   Auto-format bullets

👉 This directly improves:

-   Node extraction accuracy (Stage 2–5)

---

## 🟦 Preview Tab

Render compiled output

```plaintext
[ROLE]
You are a content strategist...

[INSTRUCTIONS]
- Keep tone concise
```

👉 This reflects:

-   Final compile renderer order

---

## 🟨 Asset Tab (Advanced+)

### Empty State

```plaintext
No assets yet.

[ Upload Image / File ]
```

---

### After upload

```plaintext
campaign.jpg
Caption: "A content board showing launch milestones"
```

👉 Maps to:

-   `SkillAsset.caption`
-   Asset compile stage

---

## 🟨 Summary Tab

This is your **bridge UI** (very smart feature)

```plaintext
Generated Summary:

- Focus on LinkedIn content strategy
- Emphasize concise tone
```

👉 This reflects:

-   Node aggregation (knowledge + behavior)

---

## 🟥 Nodes Tab (Dedicated Only)

⚠️ This is powerful but dangerous if exposed incorrectly.

---

### Instead of raw nodes → show structured view:

```plaintext
Role
- Content strategist for multi-platform campaigns

Rules
- Never exceed 280 characters

Instructions
- Adapt tone per platform

Knowledge
- LinkedIn prefers concise tone
```

👉 This maps exactly to:

-   `SkillNode.type` + priority system

---

### Advanced toggle:

```plaintext
[ Show graph view ]
```

Only for power users.

---

# 🔁 Mode Upgrade Flow (Important)

User clicks:

```plaintext
Upgrade to Advanced
```

---

### Modal:

```plaintext
Enable asset + AI features?

✔ Asset upload
✔ Caption generation

[ Upgrade ]
```

---

System changes:

-   Enable tabs
-   No data loss
-   Reuse existing content

---

# ⚙️ Internal State Mapping (Very Important)

You should store:

```ts
type FolderMode = 'simple' | 'advanced' | 'dedicated'
```

And derive everything from this:

```ts
const features = {
    simple: {
        assets: false,
        nodes: false,
        embedding: false
    },
    advanced: {
        assets: true,
        nodes: false,
        embedding: false
    },
    dedicated: {
        assets: true,
        nodes: true,
        embedding: true
    }
}
```

---

# 💡 One subtle but powerful improvement

## 👉 Add “System Status Indicator”

Top right:

```plaintext
AI: Not Connected ⚠️
```

or

```plaintext
AI: Ready ✅
```

---

This avoids:

-   Silent failures
-   Confusion when features don’t work

---

# 🎯 Final Thoughts

Your backend is already **architected like a serious system**:

-   Deterministic compile
-   Node graph
-   Retrieval + cache

The UI must feel:

> “Simple like Notion, powerful like a compiler”

---

## If you want next step:

We can go deeper into:

### 1. **Component-level design (React)**

-   State machine per tab
-   Context structure

### 2. **Data flow**

-   How UI events trigger:

    -   extraction
    -   compile
    -   cache invalidation

### 3. **Anti-patterns to avoid**

-   (you’re very close to a few dangerous ones)

That’s where this becomes a really strong product.
