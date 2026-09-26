"""
process_test_corpus.py

Companion to process_corpus.py, used ONLY for final test-set evaluation.

Unlike process_corpus.py, this does NOT expand abbreviations -- per the
project's documented design intent (see process_corpus.py's docstring),
test.jsonl must reflect realistic, unprocessed input so evaluation
measures real-world performance rather than performance on artificially
cleaned text.

This still tokenizes with the same mBERT tokenizer and builds BIO tags
using the exact same logic as process_corpus.py, so the two are
comparable -- the only difference is the missing abbreviation-expansion
step.

Usage:
    python process_test_corpus.py
"""

import json
from pathlib import Path

from transformers import AutoTokenizer
from process_corpus import build_bio_tags  # reuse the exact same BIO logic

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data/processed"
TOKENIZER_NAME = "bert-base-multilingual-cased"


def process_test_file(tokenizer):
    in_path = DATA_DIR / "test.jsonl"
    out_path = DATA_DIR / "test_processed.jsonl"

    unmatched_log = []
    overlap_log = []
    processed = []

    with open(in_path, encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)

            # NOTE: no abbreviation expansion here, intentionally --
            # raw narrative_text and raw entity text are used as-is.
            raw_text = record["narrative_text"]
            raw_entities = record.get("entities", [])

            input_ids, bio_tags = build_bio_tags(raw_text, raw_entities, tokenizer, unmatched_log, overlap_log)

            processed.append({
                **record,
                "input_ids": input_ids,
                "bio_tags": bio_tags,
            })

    with open(out_path, "w", encoding="utf-8") as f:
        for r in processed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    return out_path, len(processed), unmatched_log, overlap_log


def main():
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    out_path, count, unmatched_log, overlap_log = process_test_file(tokenizer)

    print(f"test.jsonl: {count} records processed -> {out_path}")
    print(f"  Unmatched entities: {len(unmatched_log)}")
    print(f"  Skipped due to span overlap: {len(overlap_log)}")

    if unmatched_log:
        log_path = DATA_DIR / "test_unmatched_entities_log.jsonl"
        with open(log_path, "w", encoding="utf-8") as f:
            for entry in unmatched_log:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"  Unmatched entities logged to {log_path}")

    if overlap_log:
        log_path = DATA_DIR / "test_overlap_entities_log.jsonl"
        with open(log_path, "w", encoding="utf-8") as f:
            for entry in overlap_log:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"  Overlap entities logged to {log_path}")

    print("\nThis is a one-time evaluation step. test.jsonl itself remains untouched.")


if __name__ == "__main__":
    main()