"""Scoring functions for scripts/evaluate.py: entity matching, entity error analysis, category
scores and ROUGE. Plain Python with no model or ML libraries, so they're unit-tested in
tests/test_metrics.py (and run on CI)."""
import re
from collections import Counter

# Small words that shouldn't make two entities "overlap" ("the pump" vs "the stand").
_STOPWORDS = {
    "the", "a", "an", "of", "on", "in", "at", "to", "for", "and", "or", "by", "with", "from",
    "ya", "na", "kwa", "wa", "za", "la", "cha", "vya", "katika", "kwenye", "kutoka", "ni",
}


def norm(text):
    """Text as compared for an exact match: lower case, single spaces, outer punctuation removed."""
    return re.sub(r"\s+", " ", text.strip(" \t\n.,;:!?()[]\"'").lower())


def words(text):
    return set(re.findall(r"[\w'’/-]+", text.lower()))


def content_words(text):
    return {w for w in words(text) if w not in _STOPWORDS}


def prf(tp, fp, fn):
    """(precision, recall, F1), each rounded to 4 places."""
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return round(p, 4), round(r, 4), round(f, 4)


def exact_match(g, p):
    return g["type"] == p["type"] and norm(g["text"]) == norm(p["text"])


def partial_match(g, p):
    return g["type"] == p["type"] and bool(words(g["text"]) & words(p["text"]))


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


def entity_counts(gold, pred, same):
    """{type: [tp, fp, fn]} for one handover, matching within each entity type."""
    out = {}
    for etype in {e["type"] for e in gold} | {e["type"] for e in pred}:
        g = [e for e in gold if e["type"] == etype]
        p = [e for e in pred if e["type"] == etype]
        out[etype] = list(match_counts(g, p, same))
    return out


# --- Error analysis -------------------------------------------------------------------------

ERROR_KINDS = ("correct", "boundary", "type", "missed", "spurious")
ERROR_LABELS = {
    "correct": "Correct (exact type and text)",
    "boundary": "Boundary error (right type, span too long, too short or shifted)",
    "type": "Type error (right words, wrong entity type)",
    "missed": "Missed (gold entity with nothing predicted near it)",
    "spurious": "Spurious (predicted entity with no gold entity near it)",
}


def _boundary_detail(gold_text, pred_text):
    g, p = norm(gold_text), norm(pred_text)
    if g in p:
        return "too long"
    if p in g:
        return "too short"
    return "shifted"


def classify_entities(gold, pred):
    """
    Pairs predicted with gold entities and labels every one of them:
      correct   exact type and text
      boundary  same type, overlapping words, different extent (detail: too long/too short/shifted)
      type      overlapping words, different type
      missed    a gold entity left unpaired
      spurious  a predicted entity left unpaired
    Exact matches pair first; then each remaining prediction pairs with the remaining gold entity it
    shares the most content words with (same type preferred). Returns a list of
    {kind, gold, pred, detail}.
    """
    gold_left = list(gold)
    pred_left = []
    out = []
    for p in pred:
        hit = next((g for g in gold_left if exact_match(g, p)), None)
        if hit is not None:
            gold_left.remove(hit)
            out.append({"kind": "correct", "gold": hit, "pred": p, "detail": None})
        else:
            pred_left.append(p)

    for p in pred_left:
        pw = content_words(p["text"])
        best, best_score = None, 0
        for g in gold_left:
            overlap = len(pw & content_words(g["text"]))
            score = overlap * 2 + (1 if overlap and g["type"] == p["type"] else 0)
            if score > best_score:
                best, best_score = g, score
        if best is None:
            out.append({"kind": "spurious", "gold": None, "pred": p, "detail": None})
            continue
        gold_left.remove(best)
        if best["type"] == p["type"]:
            out.append({"kind": "boundary", "gold": best, "pred": p, "detail": _boundary_detail(best["text"], p["text"])})
        else:
            out.append({"kind": "type", "gold": best, "pred": p, "detail": f"{best['type']} → {p['type']}"})

    out.extend({"kind": "missed", "gold": g, "pred": None, "detail": None} for g in gold_left)
    return out


# --- Category -------------------------------------------------------------------------------

def category_scores(pairs):
    """pairs: [(gold, predicted)]. Returns {accuracy, macro_f1, per_label, confusion}."""
    if not pairs:
        return {"accuracy": 0.0, "macro_f1": 0.0, "per_label": {}, "confusion": []}
    labels = sorted({g for g, _ in pairs} | {p for _, p in pairs})
    per_label = {}
    for label in labels:
        tp = sum(g == label and p == label for g, p in pairs)
        fp = sum(g != label and p == label for g, p in pairs)
        fn = sum(g == label and p != label for g, p in pairs)
        per_label[label] = prf(tp, fp, fn)
    # Macro F1 over the classes that actually occur in the gold labels of this set.
    present = sorted({g for g, _ in pairs})
    macro = sum(per_label[label][2] for label in present) / len(present)
    return {
        "accuracy": round(sum(g == p for g, p in pairs) / len(pairs), 4),
        "macro_f1": round(macro, 4),
        "per_label": per_label,
        "confusion": Counter(f"{g} → {p}" for g, p in pairs if g != p).most_common(),
    }


# --- ROUGE (summaries) ------------------------------------------------------------------------

def _tokens(text):
    return re.findall(r"\w+", text.lower())


def _ngrams(tokens, n):
    return Counter(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


def rouge_n(candidate, reference, n):
    """ROUGE-N F1 (word n-gram overlap, lower case, punctuation ignored)."""
    c, r = _ngrams(_tokens(candidate), n), _ngrams(_tokens(reference), n)
    overlap = sum((c & r).values())
    if not overlap:
        return 0.0
    precision, recall = overlap / sum(c.values()), overlap / sum(r.values())
    return 2 * precision * recall / (precision + recall)


def rouge_l(candidate, reference):
    """ROUGE-L F1 (longest common word subsequence)."""
    c, r = _tokens(candidate), _tokens(reference)
    if not c or not r:
        return 0.0
    prev = [0] * (len(r) + 1)
    for cw in c:
        row = [0]
        for j, rw in enumerate(r, 1):
            row.append(prev[j - 1] + 1 if cw == rw else max(prev[j], row[j - 1]))
        prev = row
    lcs = prev[-1]
    if not lcs:
        return 0.0
    precision, recall = lcs / len(c), lcs / len(r)
    return 2 * precision * recall / (precision + recall)


def rouge(candidate, reference):
    return {
        "rouge1": rouge_n(candidate, reference, 1),
        "rouge2": rouge_n(candidate, reference, 2),
        "rougeL": rouge_l(candidate, reference),
    }


def mean(values):
    values = list(values)
    return round(sum(values) / len(values), 4) if values else 0.0
