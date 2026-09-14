"""
generate_corpus.py

Step 6 of the data pipeline: turns real ASRS maintenance narratives into
synthetic shift-handover records in English, Swahili, and code-switched
variants, using the Anthropic API.

Cost optimization: generates all 3 language variants in ONE API call per
ASRS record (instead of 3 separate calls), since the narrative/coded-field
context would otherwise be paid for 3 times over. This cuts total cost by
roughly a third with no quality loss.

This script does NOT invent content from nothing — every generated record
is grounded in one real ASRS narrative (paraphrased/restyled into
handover-note form, per the methodology in Chapter 3), labeled against the
taxonomy in data/reference/incident_entity_taxonomy.md, and styled using
real Swahili sentence patterns (MasakhaNER) and real code-switching
examples (Liva AI transcripts + the reviewed hand-drafted set).

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY="your-key-here"

Usage:
    python generate_corpus.py --pilot 10        # test on 10 ASRS records first
    python generate_corpus.py                    # full run (326 records, 1 call each)
    python generate_corpus.py --model haiku       # use Haiku 4.5 instead of Sonnet 5 (cheaper)
"""

import argparse
import csv
import json
import os
import random
import re
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:
    sys.exit("Missing dependency. Run: pip install anthropic")

MODELS = {
    "sonnet": "claude-sonnet-5",
    "haiku": "claude-haiku-4-5-20251001",
}
MAX_RETRIES = 3
SLEEP_BETWEEN_CALLS = 0.3  # be polite to the API

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ASRS_PATH = PROJECT_ROOT / "data/raw/asrs_seed_corpus.csv"
SWAHILI_PATH = PROJECT_ROOT / "data/raw/masakhaner_swahili.csv"
LIVA_AI_PATH = PROJECT_ROOT / "data/codeswitching/liva_ai_en_sw_transcripts.csv"
DRAFTED_CS_PATH = PROJECT_ROOT / "data/codeswitching/codeswitch_reviewed_final.csv"
OUTPUT_PATH = PROJECT_ROOT / "data/processed/synthetic_corpus.jsonl"
LOG_PATH = PROJECT_ROOT / "data/processed/generation_log.jsonl"

INCIDENT_CATEGORIES = [
    "Aircraft Equipment Problem",
    "Deviation/Discrepancy - Procedural",
    "Ground Event/Encounter",
    "Ground Excursion",
    "Ground Incursion",
    "No Specific Anomaly Occurred",
]

ENTITY_TYPES = ["AIRCRAFT", "COMPONENT", "ROLE", "LOCATION", "TASK", "TIME"]

LANGUAGE_KEYS = ["English", "Swahili", "code-switched"]


def load_asrs_seeds(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if not r.get("review_flag", "").strip()]


def load_codeswitch_examples(liva_path, drafted_path):
    examples = []
    if liva_path.exists():
        with open(liva_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                snippet = row["transcript"][:400].replace("\n", " ")
                examples.append(snippet)
    if drafted_path.exists():
        with open(drafted_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                verdict = row.get("reviewer_verdict(approve/edit/reject)", "").strip().lower()
                if verdict == "reject":
                    continue
                corrected = row.get("reviewer_corrected_version", "").strip()
                examples.append(corrected if corrected else row["draft_code_switched"])
    return examples


def load_swahili_samples(path, n=30):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r["sentence"] for r in random.sample(rows, min(n, len(rows)))]


def build_combined_prompt(asrs_record, codeswitch_examples, swahili_samples):
    narrative = (asrs_record.get("Narrative") or "")[:1500]
    aircraft = asrs_record.get("Aircraft_fields", "")
    component = asrs_record.get("Component_fields", "")
    person = asrs_record.get("Person_fields", "")
    assessments = asrs_record.get("Assessments_fields", "")

    sw_lines = "\n".join(f"- {s}" for s in random.sample(swahili_samples, min(3, len(swahili_samples))))
    cs_lines = "\n".join(f"- {c}" for c in random.sample(codeswitch_examples, min(3, len(codeswitch_examples))))

    return f"""You are converting a REAL aviation maintenance incident report (from NASA's public ASRS database) into a SYNTHETIC shift-handover note, for an academic research project on multilingual handover communication at a Kenyan airline. This is dataset generation for research, not a real operational document.

Source incident (real ASRS narrative — use only for grounding/content, paraphrase and restructure into handover-note style, do not copy sentences verbatim):
{narrative}

Coded fields from the original report:
Aircraft: {aircraft}
Component: {component}
Person/Role: {person}
Assessment: {assessments}

Task: Write the SAME short shift-handover note (2-4 sentences, describing the issue and what needs follow-up) in THREE separate language variants:

1. "English": natural, professional aviation-maintenance English.
2. "Swahili": entirely in natural Swahili. Real Swahili sentences for style reference only (do not copy content, only tone/structure):
{sw_lines}
3. "code-switched": natural English-Swahili code-switching, the way bilingual Kenyan aviation maintenance staff actually speak/write informally (technical/aviation terms stay in English -- this matches real observed patterns). Real code-switching examples for style reference only (do not copy content, only tone/structure):
{cs_lines}

The three versions should express the same underlying incident content, just written naturally in each language variant (not literal translations of each other).

Output a single JSON object with exactly this structure:
{{
  "incident_category": "<exactly one of: {', '.join(INCIDENT_CATEGORIES)}>",
  "variants": {{
    "English": {{
      "narrative_text": "<handover note in English>",
      "summary": "<one-sentence summary>",
      "entities": [{{"type": "<one of: {', '.join(ENTITY_TYPES)}>", "text": "<entity text as it appears in narrative_text>"}}]
    }},
    "Swahili": {{
      "narrative_text": "<handover note in Swahili>",
      "summary": "<one-sentence summary, in Swahili>",
      "entities": [{{"type": "<entity type>", "text": "<entity text>"}}]
    }},
    "code-switched": {{
      "narrative_text": "<handover note, code-switched>",
      "summary": "<one-sentence summary, code-switched>",
      "entities": [{{"type": "<entity type>", "text": "<entity text>"}}]
    }}
  }}
}}

Output ONLY the JSON object. No markdown fences, no explanation, no preamble."""


def extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    return json.loads(text)


def generate_combined_record(client, model, asrs_record, codeswitch_examples, swahili_samples, log_f):
    prompt = build_combined_prompt(asrs_record, codeswitch_examples, swahili_samples)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=2500,  # headroom for 3 variants; unused tokens cost nothing
                thinking={"type": "disabled"},  # this task doesn't need step-by-step reasoning,
                                                  # and on Claude 5 models thinking defaults ON
                                                  # if omitted, which was silently eating into
                                                  # max_tokens and causing empty responses
                messages=[{"role": "user", "content": prompt}],
            )
            # Find the text block specifically -- don't assume content[0] is
            # text, since the API can return other block types (e.g. thinking
            # blocks) before or alongside it.
            text_blocks = [b.text for b in response.content if getattr(b, "type", None) == "text"]
            if not text_blocks:
                raise ValueError("No text block found in API response")
            raw_text = "".join(text_blocks)
            parsed = extract_json(raw_text)

            records = []
            incident_category = parsed.get("incident_category")
            for lang in LANGUAGE_KEYS:
                variant = parsed["variants"][lang]
                records.append({
                    "narrative_text": variant["narrative_text"],
                    "summary": variant["summary"],
                    "incident_category": incident_category,
                    "entities": variant.get("entities", []),
                    "language_variant": lang,
                    "source_asrs_acn": asrs_record.get("ACN", ""),
                })

            log_f.write(json.dumps({"acn": asrs_record.get("ACN"), "attempt": attempt, "status": "ok"}) + "\n")
            return records
        except (json.JSONDecodeError, IndexError, KeyError, ValueError) as e:
            log_f.write(json.dumps({"acn": asrs_record.get("ACN"), "attempt": attempt, "status": "retry", "error": str(e)}) + "\n")
            time.sleep(1)
    log_f.write(json.dumps({"acn": asrs_record.get("ACN"), "status": "failed"}) + "\n")
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", type=int, default=None, help="Only process the first N ASRS records (for testing)")
    parser.add_argument("--model", choices=["sonnet", "haiku"], default="sonnet", help="Which model tier to use (haiku is cheaper)")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Set your API key first: export ANTHROPIC_API_KEY='your-key-here'")

    client = anthropic.Anthropic(api_key=api_key)
    model = MODELS[args.model]

    asrs_seeds = load_asrs_seeds(ASRS_PATH)
    if args.pilot:
        asrs_seeds = asrs_seeds[: args.pilot]

    codeswitch_examples = load_codeswitch_examples(LIVA_AI_PATH, DRAFTED_CS_PATH)
    swahili_samples = load_swahili_samples(SWAHILI_PATH)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    total = len(asrs_seeds)
    ok_count = 0
    total_records_written = 0

    with open(OUTPUT_PATH, "w", encoding="utf-8") as out_f, open(LOG_PATH, "w", encoding="utf-8") as log_f:
        for i, seed in enumerate(asrs_seeds, start=1):
            records = generate_combined_record(client, model, seed, codeswitch_examples, swahili_samples, log_f)
            if records:
                for r in records:
                    out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
                ok_count += 1
                total_records_written += len(records)
                print(f"[{i}/{total}] ACN {seed.get('ACN')} - OK (3 variants written)")
            else:
                print(f"[{i}/{total}] ACN {seed.get('ACN')} - FAILED after {MAX_RETRIES} attempts")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"\nDone. {ok_count}/{total} ASRS records succeeded -> {total_records_written} synthetic records written.")
    print(f"Model used: {model}")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Log:    {LOG_PATH}")


if __name__ == "__main__":
    main()
