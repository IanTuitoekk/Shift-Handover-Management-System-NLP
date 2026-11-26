"""Speech to text for spoken handovers, with faster-whisper (an open-source Whisper) on this server.

Audio never leaves the server. Settings (environment):
  WHISPER_MODEL         default "large-v3-turbo": accurate English and Swahili. "small" is ~3x faster
                        but misspells Swahili noticeably (tested 15 Oct 2026); use it on weak machines.
  WHISPER_COMPUTE_TYPE  default "int8" (fast on CPU)
  WHISPER_CPU_THREADS   default: every core on small servers (4 cores or fewer, e.g. a 2-vCPU cloud VM),
                        else about 70% of them. On an Apple M5 Pro (5 performance + 10 efficiency cores)
                        10 threads was fastest; all 15 was slower (tested 26 Nov 2026).
  WHISPER_BATCH_SIZE    default 4. Speech is cut into chunks at pauses and the chunks are decoded
                        together, which on 45 s of speech took 12 s instead of 29 s (26 Nov 2026).
  WHISPER_SW_SHARE      default 0.75: decode as Swahili only when Swahili has this share of the
                        English+Swahili language score (Kenyan-accented English often scores partly Swahili).
  WHISPER_DEBUG_DIR     unset by default. When set (development only), recordings that can't be
                        read are saved there so the cause can be investigated; nothing else is kept.
The model downloads once into the Hugging Face cache (~1.6 GB for large-v3-turbo, ~460 MB for small).
Download it ahead of time with:
  venv/bin/python -c "from faster_whisper import download_model; download_model('large-v3-turbo')"
"""
import hashlib
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
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))


def _default_threads(cores):
    """Every core on a small server; about 70% on a big one, where the slowest cores only add waiting."""
    cores = cores or 4
    return cores if cores <= 4 else round(cores * 0.7)


CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "0")) or _default_threads(os.cpu_count())
BATCH_SIZE = int(os.environ.get("WHISPER_BATCH_SIZE", "4"))

# Vocabulary hints for Whisper's spelling. Deliberately NO registrations or sentences: Whisper can
# copy prompt text into the transcript, and an example like "5Y-KZD ... inavuja" once replaced the
# aircraft and words the speaker actually said. Whisper also copies the prompt's style (a comma
# list made it put a comma after every word), so each is one plain, generic sentence.
PROMPTS = {
    "en": "This is an aircraft maintenance shift handover from the engineer to the next crew about hydraulic systems, landing gear and brakes.",
    "sw": "Haya ni makabidhiano ya zamu ya mafundi wa ndege kuhusu pampu ya majimaji, gurudumu na breki kwa ajili ya zamu inayofuata.",
}


def _features_key(features):
    """A fingerprint of a batch of log-Mel features (one 30 s window per chunk)."""
    import numpy as np  # imported here, like Whisper, so the unit tests need only pytest

    features = np.ascontiguousarray(features)
    return features.shape, hashlib.blake2b(features.tobytes(), digest_size=16).digest()


def choose_language(detected):
    """("en" | "sw", confidence, Swahili share) from Whisper's language scores for each chunk.

    Only English and Swahili count. Swahili's share of their combined score is averaged over the
    chunks, and the audio is decoded as Swahili only when that reaches SWAHILI_SHARE.
    """
    shares = []
    for results in detected:
        scores = {token.strip("<|>"): p for token, p in results}
        total = scores.get("en", 0) + scores.get("sw", 0)
        shares.append(scores.get("sw", 0) / total if total else 0.0)
    sw_share = sum(shares) / len(shares) if shares else 0.0
    language = "sw" if sw_share >= SWAHILI_SHARE else "en"
    return language, round(sw_share if language == "sw" else 1 - sw_share, 3), sw_share


class AudioError(ValueError):
    """The upload isn't usable audio (unreadable, empty or too long)."""


class Transcriber:
    def __init__(self):
        self.model_name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
        self.compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        self._model = None
        self._pipeline = None
        self._lock = threading.Lock()
        self._encoded = None  # (key, encoder output) of the last batch encoded for language detection

    def _load(self):
        with self._lock:
            if self._model is None:
                from faster_whisper import BatchedInferencePipeline, WhisperModel

                print(f"Loading Whisper ({self.model_name}, {self.compute_type}, {CPU_THREADS} threads)...")
                self._model = WhisperModel(self.model_name, device="cpu", compute_type=self.compute_type, cpu_threads=CPU_THREADS)
                self._pipeline = BatchedInferencePipeline(model=self._model)
                self._reuse_encoder_output(self._model)
                print(f"Whisper ready ({self.model_name}).")
        return self._model

    def _reuse_encoder_output(self, model):
        """Lets transcription reuse the encoder pass that language detection already made.

        The encoder (most of Whisper's work on CPU) always processes 30 s windows, so detecting the
        language and then transcribing would encode the same audio twice. Detection encodes exactly
        what the pipeline's first batch will be and keeps the result; when the pipeline asks to
        encode identical features, it gets that result back. Anything else is encoded as usual,
        so a miss (e.g. a library update changing the features) only costs time, never accuracy.
        """
        encode = model.encode

        def encode_once(features):
            kept = self._encoded
            if kept is not None and kept[0] == _features_key(features):
                self._encoded = None
                return kept[1]
            return encode(features)

        model.encode = encode_once

    def _detect_language(self, audio, duration):
        """Chooses "en" or "sw" for the audio (see SWAHILI_SHARE), from the first batch of speech.

        Prepares the pipeline's first batch the way it will (voice activity detection, chunks of up
        to 30 s, log-Mel features) and encodes it once; that output is kept for the pipeline.
        """
        import numpy as np
        from faster_whisper.audio import pad_or_trim
        from faster_whisper.vad import VadOptions, collect_chunks, get_speech_timestamps

        model = self._model
        chunk = model.feature_extractor.chunk_length
        speech = get_speech_timestamps(audio, VadOptions(max_speech_duration_s=chunk, min_silence_duration_ms=160))
        if not speech:
            return "en", 1.0  # nothing to hear; the pipeline returns empty text
        chunks, _ = collect_chunks(audio, speech, max_duration=chunk)
        batch = np.stack([pad_or_trim(model.feature_extractor(c)[..., :-1]) for c in chunks[:BATCH_SIZE]])
        output = model.encode(batch)
        self._encoded = (_features_key(batch), output)

        detected = model.model.detect_language(output)  # per chunk: [("<|en|>", 0.9), ...], best first
        language, probability, sw_share = choose_language(detected)
        top = ", ".join(f"{token[2:-2]} {p:.2f}" for token, p in detected[0][:3])
        print(
            f"[transcribe] {duration:.1f}s audio; first chunk {top}; Swahili share {sw_share:.2f} "
            f"over {len(detected)} chunk(s) -> decode as {language}"
        )
        return language, probability

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
        started = time.perf_counter()
        probability = 1.0
        if language not in LANGUAGES:
            language, probability = self._detect_language(audio, duration)
        # Batched: the speech is split at pauses (voice activity detection) and the pieces are
        # decoded together rather than one after another.
        segments, _info = self._pipeline.transcribe(
            audio,
            language=language,
            beam_size=BEAM_SIZE,
            batch_size=BATCH_SIZE,
            vad_filter=True,
            initial_prompt=PROMPTS[language],
            condition_on_previous_text=False,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        self._encoded = None  # free it if the pipeline didn't use it
        print(f"[transcribe] {duration:.1f}s audio as {language} in {time.perf_counter() - started:.1f}s")
        return {
            "text": normalise_registrations(text),
            "language": language,
            "language_probability": round(float(probability), 3),
            "duration": round(duration, 1),
        }
