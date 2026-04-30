# Recruiting

A three-step example workspace: upload a job description and a small
scoring script, and get back a complete recruiting workflow for any
candidate — screening report, tailored interview plan, and a panel
email.

This scenario shows how multiple Skills can chain together: an email
drafter that depends on an interview plan that depends on a
screening report.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
recruiting/
├── README.md                 ← this file
├── job-description.txt       ← Open role (Senior Python Developer)
├── scoring_algorithm.js      ← Deterministic candidate scoring script
├── resume-screener.md        ← Skill — resume screener
├── interview-questions.md    ← Skill — interview plan generator
└── email-drafter.md          ← Skill — panel email drafter
```

### How the three Skills relate

```
email-drafter  ─┬─▶  resume-screener   ─┬─▶  job-description.txt
                │                        └─▶  scoring_algorithm.js
                │
                └─▶  interview-questions ─▶  resume-screener (transitive)
```

You'll typically run them in three turns: screen first, then
interview plan, then email.

---

## Wiring it up

Each `.md` file has a few placeholders that need to be connected via
the file picker:

| File                       | Placeholders to connect                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `resume-screener.md`       | `job-description.txt`, `scoring_algorithm.js`                                     |
| `interview-questions.md`   | `resume-screener.md`                                                              |
| `email-drafter.md`         | `resume-screener.md`, `interview-questions.md`                                    |

Open each `.md`, click the visible placeholder, pick the matching
uploaded file from the picker, save. Tool placeholders (the
`<<UUID_FOR_*>>` ones) can be left as-is — those are stable
identifiers the editor recognises.

Then hit **Publish**. If a placeholder isn't connected, publish
fails with a clear message about which one to fix.

---

## Try it out

In a chatflow that has the **Skill** tool node pointed at this
workspace and all three skills enabled, send these as **three
separate user turns**.

### Turn 1 — screen a candidate

> Please screen this candidate for the Senior Python Developer role.
>
> Candidate resume:
> ------------------
> Jane Doe — 8 years of professional Python, 4 years on AWS EKS.
> Built Kafka-based ingestion pipelines processing ~300M events/day
> at FinTechCo. Led a team of 3 platform engineers. Strong with
> pytest, mypy, and Terraform. Minimal Snowflake exposure but deep
> BigQuery experience. Active Airflow contributor. MS in CS.

You should get back a screening report with a Summary, a Scores
table (technical fit / experience / culture / overall), top
matches, gaps/risks, and a recommended next step.

### Turn 2 — generate the interview plan

> Now generate an interview plan for Jane Doe based on the screening
> you just produced.

You should get back exactly **ten** questions (5 behavioral + 5
technical), each with a follow-up probe. The plan reuses the
strengths and gaps from the screening.

### Turn 3 — draft the panel email

> Draft the panel email summarising Jane Doe's screen + the
> interview plan, but don't send it yet.

You should get a Markdown email under 250 words with a clear
subject line, a TL;DR, top strengths, risks to probe, the inlined
interview plan, and a logistics paragraph — followed by a JSON
preview of the email-sending payload (preview only, not actually
sent).

---

## What if the answer looks wrong?

The Skills are written to **refuse** rather than guess. If the
agent can't read the job description or run the scoring script,
it'll fall back to manual scoring and flag what was unavailable. If
you instead see fabricated scores or `TBD` cells, the Skill prompts
were likely not re-published after the last edit — hit **Publish**
again and retry.
