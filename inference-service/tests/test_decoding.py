"""Unit tests for app/decoding.py. Run: venv/bin/python -m pytest tests"""
import os

import pytest

from app.decoding import decode_entities, snap_to_words


def conf(_i, _tag):
    return 0.9


def tokens(text, pieces):
    """Builds offsets and word ids from (piece_text, word_index) pairs, located left to right."""
    offsets, word_ids, pos = [(0, 0)], [None], 0
    for piece, word in pieces:
        start = text.index(piece, pos)
        offsets.append((start, start + len(piece)))
        word_ids.append(word)
        pos = start + len(piece)
    offsets.append((0, 0))
    word_ids.append(None)
    return offsets, word_ids


def texts(entities):
    return [(e["type"], e["text"]) for e in entities]


TEXT = "Hydraulic pump leak on 5Y-KZD."
# Same split as bert-base-multilingual-cased: Hy ##dra ##uli ##c / pump / lea ##k / on / 5 ##Y / - / KZ ##D / .
PIECES = [("Hy", 0), ("dra", 0), ("uli", 0), ("c", 0), ("pump", 1), ("lea", 2), ("k", 2), ("on", 3),
          ("5", 4), ("Y", 4), ("-", 5), ("KZ", 6), ("D", 6), (".", 7)]


def decode(text, pieces, tags):
    offsets, word_ids = tokens(text, pieces)
    return decode_entities(text, ["O"] + tags + ["O"], offsets, word_ids, conf)


def test_subword_pieces_follow_their_word():
    # The model tags "##k" as O; the word "leak" must still be taken whole.
    tags = ["B-COMPONENT", "I-COMPONENT", "I-COMPONENT", "I-COMPONENT", "I-COMPONENT", "I-COMPONENT", "O",
            "O", "B-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "O"]
    assert texts(decode(TEXT, PIECES, tags)) == [("COMPONENT", "Hydraulic pump leak"), ("AIRCRAFT", "5Y-KZD")]


def test_entity_never_ends_mid_word_when_word_is_outside():
    tags = ["B-COMPONENT", "O", "O", "O", "I-COMPONENT", "O", "I-COMPONENT", "O"] + ["O"] * 6
    assert texts(decode(TEXT, PIECES, tags)) == [("COMPONENT", "Hydraulic pump")]


def test_inside_tag_without_an_open_entity_is_dropped():
    tags = ["O"] * 8 + ["I-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "I-AIRCRAFT", "O"]
    assert decode(TEXT, PIECES, tags) == []
    # ...and an I- of another type ends the open entity.
    tags = ["B-COMPONENT", "I-COMPONENT", "I-COMPONENT", "I-COMPONENT", "I-ROLE"] + ["O"] * 9
    assert texts(decode(TEXT, PIECES, tags)) == [("COMPONENT", "Hydraulic")]


def test_partly_tagged_registration_is_widened_to_the_whole_word():
    # Only "5Y" tagged; the safety net widens across the hyphen to "5Y-KZD".
    tags = ["O"] * 8 + ["B-AIRCRAFT", "I-AIRCRAFT", "O", "O", "O", "O"]
    assert texts(decode(TEXT, PIECES, tags)) == [("AIRCRAFT", "5Y-KZD")]


def test_type_change_splits_entities_and_confidence_is_the_mean():
    text = "engineer at stand 7"
    pieces = [("engineer", 0), ("at", 1), ("stand", 2), ("7", 3)]
    offsets, word_ids = tokens(text, pieces)
    probs = {1: 0.8, 3: 0.6, 4: 0.4}
    result = decode_entities(
        text, ["O", "B-ROLE", "O", "B-LOCATION", "I-LOCATION", "O"], offsets, word_ids, lambda i, _t: probs[i]
    )
    assert texts(result) == [("ROLE", "engineer"), ("LOCATION", "stand 7")]
    assert result[1]["confidence"] == 0.5
    assert (result[1]["start"], result[1]["end"]) == (12, 19)


@pytest.mark.parametrize(
    "text,start,end,expected",
    [
        ("Hydraulic pump leak", 15, 18, "leak"),  # "lea" -> "leak"
        ("on B737.", 3, 8, "B737"),  # trailing full stop trimmed
        ("(left main gear)", 0, 16, "left main gear"),
        ("crew's bottle", 0, 4, "crew's"),
        ("E/E compartment", 2, 15, "E/E compartment"),
    ],
)
def test_snap_to_words(text, start, end, expected):
    s, e = snap_to_words(text, start, end)
    assert text[s:e] == expected


def test_with_the_real_tokenizer():
    """The 'leak' case end to end with mBERT's tokenizer (skipped if it isn't downloaded)."""
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    try:
        from transformers import AutoTokenizer

        tok = AutoTokenizer.from_pretrained("google-bert/bert-base-multilingual-cased")
    except Exception as err:  # pragma: no cover
        pytest.skip(f"tokenizer not available: {err}")
    enc = tok(TEXT, return_offsets_mapping=True)
    word_ids = enc.word_ids()
    leak_word = word_ids[[t for t in tok.convert_ids_to_tokens(enc["input_ids"])].index("lea")]
    # Tag only the first piece of each word in "Hydraulic pump leak"; pieces must follow.
    tags, seen = [], set()
    for w in word_ids:
        if w is None or w > leak_word:
            tags.append("O")
        elif w in seen:
            tags.append("O")  # the model's (wrong) tag for continuation pieces
        else:
            tags.append("B-COMPONENT" if not seen else "I-COMPONENT")
            seen.add(w)
    result = decode_entities(TEXT, tags, enc["offset_mapping"], word_ids, conf)
    assert texts(result) == [("COMPONENT", "Hydraulic pump leak")]
