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
