Alright — let’s lay this out cleanly and thoroughly, like a proper product spec you can hand to design or implement directly.

I’ll structure this as a **complete wireframe system**, not just screens — including:

-   Layout
-   Components
-   States
-   Micro-interactions
-   Validation

---

# 🧭 Folder Creation Wizard — Full Wireframe

We’ll use a **3-step wizard**:

```
Step 1: Choose Goal
Step 2: Folder Setup
Step 3: Review & Create
```

With:

-   Left = content
-   Right = contextual help (very important for non-technical users)

---

# 🟦 GLOBAL LAYOUT

```plaintext
+------------------------------------------------------+
|  Create New Folder                                   |
|------------------------------------------------------|
| Step 1 of 3                                          |
|                                                      |
| [ Main Content Area        ]  [ Help / Preview Panel ]|
|                                                      |
|------------------------------------------------------|
| [ Back ]                         [ Continue ]         |
+------------------------------------------------------+
```

---

# 🟦 STEP 1 — CHOOSE GOAL (MOST IMPORTANT SCREEN)

## 🎯 Purpose

Reduce confusion → guide decision

---

## Wireframe

```plaintext
+------------------------------------------------------+
| What do you want to build?                           |
|------------------------------------------------------|

(•) Write content only
    Create skills using markdown and preview results

( ) Add media with AI
    Upload files and generate captions automatically

( ) Build full AI workflow
    Use embeddings, nodes, and advanced automation

-------------------------------------------------------

💡 You can upgrade later anytime
```

---

## 🧠 Right Panel (Dynamic)

### When "Write content only" is selected:

```plaintext
Simple Mode

✔ Focus on writing
✔ No setup required
✔ Fastest way to start

Best for:
- Prompt writing
- Documentation
```

---

### When "Add media with AI":

```plaintext
Advanced Mode

✔ Upload images/files
✔ Auto-generate captions
✔ Better context for AI

Requires:
- AI model connection (later)
```

---

### When "Full AI workflow":

```plaintext
Dedicated Mode

✔ Smart retrieval
✔ Node-based execution
✔ Embedding support

Best for:
- Complex AI systems
- Automation pipelines
```

---

## 🔧 Interaction Rules

-   Default selection: **Simple**
-   Clicking card = selects radio
-   Double click = Continue

---

# 🟦 STEP 2 — FOLDER SETUP

## 🎯 Purpose

Collect only essential info

---

## Wireframe

```plaintext
+------------------------------------------------------+
| Set up your folder                                   |
|------------------------------------------------------|

Folder Name *
[ Content Creator                    ]

Description
[ Optional description...           ]

Color
(•) Blue   ( ) Green   ( ) Purple   ( ) Custom

Icon
[ 📁 ]  (Change)

------------------------------------------------------

⚠ Folder name is required
```

---

## 🧠 Right Panel (Live Preview)

```plaintext
Preview

📁 Content Creator

This is how your folder will appear
```

---

## 🔧 Validation

| Field       | Rule              |
| ----------- | ----------------- |
| Name        | Required          |
| Name length | < 50 chars        |
| Duplicate   | Prevent same name |

---

## 💡 UX Detail (Important)

Auto-suggest name if empty:

-   “My First Skill”
-   “Content Assistant”

---

# 🟦 STEP 3 — REVIEW & CREATE

## 🎯 Purpose

Reassure + prevent mistakes

---

## Wireframe

```plaintext
+------------------------------------------------------+
| Review your setup                                    |
|------------------------------------------------------|

Folder Name:
Content Creator

Mode:
Advanced (Content + Media)

Features:
✔ Markdown editor
✔ Preview
✔ Asset upload
✔ AI captioning

------------------------------------------------------

💡 You can change this later in settings

[ Create Folder ]
```

---

## 🧠 Right Panel (What happens next)

```plaintext
Next Steps

1. Create your first skill
2. Add content in markdown
3. Upload assets (optional)

We’ll guide you along the way
```

---

# 🧩 POST-CREATION STATES (CRITICAL)

This is where most UX breaks — we won’t.

---

## 🟩 After Creation → Redirect

### Simple Mode

```plaintext
Empty State

Start writing your first skill

[ Create Skill ]
```

---

### Advanced Mode

```plaintext
You can:
✔ Write content
✔ Upload assets

[ Create Skill ]
[ Upload Asset ]
```

---

### Dedicated Mode

```plaintext
You can:
✔ Write content
✔ Use AI pipeline

[ Create Skill ]
```

---

# 🔁 EDGE STATES

---

## 🔴 If user tries Advanced without AI later

```plaintext
AI Not Connected

To use captions, connect an AI model.

[ Connect Now ]
[ Skip ]
```

---

## 🔴 If user selects Dedicated but skips setup

Allow creation, but:

```plaintext
AI features are not configured yet.

Some features will be limited.
```

---

# 🎯 DESIGN PRINCIPLES EMBEDDED

This wireframe strictly follows:

---

## 1. Progressive Disclosure

-   Step 1: Intent
-   Step 2: Basic info
-   Step 3: Confirmation
-   Setup only when needed

---

## 2. Zero Technical Jargon

Avoid:

-   “embedding”
-   “execution config”

Use:

-   “AI workflow”
-   “smart retrieval”

---

## 3. Alignment with Backend (Important)

Your system:

-   executionMode
-   node extraction
-   compile pipeline

UI maps cleanly to that without exposing it.

---

## 4. Reversible Decisions

-   User can upgrade later
-   No lock-in

---

# 🧠 One Strong Suggestion (From Experience)

Add a subtle toggle:

```plaintext
[ Advanced Settings ▾ ]
```

Inside:

```plaintext
Execution Mode:
summary / multimodal

(only for power users)
```

👉 Keeps system flexible without polluting main flow

---

# 🚀 Final Thought

What you’ve built on backend is already **like a compiler system**.

This wizard ensures the user experience feels like:

> “I’m just creating content”

while your system quietly runs:

> Load → Normalize → Extract → Compile → Cache

---

## If you want next step:

I can help you design:

### 👉 Skill Creation Screen (next after this wizard)

-   Editor UX
-   Asset flow
-   Node visualization (safe version)

That’s the next critical piece.
