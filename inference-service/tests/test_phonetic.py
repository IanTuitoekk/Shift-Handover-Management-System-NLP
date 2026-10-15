import pytest

from app.phonetic import normalise_registrations


@pytest.mark.parametrize(
    "spoken,written",
    [
        ("Hydraulic pump leak detected on 5 Yankee KiloZulu Delta at stand 7.", "Hydraulic pump leak detected on 5Y-KZD at stand 7."),
        ("on five Yankee Kilo Zulu Delta", "on 5Y-KZD"),
        ("Five-Yankee, Kilo, Quebec, Alpha needs a tyre", "5Y-KQA needs a tyre"),
        ("ndege tano Yankee Foxtrot Lima X-ray imeharibika", "ndege 5Y-FLX imeharibika"),
        ("callsign November Alpha Bravo Charlie", "callsign NABC"),
        # As Whisper actually wrote them in testing (Swahili mode, mixed speech):
        ("kwenye dege tanu yanki KZD inavuja", "kwenye dege 5Y-KZD inavuja"),
        ("kunye 5 Yankee kilo kwebek alpha imeisha", "kunye 5Y-KQA imeisha"),
        ("leak detected on 5 Y-KZD at stand 7", "leak detected on 5Y-KZD at stand 7"),
        ("on 5Y KZD.", "on 5Y-KZD."),
        ("detected on 5 Yankee Kilozulu Delta at stand 7", "detected on 5Y-KZD at stand 7"),
    ],
)
def test_spoken_registrations_are_written(spoken, written):
    assert normalise_registrations(spoken) == written


@pytest.mark.parametrize(
    "text",
    [
        "Delta Air Lines flight parked at Echo stand",  # single phonetic words stay
        "Gate Alpha Bravo",  # two letters isn't a registration
        "The Indian engineer checked the hotel booking",
        "Replacement ordered from the parts store.",
    ],
)
def test_ordinary_text_is_unchanged(text):
    assert normalise_registrations(text) == text
