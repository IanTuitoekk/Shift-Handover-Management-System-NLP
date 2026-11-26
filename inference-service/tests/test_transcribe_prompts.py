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


def _fake_cloudflare(*replies):
    """A stand-in for cloudflare_post that returns `replies` in turn and records the requests."""
    sent = []

    def post(payload):
        sent.append(payload)
        return replies[len(sent) - 1]

    return post, sent


def test_cloudflare_keeps_english_and_clear_swahili_in_one_call():
    from app.transcribe import cloudflare_transcribe

    post, sent = _fake_cloudflare({"text": " Pump leak at stand 7. ", "transcription_info": {"language": "en", "language_probability": 0.97}})
    assert cloudflare_transcribe("QUJD", post=post) == ("Pump leak at stand 7.", "en", 0.97)
    assert len(sent) == 1 and "language" not in sent[0] and sent[0]["audio"] == "QUJD"

    post, sent = _fake_cloudflare({"text": "Pampu inavuja.", "transcription_info": {"language": "sw", "language_probability": 0.9}})
    assert cloudflare_transcribe("QUJD", post=post) == ("Pampu inavuja.", "sw", 0.9)
    assert len(sent) == 1


def test_cloudflare_decodes_narrow_swahili_or_other_languages_again_as_english():
    from app.transcribe import PROMPTS, cloudflare_transcribe

    for detected in ({"language": "sw", "language_probability": 0.6}, {"language": "yo", "language_probability": 0.5}):
        post, sent = _fake_cloudflare({"text": "x", "transcription_info": detected}, {"text": "Brake wear on 5Y-KQA."})
        text, language, _ = cloudflare_transcribe("QUJD", post=post)
        assert (text, language) == ("Brake wear on 5Y-KQA.", "en")
        assert sent[1]["language"] == "en" and sent[1]["initial_prompt"] == PROMPTS["en"]


def test_cloudflare_uses_a_given_language_directly():
    from app.transcribe import PROMPTS, cloudflare_transcribe

    post, sent = _fake_cloudflare({"text": "Pampu inavuja."})
    assert cloudflare_transcribe("QUJD", "sw", post=post) == ("Pampu inavuja.", "sw", 1.0)
    assert sent[0]["language"] == "sw" and sent[0]["initial_prompt"] == PROMPTS["sw"]


def test_cloudflare_errors_are_raised_so_the_local_whisper_takes_over(monkeypatch):
    import pytest

    from app.transcribe import CloudflareError, cloudflare_post, cloudflare_transcribe

    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    with pytest.raises(CloudflareError, match="not set"):
        cloudflare_post({"audio": "QUJD"})
    with pytest.raises(CloudflareError, match="no text"):
        cloudflare_transcribe("QUJD", "en", post=lambda payload: {"errors": ["bad audio"]})
