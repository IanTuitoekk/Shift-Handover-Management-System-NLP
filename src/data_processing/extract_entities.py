"""
extract_entities.py

Tier 3 fix for entity-span matching: re-extracts entities via a dedicated
pass that operates directly on the already-generated narrative_text,
instead of relying on entities produced simultaneously with the narrative
during the original generation call.

Why this helps: asking a model to write text AND list exact substrings of
that text at the same time is a harder task than asking it to extract
substrings from text that's already sitting in front of it. This should
recover most of the remaining ~2.7% match-rate gap left after the
case-insensitive / ellipsis-truncation fixes in process_corpus.py.

This is applied to the WHOLE corpus (all 978 records, all splits,
including test) -- improving ground-truth label accuracy is different
from preprocessing input text, and test-set labels should be as accurate
as possible since that's what you evaluate against.

Run this BEFORE re-running split_corpus.py and process_corpus.py, so the
improved entities propagate through the whole downstream pipeline. This
script does NOT overwrite your real corpus directly -- it writes to a
review file first, so you can check the results before replacing anything.

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY="your-key-here"

Usage:
    python extract_entities.py --pilot 10
    python extract_entities.py
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:
    sys.exit("Missing dependency. Run: pip install anthropic")

MODEL = "claude-sonnet-5"
MAX_RETRIES = 3
SLEEP_BETWEEN_CALLS = 0.3

PROJECT_ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = PROJECT_ROOT / "data/processed/synthetic_corpus.jsonl"
REVIEW_PATH = PROJECT_ROOT / "data/processed/synthetic_corpus_v2_review.jsonl"
LOG_PATH = PROJECT_ROOT / "data/processed/entity_extraction_log.jsonl"

ENTITY_TYPES = ["AIRCRAFT", "COMPONENT", "ROLE", "LOCATION", "TASK", "TIME"]


def build_extraction_prompt(narrative_text, language_variant):
    return f"""Extract named entities from the following {language_variant} aviation maintenance shift-handover note.

CRITICAL RULES:
1. Each entity's "text" value must be an EXACT, VERBATIM substring copied directly from the text below -- character for character, including exact capitalization and spacing.
2. Entities must be SHORT, SPECIFIC noun phrases -- NOT full clauses or sentences describing what happened. A legitimate compound technical name (e.g. "#1 engine inboard thrust reverser translating sleeve", "#2 main gear tire") can be several words long and should be kept WHOLE, not fragmented -- don't split a real compound component name into pieces. What's NOT allowed is a clause describing an action or event (e.g. "MEL 24-XX-X was applied by maintenance to release the aircraft" is WRONG; "MEL 24-XX-X" is correct).
3. Do not paraphrase, summarize, or reword any entity. Do not truncate a longer mention with "...".

Text:
{narrative_text}

Entity types to look for: {', '.join(ENTITY_TYPES)}
- AIRCRAFT: aircraft type/registration mentions (e.g. "B777-200", "Aircraft X")
- COMPONENT: specific parts, systems, equipment (e.g. "IDG", "fuel pump", "landing gear")
- ROLE: people/job roles mentioned (e.g. "flight crew", "maintenance manager")
- LOCATION: places, airports, stations (e.g. "base", "ZZZ1")
- TASK: a short reference to a specific task, work order, or MEL/ATA item -- NOT a description of what happened (e.g. "MEL 24-XX-X", "torque check", "logbook entry" are correct; "MEL 24-XX-X was applied by maintenance to release the aircraft" is WRONG -- too long, that's a clause not an entity)
- TIME: time references (shifts, dates, durations) (e.g. "next shift", "Day 0")

Output a JSON array of entities, each with "type" and "text" fields. Output ONLY the JSON array, nothing else. If no entities of a given type exist, simply don't include any for that type."""


def extract_json_array(text):
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    return json.loads(text)


def extract_entities_for_record(client, record, log_f):
    prompt = build_extraction_prompt(record["narrative_text"], record["language_variant"])
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=800,
                thinking={"type": "disabled"},
                messages=[{"role": "user", "content": prompt}],
            )
            text_blocks = [b.text for b in response.content if getattr(b, "type", None) == "text"]
            if not text_blocks:
                raise ValueError("No text block found in API response")
            raw_text = "".join(text_blocks)
            entities = extract_json_array(raw_text)

            # Self-verify: even a dedicated extraction pass can slip up
            # occasionally. Drop entities that aren't real verbatim
            # substrings, and drop anything that looks like a clause
            # rather than a noun phrase -- but don't just count words,
            # since legitimate long technical component names (e.g.
            # "#1 engine inboard thrust reverser translating sleeve") can
            # genuinely run 7-8 words. Instead, flag clause-like markers
            # (passive/auxiliary verb forms) alongside a looser length cap.
            MAX_ENTITY_WORDS = 9
            CLAUSE_MARKERS = [
                " was ", " were ", " is ", " are ", " been ", " being ",
                " has been", " have been", " will be", " to be ",
            ]
            verified, dropped = [], []
            for e in entities:
                text = e.get("text", "")
                words = text.split()
                too_long = len(words) > MAX_ENTITY_WORDS
                looks_like_clause = any(marker in f" {text} " for marker in CLAUSE_MARKERS)
                if text and e.get("type") and text in record["narrative_text"] and not too_long and not looks_like_clause:
                    verified.append(e)
                else:
                    reason = "too long" if too_long else ("looks like a clause" if looks_like_clause else "not verbatim in text")
                    e["_drop_reason"] = reason
                    dropped.append(e)

            log_f.write(json.dumps({
                "acn": record["source_asrs_acn"], "language": record["language_variant"],
                "attempt": attempt, "status": "ok",
                "verified_count": len(verified), "dropped_count": len(dropped), "dropped": dropped,
            }) + "\n")
            return verified
        except (json.JSONDecodeError, IndexError, KeyError, ValueError) as e:
            log_f.write(json.dumps({"acn": record["source_asrs_acn"], "language": record["language_variant"], "attempt": attempt, "status": "retry", "error": str(e)}) + "\n")
            time.sleep(1)
    log_f.write(json.dumps({"acn": record["source_asrs_acn"], "language": record["language_variant"], "status": "failed"}) + "\n")
    return None  # signal failure -- caller keeps original entities as fallback


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", type=int, default=None, help="Only process the first N records (for testing)")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Set your API key first: export ANTHROPIC_API_KEY='your-key-here'")

    client = anthropic.Anthropic(api_key=api_key)

    records = []
    with open(INPUT_PATH, encoding="utf-8") as f:
        for line in f:
            records.append(json.loads(line))

    if args.pilot:
        records = records[: args.pilot]

    total = len(records)
    updated_count = 0
    kept_original_count = 0

    with open(LOG_PATH, "w", encoding="utf-8") as log_f:
        for i, record in enumerate(records, start=1):
            new_entities = extract_entities_for_record(client, record, log_f)
            if new_entities is not None:
                record["entities_original"] = record["entities"]  # preserved for comparison
                record["entities"] = new_entities
                updated_count += 1
                print(f"[{i}/{total}] ACN {record['source_asrs_acn']} ({record['language_variant']}) - OK ({len(new_entities)} entities)")
            else:
                kept_original_count += 1
                print(f"[{i}/{total}] ACN {record['source_asrs_acn']} ({record['language_variant']}) - FAILED, kept original entities")
            time.sleep(SLEEP_BETWEEN_CALLS)

    with open(REVIEW_PATH, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nDone. {updated_count}/{total} records updated, {kept_original_count}/{total} kept original entities (extraction failed).")
    print(f"Written to REVIEW file (your real corpus is untouched so far): {REVIEW_PATH}")
    print("Review this file, then if satisfied, replace synthetic_corpus.jsonl with it.")


if __name__ == "__main__":
    main()