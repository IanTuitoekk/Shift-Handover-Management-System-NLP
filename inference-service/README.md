# Inference service

FastAPI service with the fine-tuned mBERT model (incident category, entities, summary) and Whisper
speech-to-text for voice handovers. The Express backend is its only client.

```bash
cd inference-service
python3 -m venv venv && venv/bin/pip install -r requirements-dev.txt   # first time
venv/bin/uvicorn app.main:app --port 8000
```

The trained weights live in `model/` (`best_model.pt`, `label_maps.json`). On first start the mBERT
tokenizer/encoder (~700 MB) and the Whisper model (~460 MB for `small`) download into the Hugging
Face cache.

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
| `WHISPER_MODEL` | `small` | `base` is faster but weaker in Swahili; `medium` is better but about 3× slower |
| `WHISPER_COMPUTE_TYPE` | `int8` | |

Measured on an M-series Mac (CPU): about 3 s for 10 s of speech with `small`.

## Tests and evaluation

```bash
venv/bin/python -m pytest tests                 # decoder and registration tests (fast, no model)
venv/bin/python -m scripts.evaluate             # the served model on ../machine-learning/data/processed/test_processed.jsonl
venv/bin/python -m scripts.evaluate --out results.json
```

Baseline on the 147 test handovers (15 Oct 2026): category accuracy 0.62 (macro F1 0.58); entities
exact-match F1 0.65 (P 0.67, R 0.64), partial-match F1 0.77; 0 entities starting or ending
mid-word. Weakest types: TASK (F1 0.51), LOCATION (0.57), COMPONENT (0.60). Use this to compare a
retrained model.
