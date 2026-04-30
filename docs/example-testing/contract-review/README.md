# Contract Review

A simple, single-skill example workspace: upload a vendor Statement
of Work (SOW) in Word format and get back a structured contract
summary covering scope, deliverables, payment milestones, key
assumptions, and termination — plus a plain-English recommendation.

For the upload, placeholder, and publish steps shared by every
example, see [`../README.md`](../README.md) §1–§4.

---

## What's in the box

```
contract-review/
├── README.md            ← this file
├── contract-review.md   ← Skill — the contract reviewer
└── vendor-sow.docx      ← Example vendor SOW (the document being reviewed)
```

This is the smallest possible example: one Skill markdown plus one
document. It's a great starting point if you've never published a
Skill before.

---

## Wiring it up

Open `contract-review.md` in the Skill editor. Inside, you'll see
this placeholder:

```
{{skill.<<NODE_ID_OF_vendor-sow.docx>>}}
```

Click on it, use the **file picker**, and select the
`vendor-sow.docx` file you uploaded. That's the only wiring step.

Then hit **Publish**.

---

## Try it out

In a chatflow that has the **Skill** tool node pointed at this
workspace, paste:

> Review the vendor SOW. Produce the full structured summary.

You should get back a contract summary with:

- **Header** — `SOW: STATEMENT OF WORK #SOW-2026-014`,
  `Parties: Acme Corp and Northwind Analytics LLC`,
  `Effective: April 1, 2026`, `Term: Six (6) months`,
  `Total value: $200,000`.
- **Scope** — a quoted scope sentence beginning *"Vendor shall
  design and deliver a Snowflake-based data warehouse modernization
  …"*.
- **Deliverables table** with four rows (D1–D4), due weeks 2 / 8
  / 12 / 24.
- **Payment milestones table** with four rows (M1=$40K, M2=$60K,
  M3=$60K, M4=$40K) totalling $200,000.
- **Key assumptions** — three bullets (`A1.`, `A2.`, `A3.`).
- **Termination summary** — one paragraph mentioning thirty (30)
  days' notice, the cure period, and the $15,000 wind-down cap.
- **Recommendation** — one of *Approve as-is*, *Approve with
  redlines*, or *Decline*, with a quoted clause as justification.

### Negotiate redlines

Try a follow-up that adds a constraint:

> Re-review the SOW assuming Acme has a strict policy that wind-down
> caps must be at least $25,000. Flag the specific clause that
> conflicts and recommend redlines.

You should see the recommendation flip to *Approve with redlines*,
the wind-down cap clause cited verbatim, and a suggested redline to
raise the cap. The deliverables and payment tables should still
match the original output.

---

## What if the answer looks wrong?

The Skill is written to **refuse** rather than guess. If the agent
can't read the document, it'll say so explicitly and ask for a
pasted excerpt. If you instead see fabricated numbers or `TBD`
placeholders, the Skill prompt was likely not re-published after
the last edit — hit **Publish** again and retry.
