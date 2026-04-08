# Summary

the exact compile algorithm used inside Flowise runtime:

folder → files → assets → execution mode → final agent prompt merge

# Discussion

Great — this is exactly the part that determines whether Skill becomes a true runtime primitive or just another prompt template inside Flowise 🚀

The key idea:

Compile should be deterministic, token-aware, and composable

That means:

same input → same compiled output
predictable order
easy to merge with Agentflow runtime
easy to trim when token budget is tight

# 1. Skill Runtime Pipeline (Recommended Architecture)

Use a 4-stage pipeline:

Load → Normalize → Compile → Inject
Stage A — Load

At runtime, collect all skill resources:

```md
Skill Folder
├── skill.md
├── assets/
│ ├── image1.jpg
│ ├── image2.png
│
├── metadata.json
```

Runtime object:

```ts
type SkillRuntimeInput = {
    skillId: string
    name: string
    description: string
    instructions?: string
    files: SkillFile[]
    assets: SkillAsset[]
    executionMode: 'summary' | 'multimodal'
}
```

Important rule

Do not compile directly from DB rows.

Always normalize first.

Because DB schema changes later.

# 2. Stage B — Normalize

Convert everything into canonical structure:

```ts
type NormalizedSkill = {
    header: {
        name: string
        version?: string
    }
    role: string
    behavior: string[]
    knowledge: string[]
    assets: CompiledAsset[]
    runtimeRules: string[]
}
```

Why normalization matters

Because user content may be messy:

Sometimes:

description = long paragraph
instructions = bullets

Sometimes:

description empty
instructions huge

Normalize into fixed slots.

# 3. Description Split Strategy (Very Important)

A strong heuristic:

description → role

Take first semantic paragraph:

Expert content strategist and creator...

→ becomes:

role
instructions → behavior + knowledge

Split bullets:

If imperative sentence:

Prioritize clarity

→ behavior

If domain fact:

LinkedIn prefers concise tone

→ knowledge

Heuristic:

behavior detector

Starts with verbs:

prioritize
adapt
avoid
generate
use
knowledge detector

Declarative:

LinkedIn uses...
SEO requires...

This gives better compile quality.

## 4. Stage C — Asset Compilation

This is where your Flowise feature becomes powerful.

You already have:

summary mode
multimodal mode

Use separate compiler.

Asset compiler interface
type AssetCompileResult = {
textBlock?: string
multimodalPayload?: any[]
}
Summary mode

For each asset:

{
textBlock: `Asset: campaign.jpg
Summary: A content board showing launch milestones`
}
Multimodal mode

Do not embed binary into text compile.

Instead:

```json
{
  textBlock: `
Asset: campaign.jpg
Delivery: multimodal attachment available
`,
  multimodalPayload: [...]
}
```

Why this separation matters

Because:

Prompt text and transport payload are different layers.

A common mistake:

People merge them too early.

That causes:

duplication
token waste
model confusion 5. Multi-file Merge Algorithm

If skill contains multiple files:

Need deterministic ordering.

Recommended:

Priority order

1. main skill file
2. instruction files
3. reference files
4. assets
   Suggested sort

```js
files.sort((a, b) => {
    return priority(a.type) - priority(b.type)
})
```

Priority example:

main = 1
instruction = 2
reference = 3 6. Final Compile Renderer

Now render final string.

Strict order:

```txt
[SKILL HEADER]
[ROLE DEFINITION]
[BEHAVIOR CONTRACT]
[KNOWLEDGE CONTEXT]
[ASSET CONTEXT]
[RUNTIME EXECUTION RULES]
```

Renderer:

function renderSkill(skill: NormalizedSkill): string

Example:

```js
;[renderHeader(), renderRole(), renderBehavior(), renderKnowledge(), renderAssets(), renderRules()].filter(Boolean).join('\n\n')
```

7. Empty Section Elimination

Critical:

Never output empty sections.

Bad:

[ASSET CONTEXT]
None

Good:

omit entirely

Reason:

LLMs treat empty sections as semantic noise.

8. Runtime Injection into Agentflow v2

This is where many systems fail.

Correct merge order:

SYSTEM PROMPT
↓
SKILL COMPILE
↓
MEMORY
↓
TOOL CONTEXT
↓
USER MESSAGE

Why skill before memory:

Because skill defines capability.

Memory defines personalization.

9. Multiple Skills Merge Strategy

Future-safe for Agentflow:

Merge by skill priority
skills.sort((a,b)=> b.priority - a.priority)

Then:

=== SKILL 1 ===
...
=== SKILL 2 ===
...

Never flatten all skills into one section.

Because boundaries matter.

10. Token Budget Control (Very Important)

Later skills become large.

Need token trimming.

Recommended:

Trim order

Remove first:

knowledge → assets summary → low priority behavior

Keep always:

role + runtime rules

Because role and rules are highest impact.

11. Recommended Internal Compiler Structure

Very production-friendly:

class SkillCompiler {
load()
normalize()
compileAssets()
render()
} 12. Strong Production Recommendation for Flowise

Add:

compileHash

Example:

sha256(compiledOutput)

Why:

If skill unchanged:

skip recompilation.

Huge runtime win.

13. Ideal Final Runtime Object
    {
    compiledPrompt: string,
    multimodalPayload: [],
    tokenCount: number,
    hash: string
    }

This makes runtime debugging much easier.

14. What Flowise Usually Needs Next (Very Important)

Once compile works, next hard problem appears:

How Agent chooses whether to use Skill at all

Because always injecting all skills becomes expensive.

You eventually need:

skill retrieval / skill routing

Very similar to lightweight RAG.

That is usually phase after compile.
