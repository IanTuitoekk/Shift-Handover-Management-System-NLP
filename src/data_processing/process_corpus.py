"""
process_corpus.py

Step 8 of the data pipeline: cleans, normalizes, and tokenizes the training
data, and converts entity spans into token-level BIO tags for NER training.

IMPORTANT: this script processes train.jsonl and validation.jsonl ONLY.
test.jsonl is never touched -- it must stay in its raw, unprocessed form
so evaluation reflects realistic input, not input that's been cleaned to
match the training distribution.

What this does, per record:
1. Expands known aviation abbreviations (using data/reference/
   abbreviation_normalization.csv) in both narrative_text and each
   entity's text, so the two stay in sync for span-matching.
2. Tokenizes narrative_text with the mBERT tokenizer
   (bert-base-multilingual-cased), keeping character offsets.
3. Locates each entity's character span in the (now-expanded) text and
   converts it to token-level BIO tags (B-<TYPE>, I-<TYPE>, O).
4. Logs any entity that couldn't be matched to a span, rather than
   silently dropping it -- this is exactly the kind of thing worth
   reporting honestly in your write-up.

Setup:
    pip install transformers

Usage:
    python process_corpus.py
"""

import csv
import json
import re
from pathlib import Path

from transformers import AutoTokenizer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ABBREV_PATH = PROJECT_ROOT / "data/reference/abbreviation_normalization.csv"
INPUT_FILES = ["train.jsonl", "validation.jsonl"]  # test.jsonl deliberately excluded
DATA_DIR = PROJECT_ROOT / "data/processed"

TOKENIZER_NAME = "bert-base-multilingual-cased"


def load_abbreviations(path):
    abbrev_map = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            abbrev_map[row["abbreviation"]] = row["expansion"]
    return abbrev_map


def expand_abbreviations(text, abbrev_map):
    """Expand whole-word abbreviation matches only (word boundaries), so we
    don't e.g. expand the 'AGL' inside some longer unrelated token."""
    def replace(match):
        word = match.group(0)
        return abbrev_map.get(word, word)

    # Sort longest-first so multi-word-looking abbreviations aren't partially
    # shadowed by shorter ones (not a real concern here since all keys are
    # single tokens, but cheap safety).
    pattern = r"\b(" + "|".join(re.escape(k) for k in sorted(abbrev_map, key=len, reverse=True)) + r")\b"
    return re.sub(pattern, replace, text)


def build_bio_tags(text, entities, tokenizer, unmatched_log, overlap_log):
    encoding = tokenizer(text, return_offsets_mapping=True, add_special_tokens=True)
    offsets = encoding["offset_mapping"]
    tags = ["O"] * len(offsets)

    # First pass: resolve every entity's character span (without tagging
    # yet), so we know each one's span BEFORE deciding tagging order.
    resolved = []  # list of (char_start, char_end, entity_type, original_text)
    for entity in entities:
        entity_text = entity["text"]
        entity_type = entity["type"]
        if not entity_text:
            continue

        char_start = text.find(entity_text)

        # Fallback 1: case-insensitive match (handles minor capitalization
        # drift between the entity list and the narrative body)
        if char_start == -1:
            lower_idx = text.lower().find(entity_text.lower())
            if lower_idx != -1:
                char_start = lower_idx

        # Fallback 2: the model sometimes truncates a longer entity with an
        # ellipsis inside the entity text itself (e.g. "Paneli za dari...
        # 5160C, 5161C na 5162C") -- that string can never appear verbatim
        # in the narrative. Try matching just the portion before the
        # ellipsis, if it's substantial enough to be meaningful.
        if char_start == -1 and "..." in entity_text:
            prefix = entity_text.split("...")[0].strip()
            if len(prefix) >= 8:  # avoid matching on trivial fragments
                prefix_idx = text.find(prefix)
                if prefix_idx != -1:
                    char_start = prefix_idx
                    entity_text = prefix  # tag only the matched prefix

        if char_start == -1:
            unmatched_log.append({
                "entity_text": entity["text"],
                "entity_type": entity_type,
                "reason": "not found in text (exact, case-insensitive, and truncation fallbacks all failed)",
            })
            continue

        char_end = char_start + len(entity_text)
        resolved.append((char_start, char_end, entity_type, entity["text"]))

    # Second pass: assign tags, LONGEST SPAN FIRST -- if two entities
    # overlap (e.g. "MEL" inside "MEL compliance"), the longer, more
    # specific one wins, and the shorter overlapping one is skipped and
    # logged rather than silently overwriting/being overwritten based on
    # arbitrary list order.
    resolved.sort(key=lambda r: r[1] - r[0], reverse=True)
    claimed = [False] * len(offsets)

    for char_start, char_end, entity_type, original_text in resolved:
        token_indices = [
            i for i, (tok_start, tok_end) in enumerate(offsets)
            if tok_start != tok_end and tok_start >= char_start and tok_end <= char_end
        ]
        if not token_indices:
            continue
        if any(claimed[i] for i in token_indices):
            overlap_log.append({
                "entity_text": original_text,
                "entity_type": entity_type,
                "reason": "skipped -- overlaps a longer, already-claimed entity span",
            })
            continue

        first_token = True
        for i in token_indices:
            tags[i] = f"B-{entity_type}" if first_token else f"I-{entity_type}"
            claimed[i] = True
            first_token = False

    return encoding["input_ids"], tags


def process_file(filename, abbrev_map, tokenizer):
    in_path = DATA_DIR / filename
    out_path = DATA_DIR / filename.replace(".jsonl", "_processed.jsonl")

    unmatched_log = []
    overlap_log = []
    processed = []

    with open(in_path, encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)

            expanded_text = expand_abbreviations(record["narrative_text"], abbrev_map)
            expanded_entities = [
                {"type": e["type"], "text": expand_abbreviations(e["text"], abbrev_map)}
                for e in record.get("entities", [])
            ]

            input_ids, bio_tags = build_bio_tags(expanded_text, expanded_entities, tokenizer, unmatched_log, overlap_log)

            processed.append({
                **record,
                "narrative_text_processed": expanded_text,
                "input_ids": input_ids,
                "bio_tags": bio_tags,
            })

    with open(out_path, "w", encoding="utf-8") as f:
        for r in processed:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    return out_path, len(processed), unmatched_log, overlap_log


def main():
    abbrev_map = load_abbreviations(ABBREV_PATH)
    print(f"Loaded {len(abbrev_map)} abbreviation mappings")

    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    print(f"Loaded tokenizer: {TOKENIZER_NAME}")

    all_unmatched = []
    all_overlaps = []
    for filename in INPUT_FILES:
        out_path, count, unmatched, overlaps = process_file(filename, abbrev_map, tokenizer)
        print(f"\n{filename}: {count} records processed -> {out_path}")
        print(f"  Unmatched entities: {len(unmatched)}")
        print(f"  Skipped due to span overlap: {len(overlaps)}")
        all_unmatched.extend(unmatched)
        all_overlaps.extend(overlaps)

    if all_unmatched:
        log_path = DATA_DIR / "unmatched_entities_log.jsonl"
        with open(log_path, "w", encoding="utf-8") as f:
            for u in all_unmatched:
                f.write(json.dumps(u, ensure_ascii=False) + "\n")
        print(f"\n{len(all_unmatched)} unmatched entities logged to {log_path} -- worth reviewing these.")

    if all_overlaps:
        overlap_path = DATA_DIR / "overlap_entities_log.jsonl"
        with open(overlap_path, "w", encoding="utf-8") as f:
            for o in all_overlaps:
                f.write(json.dumps(o, ensure_ascii=False) + "\n")
        print(f"{len(all_overlaps)} overlapping entities logged to {overlap_path} -- these were skipped in favor of a longer overlapping span, not silently overwritten.")

    print("\ntest.jsonl was NOT touched, as intended.")


if __name__ == "__main__":
    main()