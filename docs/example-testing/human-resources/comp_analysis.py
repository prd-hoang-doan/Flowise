#!/usr/bin/env python3
"""
Compensation analysis used by the human-resources Skill.

Invocation contract (Flowise Skill sandbox — E2B bash session):

    # Short form — CSV defaults to employee-roster.csv next to the script:
    python3 /home/user/skills/comp_analysis.py <employee_id>

    # Explicit form — supply the CSV path:
    python3 /home/user/skills/comp_analysis.py <csv_path> <employee_id>

Both forms produce the same output. The short form exists because LLMs
sometimes drop the leading positional path argument; defaulting it to
the script's own directory makes the script forgiving without losing
explicit-control.

Reads the roster CSV, finds the target employee, computes peer-relative
compensation metrics, and prints a single JSON object to stdout, e.g.:

    {
      "employee_id": "E1001",
      "name": "Alex Park",
      "role": "Software Engineer",
      "level": "L4",
      "location": "SF",
      "base_salary_usd": 168000,
      "peer_median_usd": 160000,
      "peer_count": 2,
      "compa_ratio": 1.05,
      "percentile_in_peer_group": 100.0,
      "last_rating": "Exceeds",
      "policy_band": [0.95, 1.10],
      "in_band": true,
      "merit_increase_guidance_pct": [4, 6],
      "fairness_flags": []
    }

Design constraints (intentional):
  - Stdlib only. No third-party deps.
  - No network. Reads exactly one CSV file from argv[1].
  - Deterministic: same CSV + employee_id -> same output, always.
  - No write side-effects: stdout only.
"""

import csv
import json
import statistics
import sys
from pathlib import Path

DEFAULT_CSV_NAME = "employee-roster.csv"

POLICY_BAND_BY_RATING = {
    "Outstanding":  (1.05, 1.15),
    "Exceeds":      (0.95, 1.10),
    "Meets":        (0.90, 1.05),
    "Inconsistent": (0.85, 0.95),
    "Below":        None,  # PIP track — out of band by definition
}

MERIT_GUIDANCE_BY_RATING = {
    "Outstanding":  (6, 9),
    "Exceeds":      (4, 6),
    "Meets":        (2, 3),
    "Inconsistent": (0, 1),
    "Below":        (0, 0),
}

PAY_EQUITY_THRESHOLD_PCT = 5.0


def load_roster(csv_path):
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            row["base_salary_usd"] = int(row["base_salary_usd"])
            rows.append(row)
    return rows


def percentile_rank(value, peers):
    if not peers:
        return None
    less = sum(1 for p in peers if p < value)
    equal = sum(1 for p in peers if p == value)
    return round(((less + 0.5 * equal) / len(peers)) * 100, 1)


def analyze(rows, employee_id):
    target = next((r for r in rows if r["employee_id"] == employee_id), None)
    if target is None:
        return None

    peers = [
        r["base_salary_usd"]
        for r in rows
        if r["role"] == target["role"]
        and r["level"] == target["level"]
        and r["location"] == target["location"]
        and r["employee_id"] != target["employee_id"]
    ]
    peer_median = float(statistics.median(peers)) if peers else float(target["base_salary_usd"])

    compa_ratio = round(target["base_salary_usd"] / peer_median, 3)
    percentile = percentile_rank(target["base_salary_usd"], peers)

    rating = target["last_rating"]
    band = POLICY_BAND_BY_RATING.get(rating)
    in_band = (band[0] <= compa_ratio <= band[1]) if band else False
    merit = MERIT_GUIDANCE_BY_RATING.get(rating, (0, 0))

    flags = []
    if peers:
        diff_pct = abs(target["base_salary_usd"] - peer_median) / peer_median * 100.0
        if diff_pct > PAY_EQUITY_THRESHOLD_PCT:
            flags.append("pay_equity_check_required")
    if band is not None and not in_band:
        flags.append("out_of_policy_band")
    if band is None:
        flags.append("rating_requires_pip_track")

    return {
        "employee_id": target["employee_id"],
        "name": target["name"],
        "role": target["role"],
        "level": target["level"],
        "location": target["location"],
        "base_salary_usd": target["base_salary_usd"],
        "peer_median_usd": peer_median,
        "peer_count": len(peers),
        "compa_ratio": compa_ratio,
        "percentile_in_peer_group": percentile,
        "last_rating": rating,
        "policy_band": list(band) if band else None,
        "in_band": in_band,
        "merit_increase_guidance_pct": list(merit),
        "fairness_flags": flags,
    }


def resolve_args(argv):
    """Accept either `<employee_id>` or `<csv_path> <employee_id>`.

    Returns (csv_path, employee_id) on success, or None on bad usage.
    Disambiguates the 1-arg form by checking whether the lone positional
    looks like a path (contains a slash or ends with `.csv`); if it does,
    the user gave us a CSV path with no employee_id and that's an error.
    """
    if len(argv) == 2:
        sole = argv[1]
        if "/" in sole or sole.lower().endswith(".csv"):
            return None  # path-only, missing employee_id
        default_csv = Path(__file__).resolve().parent / DEFAULT_CSV_NAME
        return str(default_csv), sole
    if len(argv) == 3:
        return argv[1], argv[2]
    return None


def main():
    args = resolve_args(sys.argv)
    if args is None:
        sys.stderr.write(
            "usage: comp_analysis.py [<csv_path>] <employee_id>\n"
            "  - With one arg: looks up <employee_id> in employee-roster.csv\n"
            "    next to this script.\n"
            "  - With two args: uses the explicit <csv_path>.\n"
        )
        sys.exit(2)

    csv_path, employee_id = args
    rows = load_roster(csv_path)
    result = analyze(rows, employee_id)
    if result is None:
        sys.stderr.write(f"employee_id not found: {employee_id}\n")
        sys.exit(1)

    sys.stdout.write(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
