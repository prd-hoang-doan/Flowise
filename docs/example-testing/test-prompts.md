# Skill — Starter Prompts

Quick prompts you can paste into a chatflow that has the **Skill**
tool node wired up. Use these to get a feel for how each example
workspace responds. See [`README.md`](./README.md) for setup.

Every prompt block below is a complete copy-paste. Each scenario
folder has its own README with more prompts and the full expected
output — start there for in-depth testing.

---

## 0. Smoke test — what tools are available?

Paste this in any chatflow that has a Skill node:

```
What tools do you have available? Briefly describe each one.
```

You should see one tool per Skill markdown you ticked on the Skill
node (e.g. `resume_screener`, `interview_questions`,
`email_drafter`). If you don't see them, double-check the node's
**Skill Files** setting.

---

## 1. Recruiting workspace

After uploading the `recruiting/` folder, naming the workspace
`Recruiting`, and ticking all three skill files on the Skill node:

### Screen a resume

```
Please screen this candidate for the Senior Python Developer role.

Candidate resume:
------------------
Jane Doe — 8 years of professional Python, 4 years on AWS EKS.
Built Kafka-based ingestion pipelines processing ~300M events/day
at FinTechCo. Led a team of 3 platform engineers. Strong with
pytest, mypy, and Terraform. Minimal Snowflake exposure but deep
BigQuery experience. Active Airflow contributor. MS in CS.
```

You should get back a structured screening report: a one-paragraph
summary, a Scores table (technical fit / experience / culture /
overall), top matches, gaps/risks, and a recommended next step.

### Generate the interview plan

```
Now generate an interview plan for Jane Doe based on the screening
you just produced.
```

You should get back exactly **ten** questions: 5 behavioral and 5
technical, each with a follow-up probe. The plan reuses the
strengths and gaps from the screening — if it asks about a totally
different role, the previous turn didn't land in the agent's
memory.

### Draft the panel email

```
Draft the panel email summarising Jane Doe's screen + the interview
plan, but don't send it yet.
```

You should get back a Markdown email under 250 words with a clear
subject line, a TL;DR, top strengths, risks to probe, the inlined
interview plan, and a logistics paragraph — followed by a JSON
preview of the email-sending payload.

---

## 2. Human Resources workspace

After uploading the `human-resources/` folder and naming the
workspace `Human Resources`, send these as **three separate user
turns** (not one big paste). The skills are designed to feed into
each other.

### Turn 1 — performance review

```
Run a performance review for employee_id E1001. Manager narrative:

"Shipped the v3 ingest pipeline a quarter early; mentored two
juniors; took ownership of the alerting refactor that cut on-call
pages by 40%. Could push back more on scope creep."
```

You should get back a performance review with Alex Park (E1001) as
the employee, a Software Engineer L4 in SF, with a previous rating
of `Exceeds`. If the header says someone different (e.g. wrong
level or location), the agent didn't read the roster — re-publish
and try again.

### Turn 2 — compensation review

```
Now produce the compensation review for E1001.
```

You should get back a scorecard with `Compa-ratio 1.05`, peer
median around `$160,000`, `In band? true`, merit guidance `4–6%`,
and no fairness flags. Plus a few policy-aligned bullets and a
recommendation tag (one of *Hold / Merit increase / Off-cycle
adjustment / Promotion candidate*).

### Turn 3 — HR action memo

```
Build the HR action memo for E1001 from the two reports above. Do
not submit it yet.
```

You should get a tidy one-page memo with TL;DR, Performance,
Compensation, fairness flags, and a manager-actions checklist. The
numbers must match what you saw in turn 2 — if anything is `TBD` or
`[Insert ...]`, the upstream conversation was incomplete; re-run
turns 1–2.

### Negative test — out-of-band employee

```
Run the full review packet for E1004 (Jordan Lee) for this cycle.
```

You should see `Compa-ratio 1.035`, `In band? false`, the fairness
flag `out_of_policy_band`, and a recommendation of `Off-cycle
adjustment` with a quoted policy clause justifying it.

---

## 3. Contract Review workspace

After uploading `contract-review/` and naming the workspace
`Contract Review`:

### Summarise the SOW

```
Review the vendor SOW. Produce the full structured summary.
```

You should get back a contract summary with Header (parties,
effective date, term, total value), a Scope quote, a Deliverables
table (D1–D4), a Payment milestones table (M1–M4 totalling
$200,000), three Key assumptions, a Termination paragraph, and a
recommendation (*Approve as-is*, *Approve with redlines*, or
*Decline*).

### Negotiate redlines

```
Re-review the SOW assuming Acme has a strict policy that wind-down
caps must be at least $25,000. Flag the specific clause that
conflicts and recommend redlines.
```

You should see the recommendation flip to *Approve with redlines*,
the wind-down cap clause cited verbatim, and a suggested redline
to raise the cap.

---

## 4. Sales Pipeline workspace

After uploading `sales-pipeline/` and naming the workspace
`Sales Pipeline`:

### Run the weekly review

```
Run the pipeline review for the latest week.
```

You should get back a Pipeline Health Report with:

- **Header** mentioning `week 2026-W17` and the four owners.
- **Pipeline KPIs**: total pipeline `$2,440,000`, qualified
  pipeline `$1,865,000`, stalled count `2`, stalled value
  `$575,000`.
- **Stalled-deal triage** with two rows: D-1005 Evergreen Insurance
  and D-1009 Inkwell Media (both owned by p.singh).
- **Owner workload** sorted by total value (p.singh on top with
  three deals / $815,000).
- **Segment mix** across Enterprise / Mid-Market / SMB.
- **Headline** mentioning $575K stalled across 2 deals.

### Drill into a single sheet

```
Re-pull just the Deals sheet so I can sanity-check stage values.
Show me the raw data.
```

You should see the Deals rows quoted back to you as a table.

---

## 5. QBR Summary workspace

After uploading `qbr-summary/` and naming the workspace
`QBR Summary`:

### Summarise the deck

```
Summarise the Q3 QBR deck for the board.
```

You should get back a one-page exec summary with:

- **Header** mentioning `Q3 2026 Business Review` and slides 1–7.
- **TL;DR** with three bullets quoted from the Executive Summary
  slide, each ending with `(slide 2)`.
- **Goals vs Results** table — the only `Status: Miss` row is the
  Time-to-Value goal.
- **Customer wins** table (Aurora Health, Cinder Robotics, Halo
  Edu).
- **Risks** with three `Risk N:` bullets ending `(slide 6)`.
- **Asks** with three bullets ending `(slide 7)`.
- A bold **Headline** plus a short exec opinion paragraph.

### Cross-slide reasoning

```
From the deck, focus on the Goals-vs-Results slide. Which goal did
the team miss this quarter, and what does the deck propose to do
about it?
```

You should see the missed TTV goal cited from slide 3, connected to
the matching `Risk 1:` bullet on slide 6, and the related ask on
slide 7.

---

## 6. Press Release workspace

After uploading `press-release/` and naming the workspace
`Press Release`:

### Brief the Q1 release

```
Run the press release brief on the Q1 FY2026 release.
```

You should get back an Analyst Brief with:

- **Header** — `Northwind Analytics Reports First Quarter Fiscal
  2026 Results`, issuer `Northwind Analytics, Inc. (NASDAQ: NWND)`,
  period `Q1 FY2026 ended March 31, 2026`, released `May 1, 2026`.
- **Headline KPIs** — total revenue `$342.7 million` (+18% YoY),
  subscription revenue `$298.4 million` (+22%), ARR `$1.34 billion`
  (+21%), non-GAAP operating margin `23.6%` (+320 bps), non-GAAP
  diluted EPS `$0.47`, customers > $100K ARR `1,287` (+24%).
- **Management commentary** — two verbatim quotes attributed to
  `Maya Chen, Chief Executive Officer` and `Daniel Reyes, Chief
  Financial Officer`.
- **Segment results** — three rows: Platform `$221.5 million`
  (+19%), Services `$84.6 million` (+11%), Licensing `$36.6 million`
  (+25%).
- **Forward guidance** — Q2 revenue `$352M–$358M` and EPS
  `$0.48–$0.51`; full-year revenue `$1.43B–$1.45B` and EPS
  `$1.96–$2.04`.
- **Risk language flag** — **Standard**, justified by a clause
  quoted from the forward-looking-statements paragraph.
- A bold **Take** plus a short analyst opinion paragraph.

### Confirm the helper actually ran

```
Show me the first three lines of plain text the html_to_text.py
helper produced for this release.
```

You should see the `FOR IMMEDIATE RELEASE` / IR contact / headline
lines back in plain text — no `<p>`, `<h1>`, or `<script>` tags. If
you see raw HTML, the agent `cat`-ed the file instead of running the
built-in HTML helper.

---

## 7. Refusal behaviour

The skills are designed to refuse rather than make things up if the
agent can't read the source document for some reason (file is
corrupt, the format isn't supported, or document reading is
disabled in your environment). Instead of a fake answer you'll get
a polite message asking you to paste the relevant sections by hand.

This is the right behaviour — a memo with `TBD` cells is worse than
no memo. If you see fabricated numbers anyway, re-publish the Skill
to make sure the latest prompt is in use.
