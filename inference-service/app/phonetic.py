"""Turns spoken aircraft registrations back into their written form.

Crews read registrations with the ICAO phonetic alphabet ("five Yankee Kilo Zulu Delta"); speech
recognition writes that out word by word, and in Swahili mode often with Swahili spelling
("tanu yanki KZD", "kwebek"). The entity model was trained on written registrations ("5Y-KZD"),
so transcripts are normalised before anyone sees them.
"""
import re

_LETTERS = {
    "A": "alpha alfa alfaa",
    "B": "bravo bravu",
    "C": "charlie charli chali",
    "D": "delta delta",
    "E": "echo eko",
    "F": "foxtrot foxtrott fokstrot",
    "G": "golf gofu",
    "H": "hotel hoteli",
    "I": "india indiya",
    "J": "juliet juliett juliet",
    "K": "kilo kilu",
    "L": "lima",
    "M": "mike maik",
    "N": "november novemba",
    "O": "oscar oska oskar",
    "P": "papa",
    "Q": "quebec kebek kwebek kebeck kebec",
    "R": "romeo romio",
    "S": "sierra siera",
    "T": "tango tangu",
    "U": "uniform yunifom",
    "V": "victor vikta",
    "W": "whiskey whisky wiski",
    "X": "x-ray xray eksrei",
    "Y": "yankee yanki yanky yenki",
    "Z": "zulu zuru",
}
NATO = {word: letter for letter, words in _LETTERS.items() for word in words.split()}
DIGITS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "niner": "9",
    "tano": "5", "tanu": "5",  # five in Swahili, and how Whisper often spells it
}

# Words and punctuation, with positions, so a run can be replaced in place.
_TOKEN = re.compile(r"(?i:x-ray)|[A-Za-z0-9]+|[^\sA-Za-z0-9]")
_SEPARATORS = {",", ".", "-"}


def _split_glued(word):
    """Phonetic words written together ("kilozulu", "KiloZulu") -> ["kilo", "zulu"], else None."""
    if len(word) < 6:
        return None
    best = {0: []}
    for end in range(1, len(word) + 1):
        for start in range(max(0, end - 9), end):
            if start in best and word[start:end] in NATO:
                best[end] = best[start] + [word[start:end]]
                break
    parts = best.get(len(word))
    return parts if parts and len(parts) > 1 else None


def _letters_of(word):
    """Letters a word stands for in a registration: a phonetic word, glued phonetic words
    ("KiloZulu"), or letters already written in capitals ("KZD"). None if it's an ordinary word."""
    lower = word.lower()
    if lower in NATO:
        return NATO[lower], 1
    parts = _split_glued(lower)
    if parts:
        return "".join(NATO[p] for p in parts), len(parts)
    if re.fullmatch(r"[A-Z]{1,3}", word):
        return word, 0  # capitals count as letters but not as spoken phonetic words
    return None


def _written(chars):
    # Kenyan registrations: nationality mark 5Y, a hyphen, then three letters.
    if re.fullmatch(r"5Y[A-Z]{3}", chars):
        return f"5Y-{chars[2:]}"
    return chars


def normalise_registrations(text):
    """'on five Yankee Kilo Zulu Delta at stand 7' -> 'on 5Y-KZD at stand 7'.

    Rewrites a run of phonetic words (optionally after a spoken or written digit) when it holds at
    least three phonetic words, or when it spells a Kenyan registration (5Y + three letters).
    Ordinary words such as "Delta" or "Echo" on their own are left alone.
    """
    tokens = [(m.group(0), m.start(), m.end()) for m in _TOKEN.finditer(text)]
    out, last, i = [], 0, 0
    while i < len(tokens):
        word, start, _ = tokens[i]
        j, chars, spoken = i, "", 0
        digit = DIGITS.get(word.lower(), word if word.isdigit() and len(word) == 1 else None)
        if word.upper() == "5Y":  # nationality mark already written ("5Y KZD")
            digit = "5Y"
        if digit:
            chars, j = digit, i + 1
        end = None
        while j < len(tokens):
            w = tokens[j][0]
            if w in _SEPARATORS and chars:
                j += 1
                continue
            found = _letters_of(w)
            if not found:
                break
            letters, count = found
            chars += letters
            spoken += count
            end = tokens[j][2]
            j += 1
        written = _written(chars) if end else None
        if end and (spoken >= 3 or (written and written.startswith("5Y-"))):
            out.append(text[last:start])
            out.append(written)
            last = end
            i = j
        else:
            i += 1
    out.append(text[last:])
    return "".join(out)
