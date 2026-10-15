"""Speech to text for spoken handovers, with faster-whisper (an open-source Whisper) on this server.

Audio never leaves the server. Settings (environment):
  WHISPER_MODEL         model size, default "small" (good English and usable Swahili on CPU;
                        "base" is faster but weaker, "medium" better but ~3x slower)
  WHISPER_COMPUTE_TYPE  default "int8" (fast on CPU)
  WHISPER_DEBUG_DIR     unset by default. When set (development only), recordings that can't be
                        read are saved there so the cause can be investigated; nothing else is kept.
The model downloads once (~460 MB for "small") into the Hugging Face cache.
"""
import io
import os
import threading
import time

from app.phonetic import normalise_registrations

LANGUAGES = ("en", "sw")  # the languages handovers are written in
MAX_SECONDS = 180
# Whisper detects language from the sound. Kenyan-accented English often scores as partly Swahili,
# so audio is decoded as Swahili only when Swahili clearly wins; otherwise as English (Whisper
# still writes the Swahili words it hears). Tune with WHISPER_SW_SHARE using the logged detections.
SWAHILI_SHARE = float(os.environ.get("WHISPER_SW_SHARE", "0.75"))

# A short example in the same language steers Whisper's spelling of aviation and handover terms.
PROMPTS = {
    "en": (
        "Kenya Airways ground crew shift handover. Aircraft 5Y-KZD, B737, B787, E190. "
        "Hydraulic pump, left main gear, APU, stand 7, parts store, engineer, task card."
    ),
    "sw": (
        "Makabidhiano ya zamu ya Kenya Airways. Pampu ya majimaji kwenye ndege 5Y-KZD inavuja, "
        "iko stand namba saba. Fundi ameagiza kipuri kutoka stoo; atabadilisha kabla ya saa kumi "
        "na mbili asubuhi. Gurudumu, breki, mhandisi, left main gear, replacement."
    ),
}


class AudioError(ValueError):
    """The upload isn't usable audio (unreadable, empty or too long)."""


class Transcriber:
    def __init__(self):
        self.model_name = os.environ.get("WHISPER_MODEL", "small")
        self.compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                print(f"Loading Whisper ({self.model_name}, {self.compute_type})...")
                self._model = WhisperModel(self.model_name, device="cpu", compute_type=self.compute_type)
        return self._model

    def warm_up(self):
        """Loads the model in the background so the first request isn't slow."""
        def load():
            try:
                self._load()
            except Exception as err:  # e.g. the server stopped mid-load; the first request retries
                print(f"Whisper not loaded yet ({err.__class__.__name__}); it will load on first use.")

        threading.Thread(target=load, daemon=True).start()

    def transcribe(self, data: bytes, language: str | None = None):
        """Returns { text, language, language_probability, duration }.

        `language` is "en", "sw" or None (detect: Swahili only if it clearly beats English, see
        SWAHILI_SHARE; other languages are never chosen). The returned `language` is the one the
        audio was decoded as; the backend labels the transcript itself from its words.
        """
        from faster_whisper.audio import decode_audio

        try:
            audio = decode_audio(io.BytesIO(data), sampling_rate=16000)
        except Exception as err:  # PyAV raises many types for bad input
            header = data[:12].hex(" ")
            print(f"[transcribe] couldn't read {len(data)} bytes (starts {header}): {err.__class__.__name__}: {err}")
            debug_dir = os.environ.get("WHISPER_DEBUG_DIR")
            if debug_dir:
                os.makedirs(debug_dir, exist_ok=True)
                path = os.path.join(debug_dir, f"unreadable-{int(time.time())}.bin")
                with open(path, "wb") as f:
                    f.write(data)
                print(f"[transcribe] saved it to {path}")
            raise AudioError("The recording couldn't be read. Try recording again.") from err
        duration = len(audio) / 16000
        if duration < 0.3:
            raise AudioError("The recording is empty. Hold the phone closer and try again.")
        if duration > MAX_SECONDS:
            raise AudioError(f"Recordings can be up to {MAX_SECONDS // 60} minutes.")

        model = self._load()
        probability = 1.0
        if language not in LANGUAGES:
            _, _, all_probs = model.detect_language(audio)
            scores = {code: p for code, p in all_probs if code in LANGUAGES}
            total = sum(scores.values())
            sw_share = scores.get("sw", 0) / total if total else 0.0
            language = "sw" if sw_share >= SWAHILI_SHARE else "en"
            probability = sw_share if language == "sw" else 1 - sw_share
            top = ", ".join(f"{c} {p:.2f}" for c, p in all_probs[:3])
            print(f"[transcribe] {duration:.1f}s audio; detected {top}; Swahili share {sw_share:.2f} -> decode as {language}")

        segments, _info = model.transcribe(
            audio, language=language, beam_size=5, vad_filter=True, initial_prompt=PROMPTS[language], condition_on_previous_text=False
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {
            "text": normalise_registrations(text),
            "language": language,
            "language_probability": round(float(probability), 3),
            "duration": round(duration, 1),
        }
