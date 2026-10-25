"""Unit tests for scripts/metrics.py (no model needed)."""
import pytest

from scripts.metrics import category_scores, classify_entities, entity_counts, exact_match, prf, rouge, rouge_l, rouge_n


def ent(type_, text):
    return {"type": type_, "text": text}


def kinds(result):
    return sorted((r["kind"], r["detail"]) for r in result)


def test_prf():
    assert prf(2, 1, 1) == (0.6667, 0.6667, 0.6667)
    assert prf(0, 0, 0) == (0.0, 0.0, 0.0)


def test_exact_match_ignores_case_and_outer_punctuation():
    assert exact_match(ent("AIRCRAFT", "5Y-KZD."), ent("AIRCRAFT", "5y-kzd"))
    assert not exact_match(ent("AIRCRAFT", "5Y-KZD"), ent("COMPONENT", "5Y-KZD"))


def test_entity_counts_per_type():
    gold = [ent("AIRCRAFT", "5Y-KZD"), ent("COMPONENT", "hydraulic pump")]
    pred = [ent("AIRCRAFT", "5Y-KZD"), ent("COMPONENT", "hydraulic pump leak")]
    assert entity_counts(gold, pred, exact_match) == {"AIRCRAFT": [1, 0, 0], "COMPONENT": [0, 1, 1]}


def test_classify_all_error_kinds():
    gold = [
        ent("AIRCRAFT", "5Y-KZD"),  # correct
        ent("COMPONENT", "hydraulic pump"),  # predicted too long
        ent("LOCATION", "stand 7"),  # predicted as TIME
        ent("ROLE", "lead technician"),  # missed
    ]
    pred = [
        ent("AIRCRAFT", "5Y-KZD"),
        ent("COMPONENT", "hydraulic pump leak"),
        ent("TIME", "stand 7"),
        ent("TASK", "coffee break"),  # spurious
    ]
    assert kinds(classify_entities(gold, pred)) == sorted(
        [
            ("correct", None),
            ("boundary", "too long"),
            ("type", "LOCATION → TIME"),
            ("missed", None),
            ("spurious", None),
        ]
    )


def test_boundary_too_short_and_stopwords_do_not_pair():
    result = classify_entities([ent("COMPONENT", "left main gear tyre")], [ent("COMPONENT", "main gear")])
    assert kinds(result) == [("boundary", "too short")]
    # Sharing only "the" is not an overlap.
    result = classify_entities([ent("LOCATION", "the hangar")], [ent("COMPONENT", "the pump")])
    assert kinds(result) == [("missed", None), ("spurious", None)]


def test_classify_prefers_same_type_when_overlap_ties():
    gold = [ent("TIME", "0600 shift"), ent("TASK", "0600 check")]
    result = classify_entities(gold, [ent("TASK", "0600")])
    assert ("boundary", "too short") in kinds(result)


def test_category_scores():
    pairs = [("A", "A"), ("A", "B"), ("B", "B"), ("B", "B")]
    s = category_scores(pairs)
    assert s["accuracy"] == 0.75
    assert s["per_label"]["A"] == (1.0, 0.5, 0.6667)
    assert s["macro_f1"] == round((0.6667 + 0.8) / 2, 4)
    assert s["confusion"] == [("A → B", 1)]
    # Macro F1 only averages classes present in the gold labels.
    assert category_scores([("A", "A"), ("A", "C")])["macro_f1"] == 0.6667


def test_rouge():
    assert rouge_n("the pump leaks", "the pump leaks", 1) == pytest.approx(1.0)
    assert rouge_n("pump leak", "valve open", 1) == 0.0
    assert rouge_n("the hydraulic pump", "the pump", 2) == pytest.approx(0.0)
    assert rouge_l("a b c d", "a c d") == pytest.approx(2 * (3 / 4) * 1 / ((3 / 4) + 1))
    assert set(rouge("x", "x")) == {"rouge1", "rouge2", "rougeL"}
