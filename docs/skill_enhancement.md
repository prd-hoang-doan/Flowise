# Flowise Skills Enhancement Proposal

## Structured Asset Support for Markdown-Based Skills

## 1. Background

The current Skills implementation in Flowise allows users to define reusable skills through markdown files.

Each skill currently contains:

-   name
-   description
-   usage instructions
-   input/output examples

These markdown files are attached to the Skill Tool and can be invoked by Agentflow through tool calling.

This provides a lightweight and flexible mechanism for reusable domain-specific capability injection.

However, current markdown-only skills are limited when users need richer contextual references such as:

-   marketing examples
-   product screenshots
-   visual brand references
-   campaign layout examples
-   design samples

---

## 2. Problem Statement

Markdown currently supports only text content.

Although users may reference images inside markdown:

```markdown
![banner](hero-banner.png)
```

the LLM interprets this only as plain text and does not understand image content automatically.

This causes two limitations:

-   image references do not provide semantic value unless separately processed
-   users may assume image embedding automatically improves model understanding, which is not true

---

## 3. Proposed Enhancement

Introduce **Skill Asset Support** for markdown-based skills.

Users may upload files into the Skill folder and reference them inside markdown using a structured asset section.

Recommended syntax:

```markdown
---
assets:
    - hero-banner.png
    - luxury-product-example.jpg
---
```

---

## 4. Runtime Processing Design

At runtime, skill execution will follow a structured compilation pipeline.

### Step 1 — Parse markdown skill

Extract:

-   skill name
-   description
-   usage rules
-   asset references

### Step 2 — Resolve files

For each referenced file:

-   locate file in skill folder
-   validate existence
-   detect mime type

### Step 3 — Convert assets into textual context

For image files:

-   image caption generation
    or
-   OCR extraction

Example generated context:

```text
Minimal luxury advertisement layout with white background and premium gold typography.
```

### Step 4 — Compile final skill prompt

Inject structured text into tool prompt:

```text
Tool Name: marketing_copy_generator

Description:
Generate marketing copy for products, services, or campaigns.

Visual Context:
Minimal luxury advertisement layout with white background and premium gold typography.
```

---

## 5. Architectural Principle

Markdown remains **authoring format only**.

Files are treated as **runtime enrichments**, not direct prompt content.

This separation ensures:

-   predictable tool routing
-   scalable file handling
-   future multimodal support

---

## 6. Why This Design Is Preferred

Compared with raw markdown image embedding:

```markdown
![banner](hero-banner.png)
```

structured asset resolution provides:

-   deterministic parsing
-   easier validation
-   version control compatibility
-   future support for PDFs, HTML, spreadsheets

---

## 7. Recommended Internal Skill Compilation Model

Skill should be compiled internally before sending to LLM:

```json
{
    "name": "marketing_copy_generator",
    "description": "Generate marketing copy for campaigns.",
    "routingRules": ["advertisements", "campaign copy"],
    "avoidRules": ["theory", "branding explanation"],
    "assetContext": ["Minimal luxury advertisement layout with white background and premium gold typography."]
}
```

---

## 8. Functional Scope (Phase 1)

### Supported file type

-   images only

### Processing

-   caption generation
-   OCR optional

### Injection

-   textual summary appended during skill execution

---

## 9. Future Scope

Planned future support:

### PDF

Extract text summary

### HTML

Extract DOM summary

### Spreadsheet

Extract schema summary

Unified principle:

```text
file → textual context → skill prompt
```

---

## 10. Product Benefits

This enhancement allows users to build richer reusable skills for:

-   marketing
-   branding
-   product writing
-   design guidance
-   documentation tasks

without changing current Skill authoring experience.

---

## 11. Recommendation

Approve implementation as **Phase 1 Skill Asset Support** with image-to-text enrichment only.

This delivers immediate user value while preserving current markdown simplicity.
