# Press Release

A single-skill example workspace: upload a corporate earnings press
release as an HTML page and get back an Analyst Brief covering
headline KPIs, verbatim management quotes, segment results, forward
guidance, and a flag of the risk language.

This is the scenario that exercises the runtime's built-in
**`html_to_text.py`** helper — the one that strips `<script>` /
`<style>` blocks, decodes HTML entities, and turns a marketing page
into clean plain text the agent can quote from.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
press-release/
├── README.md                          ← this file
├── press-release.md                   ← Skill — the analyst brief generator
└── q1-earnings-press-release.html     ← Example earnings release (HTML)
```

This is a smallest-possible example: one Skill markdown plus one HTML
document.

### What's in the HTML page

A fictional Q1 FY2026 earnings press release for **Northwind
Analytics, Inc.** (NASDAQ: NWND), structured the way real investor
relations pages are:

| Section                    | What it carries                                                  |
| -------------------------- | ---------------------------------------------------------------- |
| Header                     | `FOR IMMEDIATE RELEASE`, IR contact line.                        |
| Title                      | `Northwind Analytics Reports First Quarter Fiscal 2026 Results`. |
| Dateline                   | `SAN FRANCISCO — May 1, 2026`, ticker, one-line description.     |
| Highlights                 | Six bullets with revenue, ARR, margin, EPS, and customer KPIs.   |
| Management Commentary      | Two quoted blocks — one from the CEO, one from the CFO.          |
| Segment Results            | Three-row table: Platform / Services / Licensing.                |
| Business Outlook           | Q2 and full-year guidance ranges (revenue + non-GAAP EPS).       |
| Forward-Looking Statements | Standard cautionary paragraph (the "risk language").             |
| About                      | One-paragraph company description.                               |

The page also includes two `<script>` blocks and a `<style>` block
that the helper drops, plus HTML entities (`&mdash;`, `&amp;`,
`&#8209;`) the helper decodes.

---

## Wiring it up

Open `press-release.md` in the Skill editor. Inside, you'll see this
placeholder:

```
{{skill.<<NODE_ID_OF_q1-earnings-press-release.html>>}}
```

Click on it, use the **file picker**, and select the
`q1-earnings-press-release.html` file you uploaded. That's the only
wiring step.

Then hit **Publish**.

---

## Try it out

In a chatflow that has the **Skill** tool node pointed at this
workspace, paste:

> Run the press release brief on the Q1 FY2026 release.

You should get back an Analyst Brief with:

-   **Header** — `Northwind Analytics Reports First Quarter Fiscal
    2026 Results`, issuer `Northwind Analytics, Inc. (NASDAQ: NWND)`,
    period `Q1 FY2026 ended March 31, 2026`, released `May 1, 2026`.
-   **Headline KPIs** table with six rows:
    -   Total revenue `$342.7 million` (+18% YoY)
    -   Subscription revenue `$298.4 million` (+22% YoY)
    -   ARR `$1.34 billion` (+21% YoY)
    -   Non-GAAP operating margin `23.6%` (+320 bps YoY)
    -   Non-GAAP diluted EPS `$0.47` (vs `$0.31` prior year)
    -   Customers > $100K ARR `1,287` (+24% YoY)
-   **Management commentary** — two verbatim quotes:
    -   `Maya Chen, Chief Executive Officer:` quote about crossing
        $1.3 billion in subscription ARR and accelerating AI adoption.
    -   `Daniel Reyes, Chief Financial Officer:` quote about the 320
        bps operating-margin expansion and disciplined go-to-market.
-   **Segment results** table with three rows: Platform `$221.5
    million` (+19%), Services `$84.6 million` (+11%), Licensing `$36.6
    million` (+25%).
-   **Forward guidance** table with two rows:
    -   Next quarter — revenue `$352 million to $358 million`,
        non-GAAP EPS `$0.48 to $0.51`.
    -   Full fiscal year — revenue `$1.43 billion to $1.45 billion`,
        non-GAAP EPS `$1.96 to $2.04`.
-   **Risk language flag** — **Standard**, justified by a quoted
    clause from the forward-looking-statements paragraph (e.g.
    `subject to risks and uncertainties`).
-   **Take** — a bold one-sentence headline plus a short analyst
    paragraph (the only part NOT quoted from the release).

### Drill into a single section

Try a follow-up that asks for a fresh look at one section only:

> Re-pull just the Business Outlook from the press release and quote
> the guidance ranges back to me.

You should see the Q2 and full-year revenue / EPS ranges quoted back
to you verbatim — `$352 million to $358 million`, `$0.48 to $0.51`,
`$1.43 billion to $1.45 billion`, `$1.96 to $2.04` — with no
narrative wrapped around them.

### Confirm the helper actually ran

Try a follow-up that asks the agent to prove it used the helper:

> Show me the first three lines of plain text the html_to_text.py
> helper produced for this release.

You should see something like:

```
FOR IMMEDIATE RELEASE
Investor Relations contact: ir@northwind-analytics.example · (415) 555‑0142
Northwind Analytics Reports First Quarter Fiscal 2026 Results
```

If the agent shows raw HTML tags (`<p>`, `<h1>`, `<script>`) instead,
it `cat`-ed the file rather than running the helper — re-run the
prompt and re-publish if needed.

---

## What if the answer looks wrong?

The Skill is written to **refuse** rather than guess. If the agent
can't read the HTML page, it'll say so explicitly and ask for a
pasted excerpt. Common failure shapes and how to read them:

-   **Numbers off by a factor of 1,000** — the agent rounded or
    converted units. Re-run; the Skill rules forbid rounding.
-   **A quote that's almost-but-not-quite verbatim** — the agent
    paraphrased. The Skill rules require substring matches against
    the extracted text; re-publish to make sure the latest prompt is
    in use.
-   **`<script>`-block code showing up in the brief** — the agent
    skipped the helper and `cat`-ed the file. Re-run with the prompt
    above that asks the agent to show the helper's first three lines.
-   **`TBD` cells anywhere** — the Skill prompt was likely not
    re-published after the last edit; hit **Publish** again and retry.
