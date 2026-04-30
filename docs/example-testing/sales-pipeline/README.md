# Sales Pipeline

A single-skill example workspace: upload a multi-sheet sales pipeline
spreadsheet and get back a Pipeline Health Report — total and
qualified pipeline value, stalled-deal triage, owner workload, and
segment mix.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
sales-pipeline/
├── README.md             ← this file
├── pipeline-review.md    ← Skill — the pipeline reviewer
└── sales-pipeline.xlsx   ← Example spreadsheet (3 sheets)
```

### What's in the spreadsheet

| Sheet              | What it contains                                                                  |
| ------------------ | --------------------------------------------------------------------------------- |
| `Deals`            | One row per open deal: account, owner, stage, value, close date, days since last touch (10 rows). |
| `Accounts`         | One row per account: segment, region, customer success manager (10 rows).         |
| `Weekly_Snapshot`  | Weekly totals — total pipeline, qualified count, won/lost counts (6 rows, weeks 12–17). |

---

## Wiring it up

Open `pipeline-review.md` in the Skill editor. Inside, you'll see
this placeholder:

```
{{skill.<<NODE_ID_OF_sales-pipeline.xlsx>>}}
```

Click on it, use the **file picker**, and select the
`sales-pipeline.xlsx` file you uploaded. That's the only wiring step.

Then hit **Publish**.

---

## Try it out

In a chatflow that has the **Skill** tool node pointed at this
workspace, paste:

> Run the pipeline review for the latest week.

You should get back a Pipeline Health Report with:

- **Header** — `Pipeline Health Report — week 2026-W17`,
  owners covered: `j.tanaka, k.nguyen, m.lopez, p.singh`,
  segments covered: `Enterprise, Mid-Market, SMB`.
- **Pipeline KPIs**:
  - Total pipeline `$2,440,000` (matches Weekly_Snapshot W17)
  - Qualified pipeline `$1,865,000`
  - Closed Won this week `1`
  - Stalled count `2`, stalled value `$575,000`.
- **Stalled-deal triage** with two rows: D-1005 Evergreen Insurance
  ($450,000, 42 days) and D-1009 Inkwell Media ($125,000, 38
  days), both owned by p.singh.
- **Owner workload** sorted by total value descending — p.singh on
  top with `3 deals / $815,000`.
- **Segment mix** — Enterprise `5 deals / $1,790,000`, Mid-Market
  `3 deals / $545,000`, SMB `2 deals / $335,000`.
- **Headline** mentioning $575K stalled across 2 deals owned by
  p.singh.

### Drill into a single sheet

Try a follow-up like:

> Re-pull just the Deals sheet so I can sanity-check stage values.
> Show me the raw data.

You should see the Deals rows quoted back to you as a clean table.

### Confirm robust handling of bad input

Try a follow-up that asks for a sheet that doesn't exist:

> Re-extract using sheet number 99 to confirm it handles
> out-of-range sheets sanely.

You should get a clear "no such sheet" message — not made-up data.

---

## What if the answer looks wrong?

The Skill is written to **refuse** rather than guess. If the agent
can't read the spreadsheet, it'll say so explicitly and ask you to
paste the sheets by hand. If you instead see fabricated KPIs or
`TBD` cells, the Skill prompt was likely not re-published after the
last edit — hit **Publish** again and retry.
