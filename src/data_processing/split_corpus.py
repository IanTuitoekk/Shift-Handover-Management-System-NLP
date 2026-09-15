"""
split_corpus.py

Step 7 of the data pipeline: splits the synthetic corpus into
train/validation/test sets.

Two things this script is careful about:

1. NO LEAKAGE ACROSS LANGUAGE VARIANTS: each ASRS source record (identified
   by source_asrs_acn) produced 3 synthetic records (English, Swahili,
   code-switched). All 3 must land in the SAME split -- if the English
   version of an incident were in training and its Swahili twin in test,
   the model would effectively be evaluated on content it already saw
   during training, inflating your reported metrics.

2. STRATIFICATION uses incident_category_grouped (not the original
   fine-grained incident_category), since the rare categories were
   consolidated specifically to make stratified splitting possible.

Usage:
    python split_corpus.py
    python split_corpus.py --train 0.7 --val 0.15 --test 0.15
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

from sklearn.model_selection import train_test_split

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = PROJECT_ROOT / "data/processed/synthetic_corpus.jsonl"
OUTPUT_DIR = PROJECT_ROOT / "data/processed"


def load_records(path):
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def group_by_incident(records):
    """Group the 3 language variants of each ASRS record together."""
    groups = defaultdict(list)
    for r in records:
        groups[r["source_asrs_acn"]].append(r)
    return groups


def get_incident_category(group):
    """All 3 variants of one incident share the same incident_category_grouped
    -- just read it off the first one."""
    return group[0]["incident_category_grouped"]


def split_incidents(acns, categories, train_frac, val_frac, test_frac, seed=42):
    assert abs(train_frac + val_frac + test_frac - 1.0) < 1e-6, "Fractions must sum to 1.0"

    # First split: train vs (val+test combined)
    train_acns, temp_acns, train_cats, temp_cats = train_test_split(
        acns, categories,
        train_size=train_frac,
        stratify=categories,
        random_state=seed,
    )

    # Second split: val vs test, out of the remaining temp portion
    relative_val_frac = val_frac / (val_frac + test_frac)
    val_acns, test_acns = train_test_split(
        temp_acns,
        train_size=relative_val_frac,
        stratify=temp_cats,
        random_state=seed,
    )

    return set(train_acns), set(val_acns), set(test_acns)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=float, default=0.7)
    parser.add_argument("--val", type=float, default=0.15)
    parser.add_argument("--test", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    records = load_records(INPUT_PATH)
    groups = group_by_incident(records)

    acns = list(groups.keys())
    categories = [get_incident_category(groups[acn]) for acn in acns]

    print(f"Total incidents: {len(acns)}")
    cat_counts = defaultdict(int)
    for c in categories:
        cat_counts[c] += 1
    for c, n in cat_counts.items():
        print(f"  {c}: {n} incidents")

    train_acns, val_acns, test_acns = split_incidents(
        acns, categories, args.train, args.val, args.test, seed=args.seed
    )

    splits = {"train": train_acns, "validation": val_acns, "test": test_acns}

    for split_name, acn_set in splits.items():
        out_path = OUTPUT_DIR / f"{split_name}.jsonl"
        count = 0
        with open(out_path, "w", encoding="utf-8") as f:
            for acn in acn_set:
                for record in groups[acn]:
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    count += 1
        print(f"\n{split_name}: {len(acn_set)} incidents -> {count} records -> {out_path}")

        # Per-category breakdown for this split, so imbalance is visible
        split_cat_counts = defaultdict(int)
        for acn in acn_set:
            split_cat_counts[get_incident_category(groups[acn])] += 1
        for c, n in split_cat_counts.items():
            print(f"    {c}: {n} incidents")

    # Sanity check: no ACN appears in more than one split
    all_assigned = train_acns | val_acns | test_acns
    assert len(all_assigned) == len(acns), "Some incidents were not assigned to any split"
    assert not (train_acns & val_acns), "Leakage between train and validation"
    assert not (train_acns & test_acns), "Leakage between train and test"
    assert not (val_acns & test_acns), "Leakage between validation and test"
    print("\nNo-leakage check passed: every incident assigned to exactly one split.")


if __name__ == "__main__":
    main()