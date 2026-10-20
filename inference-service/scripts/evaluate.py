"""End-to-end evaluation of the served model on labelled handovers.

Runs the same InferenceModel.predict the API uses over a JSONL file (one handover per line with
"narrative_text", "incident_category" (or "incident_category_grouped", the grouping the model was
trained on, which wins when present) and "entities": [{type, text}]) and reports:

  * category accuracy and macro F1
  * entity precision / recall / F1 per type, matched two ways:
      exact    same type and same text (case-insensitive, surrounding punctuation ignored)
      partial  same type and the texts share at least one word
  * how many predicted entities start or end in the middle of a word (should be 0)

Usage (from inference-service/):
  venv/bin/python -m scripts.evaluate [path/to/test.jsonl] [--limit N] [--out results.json]
Default path: ../machine-learning/data/processed/test_processed.jsonl
Gold entities of a type the model doesn't predict (labelling mistakes) are skipped and counted.
"""
import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DATA = Path(__file__).resolve().parents[2] / "machine-learning" / "data" / "processed" / "test_processed.jsonl"


def norm(text):
    return re.sub(r"\s+", " ", text.strip(" \t\n.,;:!?()[]\"'").lower())


def words(text):
    return set(re.findall(r"[\w'’/-]+", text.lower()))


def mid_word(text, entity_text):
    """True if no occurrence of entity_text in text sits on word boundaries."""
    word_char = lambda c: c.isalnum()  # noqa: E731
    for m in re.finditer(re.escape(entity_text), text):
        before = text[m.start() - 1] if m.start() > 0 else " "
        after = text[m.end()] if m.end() < len(text) else " "
        if not (word_char(before) and word_char(entity_text[0])) and not (word_char(after) and word_char(entity_text[-1])):
            return False
    return True


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return round(p, 4), round(r, 4), round(f, 4)


def match_counts(gold, pred, same):
    """Greedy one-to-one matching of predicted to gold entities. Returns (tp, fp, fn)."""
    unmatched = list(gold)
    tp = 0
    for p in pred:
        for i, g in enumerate(unmatched):
            if same(g, p):
                tp += 1
                unmatched.pop(i)
                break
    return tp, len(pred) - tp, len(unmatched)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data", nargs="?", default=str(DEFAULT_DATA))
    parser.add_argument("--limit", type=int, default=None, help="evaluate only the first N handovers")
    parser.add_argument("--out", default=None, help="also write the results as JSON to this file")
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.data).read_text().splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    from app.model import InferenceModel  # loads mBERT (slow), so after argument checks

    model = InferenceModel()
    known_types = {t[2:] for t in model.bio_labels if t != "O"}
    skipped_gold = Counter()
    started = time.time()

    cat_pairs = []
    counts = {"exact": defaultdict(lambda: [0, 0, 0]), "partial": defaultdict(lambda: [0, 0, 0])}
    mid_word_spans = []
    exact = lambda g, p: g["type"] == p["type"] and norm(g["text"]) == norm(p["text"])  # noqa: E731
    partial = lambda g, p: g["type"] == p["type"] and bool(words(g["text"]) & words(p["text"]))  # noqa: E731

    for n, row in enumerate(rows, 1):
        text = row["narrative_text"]
        result = model.predict(text)
        cat_pairs.append((row.get("incident_category_grouped") or row["incident_category"], result["incident_category"]))
        pred = result["entities"]
        gold = [e for e in row.get("entities", []) if e["type"] in known_types]
        skipped_gold.update(e["type"] for e in row.get("entities", []) if e["type"] not in known_types)
        for entity in pred:
            if mid_word(text, entity["text"]):
                mid_word_spans.append({"text": entity["text"], "type": entity["type"], "handover": n})
        for kind, same in (("exact", exact), ("partial", partial)):
            for etype in {e["type"] for e in gold} | {e["type"] for e in pred}:
                g = [e for e in gold if e["type"] == etype]
                p = [e for e in pred if e["type"] == etype]
                tp, fp, fn = match_counts(g, p, same)
                c = counts[kind][etype]
                c[0], c[1], c[2] = c[0] + tp, c[1] + fp, c[2] + fn
        print(f"\r{n}/{len(rows)}", end="", file=sys.stderr)
    print(file=sys.stderr)

    # Category metrics
    labels = sorted({g for g, _ in cat_pairs} | {p for _, p in cat_pairs})
    accuracy = sum(g == p for g, p in cat_pairs) / len(cat_pairs)
    per_label = {}
    for label in labels:
        tp = sum(g == label and p == label for g, p in cat_pairs)
        fp = sum(g != label and p == label for g, p in cat_pairs)
        fn = sum(g == label and p != label for g, p in cat_pairs)
        per_label[label] = prf(tp, fp, fn)
    macro_f1 = sum(f for _, _, f in per_label.values()) / len(per_label)

    results = {
        "data": str(args.data),
        "handovers": len(rows),
        "seconds": round(time.time() - started, 1),
        "category": {"accuracy": round(accuracy, 4), "macro_f1": round(macro_f1, 4), "per_label": per_label,
                     "confusion": Counter(f"{g} -> {p}" for g, p in cat_pairs if g != p).most_common()},
        "entities": {},
        "mid_word_spans": mid_word_spans,
        "skipped_gold_entities": dict(skipped_gold),
    }
    for kind in ("exact", "partial"):
        table = {t: prf(*c) for t, c in sorted(counts[kind].items())}
        totals = [sum(c[i] for c in counts[kind].values()) for i in range(3)]
        results["entities"][kind] = {"micro": prf(*totals), "per_type": table}

    print(f"\n{len(rows)} handovers in {results['seconds']}s from {args.data}")
    print(f"Category  accuracy {accuracy:.3f}  macro F1 {macro_f1:.3f}")
    for label, (p, r, f) in per_label.items():
        print(f"  {label:<38} P {p:.2f}  R {r:.2f}  F1 {f:.2f}")
    for kind in ("exact", "partial"):
        p, r, f = results["entities"][kind]["micro"]
        print(f"Entities ({kind})  P {p:.3f}  R {r:.3f}  F1 {f:.3f}")
        for etype, (tp, tr, tf) in results["entities"][kind]["per_type"].items():
            print(f"  {etype:<10} P {tp:.2f}  R {tr:.2f}  F1 {tf:.2f}")
    if skipped_gold:
        print(f"Skipped gold entities with unknown types: {dict(skipped_gold)}")
    print(f"Entities starting or ending mid-word: {len(mid_word_spans)}")
    for span in mid_word_spans[:10]:
        print(f"  #{span['handover']} {span['type']}: {span['text']!r}")

    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2))
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
