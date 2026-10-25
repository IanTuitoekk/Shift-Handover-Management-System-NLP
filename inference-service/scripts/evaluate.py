"""Evaluation of the served model on labelled handovers, overall and per language.

Runs the same InferenceModel.predict the API uses over a JSONL file (one handover per line with
"narrative_text", "incident_category" (or "incident_category_grouped", the grouping the model was
trained on, which wins when present), "entities": [{type, text}], and optionally "summary" and
"language_variant") and reports, overall and for each language:

  * category accuracy and macro F1
  * entity precision / recall / F1 per type, matched two ways:
      exact    same type and same text (case-insensitive, surrounding punctuation ignored)
      partial  same type and the texts share at least one word
  * summary ROUGE-1/2/L against the reference summaries, for the model and for a "lead-2" baseline
    (the first two sentences)
  * an entity error analysis: each entity is correct, a boundary error, a type error, missed or
    spurious (see scripts/metrics.py), with examples
  * how many predicted entities start or end in the middle of a word (should be 0)

Usage (from inference-service/):
  venv/bin/python -m scripts.evaluate [path/to/test.jsonl] [--limit N]
      [--out evaluation/results.json] [--report evaluation/results.md]
Default data: ../machine-learning/data/processed/test_processed.jsonl
Gold entities of a type the model doesn't predict (labelling mistakes) are skipped and counted.
"""
import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from scripts.metrics import (
    ERROR_KINDS,
    ERROR_LABELS,
    category_scores,
    classify_entities,
    entity_counts,
    exact_match,
    mean,
    partial_match,
    prf,
    rouge,
)

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE.parents[1] / "machine-learning" / "data" / "processed" / "test_processed.jsonl"
DEFAULT_DIR = HERE.parent / "evaluation"
LANGUAGE_ORDER = ["English", "Swahili", "code-switched"]
EXAMPLES_PER_KIND = 6


def mid_word(text, entity_text):
    """True if no occurrence of entity_text in text sits on word boundaries."""
    word_char = lambda c: c.isalnum()  # noqa: E731
    for m in re.finditer(re.escape(entity_text), text):
        before = text[m.start() - 1] if m.start() > 0 else " "
        after = text[m.end()] if m.end() < len(text) else " "
        if not (word_char(before) and word_char(entity_text[0])) and not (word_char(after) and word_char(entity_text[-1])):
            return False
    return True


def predict_all(rows):
    """Runs the model once per handover; returns one record per row with everything scored later."""
    from app.model import InferenceModel  # loads mBERT (slow)

    model = InferenceModel()
    known = {t[2:] for t in model.bio_labels if t != "O"}
    records = []
    for n, row in enumerate(rows, 1):
        text = row["narrative_text"]
        result = model.predict(text)
        sentences = [s.strip() for s in model.segmenter.segment(text) if s.strip()]
        records.append(
            {
                "n": n,
                "language": row.get("language_variant") or "unknown",
                "text": text,
                "gold_category": row.get("incident_category_grouped") or row["incident_category"],
                "pred_category": result["incident_category"],
                "gold": [e for e in row.get("entities", []) if e["type"] in known],
                "skipped": [e["type"] for e in row.get("entities", []) if e["type"] not in known],
                "pred": result["entities"],
                "summary": result["summary"],
                "lead2": " ".join(sentences[:2]),
                "reference": row.get("summary") or "",
            }
        )
        print(f"\r{n}/{len(rows)}", end="", file=sys.stderr)
    print(file=sys.stderr)
    return records


def score(records):
    """All scores for a group of records."""
    out = {"handovers": len(records)}
    out["category"] = category_scores([(r["gold_category"], r["pred_category"]) for r in records])
    out["category"]["gold_counts"] = dict(Counter(r["gold_category"] for r in records))

    out["entities"] = {}
    for kind, same in (("exact", exact_match), ("partial", partial_match)):
        totals = defaultdict(lambda: [0, 0, 0])
        for r in records:
            for etype, (tp, fp, fn) in entity_counts(r["gold"], r["pred"], same).items():
                t = totals[etype]
                t[0], t[1], t[2] = t[0] + tp, t[1] + fp, t[2] + fn
        micro = [sum(t[i] for t in totals.values()) for i in range(3)]
        out["entities"][kind] = {"micro": prf(*micro), "per_type": {t: prf(*c) for t, c in sorted(totals.items())}}

    with_ref = [r for r in records if r["reference"]]
    out["summary"] = {
        system: {m: mean(rouge(r[system], r["reference"])[m] for r in with_ref) for m in ("rouge1", "rouge2", "rougeL")}
        for system in ("summary", "lead2")
    }
    out["summary"]["handovers"] = len(with_ref)

    errors = Counter()
    by_type = defaultdict(Counter)
    details = Counter()
    for r in records:
        for e in classify_entities(r["gold"], r["pred"]):
            errors[e["kind"]] += 1
            by_type[(e["gold"] or e["pred"])["type"]][e["kind"]] += 1
            if e["detail"]:
                details[f"{e['kind']}: {e['detail']}"] += 1
    out["errors"] = {
        "counts": {k: errors[k] for k in ERROR_KINDS},
        "by_type": {t: {k: c[k] for k in ERROR_KINDS} for t, c in sorted(by_type.items())},
        "details": details.most_common(),
    }
    return out


SHIFT_WORDS = re.compile(r"\b(shift|zamu)\b", re.IGNORECASE)


def shift_label_check(records):
    """How the gold data labels phrases about a shift ("next shift", "zamu ya usiku"): if the same
    kind of phrase is sometimes ROLE and sometimes TIME, the model can't be right on both."""
    counts = Counter()
    examples = defaultdict(list)
    for r in records:
        for e in r["gold"]:
            if SHIFT_WORDS.search(e["text"]):
                counts[e["type"]] += 1
                if len(examples[e["type"]]) < 4 and e["text"].lower() not in [x.lower() for x in examples[e["type"]]]:
                    examples[e["type"]].append(e["text"])
    return {"counts": dict(counts), "examples": dict(examples)}


def error_examples(records):
    examples = defaultdict(list)
    for r in records:
        for e in classify_entities(r["gold"], r["pred"]):
            if e["kind"] != "correct" and len(examples[e["kind"]]) < EXAMPLES_PER_KIND * 3:
                examples[e["kind"]].append({**e, "language": r["language"], "n": r["n"]})
    # Spread the examples across languages.
    picked = {}
    for kind, items in examples.items():
        by_lang = defaultdict(list)
        for item in items:
            by_lang[item["language"]].append(item)
        chosen = []
        while len(chosen) < EXAMPLES_PER_KIND and any(by_lang.values()):
            for lang in list(by_lang):
                if by_lang[lang] and len(chosen) < EXAMPLES_PER_KIND:
                    chosen.append(by_lang[lang].pop(0))
        picked[kind] = chosen
    return picked


# --- Report ---------------------------------------------------------------------------------

pct = lambda x: f"{x * 100:.1f}%"  # noqa: E731
num = lambda x: f"{x:.2f}"  # noqa: E731


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def markdown(results, examples, args):
    overall = results["overall"]
    langs = [lang for lang in LANGUAGE_ORDER if lang in results["by_language"]] + sorted(
        lang for lang in results["by_language"] if lang not in LANGUAGE_ORDER
    )
    groups = [("All", overall)] + [(lang, results["by_language"][lang]) for lang in langs]
    lines = [
        "# Model evaluation",
        "",
        f"Generated by `scripts/evaluate.py` on {results['date']} from `{Path(results['data']).name}` "
        f"({overall['handovers']} held-out handovers, never used in training). Model: "
        f"`model/best_model.pt` (mBERT, joint classification and NER), served exactly as the API runs it.",
        "",
        "## 1. Results by language",
        "",
        table(
            ["Language", "Handovers", "Category accuracy", "Category macro F1", "Entity F1 (exact)", "Entity F1 (partial)", "Summary ROUGE-L"],
            [
                [name, g["handovers"], pct(g["category"]["accuracy"]), num(g["category"]["macro_f1"]),
                 num(g["entities"]["exact"]["micro"][2]), num(g["entities"]["partial"]["micro"][2]), num(g["summary"]["summary"]["rougeL"])]
                for name, g in groups
            ],
        ),
        "",
        "Gold category counts: "
        + "; ".join(
            f"{name}: " + ", ".join(f"{c} {label}" for label, c in sorted(g["category"]["gold_counts"].items()))
            for name, g in groups
        )
        + ".",
        "",
        "**Read macro F1 per language with care:** a category with only one or two test examples in a "
        "language swings macro F1 by tens of points on a single handover. Accuracy is the steadier "
        "figure for per-language comparison."
        if any(min(g["category"]["gold_counts"].values()) <= 2 for _, g in groups[1:])
        else "",
        "",
        "## 2. Entities by type (F1, exact match)",
        "",
    ]
    types = sorted(overall["entities"]["exact"]["per_type"])
    lines.append(
        table(
            ["Entity type"] + [name for name, _ in groups],
            [[t] + [num(g["entities"]["exact"]["per_type"].get(t, (0, 0, 0))[2]) for _, g in groups] for t in types],
        )
    )
    p, r, f = overall["entities"]["exact"]["micro"]
    pp, pr, pf = overall["entities"]["partial"]["micro"]
    lines += [
        "",
        f"Overall exact match: precision {num(p)}, recall {num(r)}, F1 {num(f)}. "
        f"Partial match (same type, at least one shared word): precision {num(pp)}, recall {num(pr)}, F1 {num(pf)}.",
        "",
        "## 3. Summaries (ROUGE F1 against the reference summaries)",
        "",
        "The model's summary is extractive (the sentences closest to the whole note in mBERT embedding "
        "space). **Lead-2** is a simple baseline: the first two sentences of the note.",
        "",
        table(
            ["Language", "Model ROUGE-1", "Model ROUGE-2", "Model ROUGE-L", "Lead-2 ROUGE-1", "Lead-2 ROUGE-2", "Lead-2 ROUGE-L"],
            [
                [name] + [num(g["summary"]["summary"][m]) for m in ("rouge1", "rouge2", "rougeL")]
                + [num(g["summary"]["lead2"][m]) for m in ("rouge1", "rouge2", "rougeL")]
                for name, g in groups
            ],
        ),
        "",
        "## 4. Entity error analysis",
        "",
        "Every gold and predicted entity is classified (exact matches pair first; remaining predictions pair "
        "with the gold entity they share most content words with):",
        "",
    ]
    lines += [f"- **{k}**: {ERROR_LABELS[k]}" for k in ERROR_KINDS]
    lines += ["", "Share of all classified entities:", ""]
    lines.append(
        table(
            ["Outcome"] + [name for name, _ in groups],
            [
                [k] + [pct(g["errors"]["counts"][k] / max(1, sum(g["errors"]["counts"].values()))) for _, g in groups]
                for k in ERROR_KINDS
            ],
        )
    )
    lines += ["", "By entity type (all languages, counts):", ""]
    lines.append(
        table(
            ["Entity type"] + list(ERROR_KINDS),
            [[t] + [c[k] for k in ERROR_KINDS] for t, c in overall["errors"]["by_type"].items()],
        )
    )
    lines += ["", "Most common error details (all languages):", ""]
    lines.append(table(["Error", "Count"], [[d, c] for d, c in overall["errors"]["details"][:12]]))
    shift = results["shift_labels"]
    if len(shift["counts"]) > 1:
        lines += [
            "",
            "**Label consistency check.** Phrases about a shift (\"shift\", \"zamu\") carry different gold "
            "types in the data: "
            + "; ".join(
                f"{t} {c}× (e.g. " + ", ".join(f"“{x}”" for x in shift["examples"].get(t, [])) + ")"
                for t, c in sorted(shift["counts"].items(), key=lambda kv: -kv[1])
            )
            + ". Some \"errors\" between these types are therefore disagreements in the labels rather than "
            "model mistakes.",
        ]
    lines += ["", "### Examples", ""]
    for kind in ERROR_KINDS[1:]:
        items = examples.get(kind, [])
        if not items:
            continue
        lines += [f"**{kind.capitalize()}**", ""]
        rows = []
        for e in items:
            gold = f"{e['gold']['type']}: “{e['gold']['text']}”" if e["gold"] else "—"
            pred = f"{e['pred']['type']}: “{e['pred']['text']}”" if e["pred"] else "—"
            rows.append([f"#{e['n']}", e["language"], gold, pred, e["detail"] or ""])
        lines += [table(["Handover", "Language", "Gold", "Predicted", "Detail"], rows), ""]

    lines += ["## 5. Category confusion", ""]
    for name, g in groups:
        conf = g["category"]["confusion"]
        lines.append(f"- **{name}**: " + ("; ".join(f"{pair} ({c})" for pair, c in conf) if conf else "no errors"))
    per_label = overall["category"]["per_label"]
    lines += [
        "",
        table(["Category", "Precision", "Recall", "F1"], [[label, num(p), num(r), num(f)] for label, (p, r, f) in per_label.items()]),
        "",
        "## Notes",
        "",
        "- Macro F1 averages the categories present in each group's gold labels.",
        f"- Predicted entities starting or ending mid-word: {results['mid_word_spans']}.",
    ]
    if results["skipped_gold_entities"]:
        lines.append(f"- Gold entities skipped because their type isn't one the model predicts (labelling mistakes): {results['skipped_gold_entities']}.")
    lines.append(f"- Reproduce: `cd inference-service && venv/bin/python -m scripts.evaluate` ({results['seconds']} s on the machine that wrote this).")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data", nargs="?", default=str(DEFAULT_DATA))
    parser.add_argument("--limit", type=int, default=None, help="evaluate only the first N handovers")
    parser.add_argument("--out", default=str(DEFAULT_DIR / "results.json"), help="results as JSON")
    parser.add_argument("--report", default=str(DEFAULT_DIR / "results.md"), help="results as a Markdown report")
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.data).read_text().splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    started = time.time()
    records = predict_all(rows)
    by_language = defaultdict(list)
    for r in records:
        by_language[r["language"]].append(r)

    results = {
        "data": str(args.data),
        "date": date.today().isoformat(),
        "seconds": round(time.time() - started, 1),
        "overall": score(records),
        "by_language": {lang: score(rs) for lang, rs in by_language.items()},
        "mid_word_spans": sum(mid_word(r["text"], e["text"]) for r in records for e in r["pred"]),
        "skipped_gold_entities": dict(Counter(t for r in records for t in r["skipped"])),
        "shift_labels": shift_label_check(records),
    }

    o = results["overall"]
    print(f"{o['handovers']} handovers in {results['seconds']}s")
    print(f"{'':<15}{'cat acc':>8}{'macro F1':>9}{'ent F1':>8}{'partial':>8}{'ROUGE-L':>8}{'lead-2':>8}")
    for name, g in [("All", o)] + sorted(results["by_language"].items()):
        print(
            f"{name:<15}{g['category']['accuracy']:>8.3f}{g['category']['macro_f1']:>9.3f}"
            f"{g['entities']['exact']['micro'][2]:>8.3f}{g['entities']['partial']['micro'][2]:>8.3f}"
            f"{g['summary']['summary']['rougeL']:>8.3f}{g['summary']['lead2']['rougeL']:>8.3f}"
        )
    print("Errors:", o["errors"]["counts"])
    print(f"Mid-word spans: {results['mid_word_spans']}")

    for path, content in ((args.out, json.dumps(results, indent=2, ensure_ascii=False)), (args.report, markdown(results, error_examples(records), args))):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(content)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
