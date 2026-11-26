import re

from app.transcribe import PROMPTS


def test_prompts_hold_no_registrations_or_numbers():
    """Whisper can copy prompt text into transcripts; a registration there once replaced the real one."""
    for language, prompt in PROMPTS.items():
        assert not re.search(r"\d", prompt), f"{language} prompt contains a number or registration"
        assert not re.search(r"\b[A-Z0-9]{1,2}-[A-Z]{3}\b", prompt), f"{language} prompt contains a registration"


def test_prompts_are_plain_sentences_not_lists():
    """A comma-separated word list made Whisper put a comma after every word."""
    for language, prompt in PROMPTS.items():
        assert prompt.count(",") <= 1, f"{language} prompt looks like a list"


def test_default_threads_use_every_core_on_small_servers():
    from app.transcribe import _default_threads

    assert _default_threads(1) == 1
    assert _default_threads(2) == 2  # e.g. the 2-vCPU Azure VM
    assert _default_threads(4) == 4
    assert _default_threads(15) == 10  # Apple M5 Pro: 10 was fastest
    assert _default_threads(None) == 4


def test_swahili_only_when_it_clearly_wins():
    from app.transcribe import choose_language

    # Kenyan-accented English often scores partly Swahili: still decoded as English.
    assert choose_language([[("<|en|>", 0.5), ("<|sw|>", 0.4), ("<|yo|>", 0.05)]])[0] == "en"
    assert choose_language([[("<|sw|>", 0.9), ("<|en|>", 0.05)]])[:2] == ("sw", 0.947)
    # Other languages never count, however high they score.
    assert choose_language([[("<|lg|>", 0.7), ("<|sw|>", 0.25), ("<|en|>", 0.05)]])[0] == "sw"
    # Averaged over chunks: one Swahili-sounding chunk in an English handover isn't enough.
    assert choose_language([[("<|sw|>", 0.9), ("<|en|>", 0.1)], [("<|en|>", 0.9), ("<|sw|>", 0.1)]])[0] == "en"
    assert choose_language([]) == ("en", 1.0, 0.0)
