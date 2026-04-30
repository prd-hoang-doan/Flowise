# Human Resources

A three-step example workspace: upload an employee roster, a
compensation policy PDF, and a small comp-analysis script, and get
back a complete review packet for any employee — performance review,
compensation review, and a one-page HR action memo.

This scenario shows how multiple Skills can chain together: a memo
that depends on a comp review that depends on a performance review.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
human-resources/
├── README.md                       ← this file
├── compensation-policy.pdf         ← Company comp policy (PDF)
├── employee-roster.csv             ← Employee roster (CSV)
├── comp_analysis.py                ← Compensation analysis script
├── performance-review.md           ← Skill — performance review
├── compensation-review.md          ← Skill — compensation review
└── hr-action-memo.md               ← Skill — HR action memo
```

### How the three Skills relate

```
hr-action-memo  ─┬─▶  performance-review  ─▶  employee-roster.csv
                 │
                 └─▶  compensation-review  ─┬─▶  employee-roster.csv
                                            ├─▶  comp_analysis.py
                                            └─▶  compensation-policy.pdf
```

You'll typically run them in three turns: performance first, then
compensation, then the memo that bundles the two.

---

## Wiring it up

Each `.md` file has a few placeholders that need to be connected via
the file picker:

| File                       | Placeholders to connect                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `performance-review.md`    | `employee-roster.csv`                                                                              |
| `compensation-review.md`   | `employee-roster.csv`, `compensation-policy.pdf`, `comp_analysis.py`, `performance-review.md`      |
| `hr-action-memo.md`        | `performance-review.md`, `compensation-review.md`                                                  |

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
separate user turns** (not one big paste). The skills feed into each
other through conversation history.

### Turn 1 — performance review

> Run a performance review for **employee_id E1001**. Manager
> narrative:
>
> "Shipped the v3 ingest pipeline a quarter early; mentored two
> juniors; took ownership of the alerting refactor that cut on-call
> pages by 40%. Could push back more on scope creep."

You should get back a structured performance review with
`Employee: Alex Park (E1001) — Software Engineer L4, SF` and
`Previous rating: Exceeds`. If the header has the wrong role, level,
or location, the agent didn't read the roster — re-publish and try
again.

### Turn 2 — compensation review

> Now produce the compensation review for E1001.

You should get back a scorecard with the real numbers from the
analysis script:

- `Compa-ratio 1.05`
- `Peer median $160,000`
- `Peer count 2`
- `In band? true`
- `Merit guidance % [4, 6]`
- `Fairness flags []`

Plus a few policy-aligned bullets quoted from the policy PDF, and a
recommendation tag (one of *Hold / Merit increase / Off-cycle
adjustment / Promotion candidate*). Any `TBD` or `[Insert ...]` cell
means something went wrong upstream — try the turn again.

### Turn 3 — HR action memo

> Build the HR action memo for E1001 from the two reports above. Do
> not submit it yet.

You should get a tidy one-page memo with TL;DR, Performance,
Compensation, fairness flags, and a manager-actions checklist. The
numbers in the memo must match what you saw in turn 2.

---

## More scenarios to try

### Out-of-band employee (E1004)

> Run the full review packet for E1004 (Jordan Lee) for this cycle.

You should see `Compa-ratio 1.035`, `In band? false`,
`Fairness flags ["out_of_policy_band"]`, and a recommendation of
*Off-cycle adjustment* with a quoted policy clause justifying it.

### Mismatch (negative test)

> Run the comp review for E1003 with a stated rating of "Outstanding"
> (the manager wants to advocate for an above-band increase).

The agent should run the analysis (which returns the actual rating
of `Meets`), spot the mismatch, and refuse with a `policy_drift`
warning rather than producing made-up numbers.

---

## What if the answer looks wrong?

The Skills are written to **refuse** rather than guess. If the
agent can't read the roster, the policy, or the analysis script,
it'll say so explicitly and ask you to paste the relevant data by
hand. If you instead see fabricated numbers or `TBD` cells, the
Skill prompts were likely not re-published after the last edit —
hit **Publish** again and retry.
