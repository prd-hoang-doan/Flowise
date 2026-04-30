# QBR Summary

A single-skill example workspace: upload a Quarterly Business Review
(QBR) deck and get back a one-page executive summary covering goals
vs results, customer wins, risks, and asks for the board.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
qbr-summary/
├── README.md                 ← this file
├── qbr-summary.md            ← Skill — the QBR summariser
└── q3-business-review.pptx   ← Example QBR deck (7 slides)
```

### What's in the deck

| # | Title                   |
| - | ----------------------- |
| 1 | Q3 2026 Business Review |
| 2 | Executive Summary       |
| 3 | Q3 Goals vs Results     |
| 4 | Revenue Performance     |
| 5 | Customer Wins           |
| 6 | Q4 Risks                |
| 7 | Asks for the Board      |

---

## Wiring it up

Open `qbr-summary.md` in the Skill editor. Inside, you'll see this
placeholder:

```
{{skill.<<NODE_ID_OF_q3-business-review.pptx>>}}
```

Click on it, use the **file picker**, and select the
`q3-business-review.pptx` file you uploaded. That's the only wiring
step.

Then hit **Publish**.

---

## Try it out

In a chatflow that has the **Skill** tool node pointed at this
workspace, paste:

> Summarise the Q3 QBR deck for the board.

You should get back a one-page executive summary with:

- **Header** — `Q3 2026 Business Review`, slides covered `1–7`.
- **TL;DR** — three bullets quoted from slide 2 (Executive
  Summary), each suffixed with `(slide 2)`. Expected lines:
  - `Net Revenue Retention finished at 118%, beating the 112% target. (slide 2)`
  - `Closed three Tier-1 logos: Aurora Health, Cinder Robotics, Halo Edu. (slide 2)`
  - `Support deflection via the new self-serve portal hit 41%. (slide 2)`
- **Goals vs Results** table with four rows; the only `Status: Miss`
  row should be the Time-to-Value (TTV) row (target `<= 28 days`,
  actual `31 days`).
- **Customer wins** table with three logos; Aurora Health
  `Enterprise / AMER` headline should be `36-month term`.
- **Risks** with three bullets, each starting `Risk 1:` /
  `Risk 2:` / `Risk 3:` and suffixed `(slide 6)`.
- **Asks** with three bullets ending `(slide 7)`.
- **Headline** in **bold**; the exec opinion paragraph is the
  Skill's own analysis (NOT quoted, NOT followed by `(slide N)`).

### Cross-slide reasoning

Try a follow-up that asks the agent to connect dots across slides:

> From the deck, focus on the Goals-vs-Results slide. Which goal
> did the team miss this quarter, and what does the deck propose to
> do about it?

You should see the missed TTV goal cited from slide 3, connected to
the matching `Risk 1:` bullet on slide 6, and the related ask on
slide 7 (about hiring more onboarding consultants).

---

## How to spot a hallucination

Every quoted line in the TL;DR / Customer wins / Risks / Asks
sections must end with `(slide N)`. If a quoted line lacks the
citation, the agent made it up rather than reading the deck.

If you see this happen, hit **Publish** again to make sure the
latest Skill prompt is in use, then retry. The Skill is written to
**refuse** rather than guess if the deck is unreadable — you'll get
a clear "can't read the deck" message and can paste the slides by
hand.
