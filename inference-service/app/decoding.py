"""Turns per-token BIO predictions back into entity spans of the original text.

Kept free of torch and the model so it can be unit-tested on its own (see tests/test_decoding.py).
"""

# Characters that join a word: letters and digits, plus the joiners in registrations and part
# names such as "5Y-KZD", "E/E" or "crew's". A span never starts or ends inside such a run.
WORD_JOINERS = "-/'’"
# Trimmed from both ends of an entity's text.
EDGE_PUNCTUATION = " \t\n.,;:!?()[]{}\"“”"


def _is_word_char(ch):
    return ch.isalnum() or ch in WORD_JOINERS


def snap_to_words(text, start, end):
    """Widens [start, end) to whole words and trims surrounding spaces and punctuation."""
    while start > 0 and _is_word_char(text[start - 1]) and _is_word_char(text[start]):
        start -= 1
    while end < len(text) and _is_word_char(text[end]) and end > 0 and _is_word_char(text[end - 1]):
        end += 1
    while start < end and text[start] in EDGE_PUNCTUATION + WORD_JOINERS:
        start += 1
    while end > start and text[end - 1] in EDGE_PUNCTUATION + WORD_JOINERS:
        end -= 1
    return start, end


def decode_entities(text, bio_tags, offsets, word_ids, token_confidence):
    """
    text              the original text
    bio_tags          one tag per token, e.g. "B-COMPONENT", "I-COMPONENT", "O"
    offsets           (start, end) character offsets per token; (0, 0) for special tokens
    word_ids          the tokenizer's word index per token (None for special tokens)
    token_confidence  function (token_index, tag) -> probability of that tag

    Returns [{type, text, start, end, confidence}], confidence = mean token probability.

    Decoding rules:
      * Word-aware: sub-word pieces ("##k" in "lea", "##k") take their word's first-piece tag,
        so an entity never starts or ends mid-word.
      * An "I-X" that doesn't continue an open X entity is dropped. (Starting a new entity there,
        as seqeval does, lowered exact-match precision from 0.66 to 0.62 on the test set.)
      * Spans are then widened to whole words (snap_to_words) as a safety net, and overlapping
        spans of the same type that this produces are merged.
    """
    spans = []
    current = None
    head_tag = "O"

    for i, tag in enumerate(bio_tags):
        start, end = offsets[i]
        if start == end:  # [CLS], [SEP], padding
            continue

        if i > 0 and word_ids[i] is not None and word_ids[i] == word_ids[i - 1]:
            tag = "O" if head_tag == "O" else "I-" + head_tag[2:]
        else:
            head_tag = tag

        if tag == "O":
            if current:
                spans.append(current)
            current = None
            continue

        kind, label = tag[:1], tag[2:]
        if kind == "I" and current and current["type"] == label:
            current["end"] = end
            current["confidences"].append(token_confidence(i, tag))
            continue
        if current:
            spans.append(current)
        current = None
        if kind == "B":
            current = {"type": label, "start": start, "end": end, "confidences": [token_confidence(i, tag)]}

    if current:
        spans.append(current)

    entities = []
    for span in spans:
        start, end = snap_to_words(text, span["start"], span["end"])
        if start >= end:
            continue
        previous = entities[-1] if entities else None
        if previous and previous["type"] == span["type"] and start <= previous["end"]:
            previous["end"] = max(previous["end"], end)
            previous["confidences"].extend(span["confidences"])
            continue
        entities.append({"type": span["type"], "start": start, "end": end, "confidences": span["confidences"]})

    return [
        {
            "type": e["type"],
            "text": text[e["start"] : e["end"]],
            "start": e["start"],
            "end": e["end"],
            "confidence": round(sum(e["confidences"]) / len(e["confidences"]), 4),
        }
        for e in entities
    ]
