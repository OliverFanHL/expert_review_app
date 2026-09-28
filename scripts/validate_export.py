"""Check a downloaded expert CSV against the frozen study package before import."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]


def validate(csv_file: Path, role: str) -> dict:
    manifest = json.loads((APP / "data/pairs.json").read_text(encoding="utf-8"))
    with csv_file.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["pair_id", "query_asset", "candidate_asset", "grade", "evidence"]:
            raise ValueError("Export columns do not match the study finalizer template")
        rows = list(reader)
    if len(rows) != len(manifest["pairs"]):
        raise ValueError("Export row count differs from the frozen pair list")
    required = role in {"rater_a", "rater_b"}
    rated = 0
    for expected, actual in zip(manifest["pairs"], rows):
        if actual["pair_id"] != expected["pair_id"] or \
           actual["query_asset"] != expected["query_id"] + ".stp" or \
           actual["candidate_asset"] != expected["candidate_id"] + ".stp":
            raise ValueError(f"Pair identity/order changed at {expected['pair_id']}")
        grade = actual["grade"].strip()
        if grade:
            if grade not in {"0", "1", "2", "3"}:
                raise ValueError(f"Invalid grade for {expected['pair_id']}")
            rated += 1
        elif required:
            raise ValueError(f"Missing {role} grade for {expected['pair_id']}")
    return {"role": role, "pairs": len(rows), "rated": rated,
            "protocol_hash": manifest["protocol_hash"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--role", required=True, choices=("rater_a", "rater_b", "adjudication"))
    args = parser.parse_args()
    print(json.dumps(validate(args.csv, args.role), indent=2))
