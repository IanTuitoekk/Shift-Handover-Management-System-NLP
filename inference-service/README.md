# Inference service

FastAPI service with the fine-tuned mBERT model (incident category, entities, summary) and Whisper
speech-to-text for voice handovers. The Express backend is its only client.

```bash
cd inference-service
python3 -m venv venv && venv/bin/pip install -r requirements-dev.txt   # first time
venv/bin/uvicorn app.main:app --port 8000
```

The trained weights live in `model/` (`best_model.pt`, `label_maps.json`). On first start the mBERT
tokenizer/encoder (~700 MB) and the Whisper model (~1.6 GB for `large-v3-turbo`) download into the
Hugging Face cache. Download Whisper ahead of time (faster-whisper hides download progress):

```bash
venv/bin/python -c "from faster_whisper import download_model; download_model('large-v3-turbo')"
```

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ "status": "ok" }` |
| POST | `/predict` | `{ "text": "..." }` | `{ incident_category, category_confidence, entities: [{ type, text, confidence }], summary }` |
| POST | `/transcribe` | multipart: `audio` (webm/ogg/mp4/wav, ≤ 10 MB, ≤ 3 min), optional `language` (`en` or `sw`) | `{ text, language, language_probability, duration }`; 400 for unusable audio, 413 if too large |

## Entities (`app/decoding.py`)

The model tags each sub-word token (BIO). Decoding is word-aware: pieces such as `##k` in
`lea ##k` take their word's tag, so an entity never ends mid-word, and every span is widened to
whole words as a safety net. Entities saved before this fix (3 Oct 2026) were repaired with the
backend's `npm run reprocess-entities`.

## Voice (`app/transcribe.py`, `app/phonetic.py`)

[faster-whisper](https://github.com/SYSTRAN/faster-whisper) runs on this server, so audio never
leaves it. The language is detected as English or Swahili. Spoken registrations are written out
("five Yankee Kilo Zulu Delta" → `5Y-KZD`) so the entity model recognises them.

| Variable | Default | |
|---|---|---|
| `WHISPER_MODEL` | `large-v3-turbo` | Accurate English and Swahili. `small` is about 3× faster but makes noticeably more Swahili spelling and punctuation errors (compared on the same Swahili handover, 15 Oct 2026) |
| `WHISPER_COMPUTE_TYPE` | `int8` | |

On an M-series Mac (CPU): roughly 10 s for 10 s of speech with `large-v3-turbo`, about 3 s with
`small`. Whisper is given only a generic one-sentence hint per language: example registrations or
sentences in the hint were copied into transcripts (a wrong aircraft once), and a word-list hint
made it put a comma after every word. `tests/test_transcribe_prompts.py` guards this.

## Tests and evaluation

```bash
venv/bin/python -m pytest tests                 # unit tests (fast, no model needed)
venv/bin/python -m scripts.evaluate             # evaluate the served model (about 30 s)
```

`scripts/evaluate.py` runs the model exactly as the API does over the 147 held-out test handovers
(`../machine-learning/data/processed/test_processed.jsonl`, never used in training) and writes:

- **[`evaluation/results.md`](evaluation/results.md)**: a report with tables ready for a write-up:
  results by language (English, Swahili, code-switched), entity F1 by type and language, summary
  ROUGE compared with a lead-2 baseline, an entity error analysis with examples, category confusion
  and a label-consistency check.
- `evaluation/results.json`: the same numbers, machine-readable.

The scoring functions are in `scripts/metrics.py` and unit-tested in `tests/test_metrics.py`. Rerun
the evaluation after retraining and compare the two reports (they are committed, so `git diff`
shows what changed).

Baseline (25 Oct 2026): category accuracy 0.62; entity F1 0.65 exact and 0.77 partial; similar
across languages (exact F1: English 0.65, Swahili 0.63, code-switched 0.67). Aircraft are found
reliably (F1 0.93); TASK (0.54), LOCATION (0.59) and COMPONENT (0.61) are weakest, mostly through
span boundaries and missed entities. The extractive summary scores the same as taking the first two
sentences (ROUGE-L 0.22 for both). No entity starts or ends mid-word.
