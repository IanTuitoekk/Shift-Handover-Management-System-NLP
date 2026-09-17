# Multilingual Shift Handover Automation System — Kenya Airways

Final-year capstone project (Strathmore University, BSc Informatics and Computer
Science, ICS 4A) building an mBERT + Whisper based system for automating
aviation ground/maintenance shift handovers, supporting English, Swahili, and
(as a documented secondary/exploratory scope) code-switched text.


## Status

This is the `main` branch — production-ready code only, updated exclusively via
Pull Request from `dev`. Active development happens on `dev` and `feature/*`
branches.

Current milestone: data pipeline complete (synthetic bilingual corpus generated,
stratified train/validation/test split, entity/text processing). Model training,
backend API, and frontend are in progress on feature branches.

## Project structure

```
shift-handover-nlp/
├── data/
│   ├── raw/              # Source corpora (ASRS narratives, MasakhaNER Swahili)
│   ├── reference/         # Taxonomy + abbreviation lookup for labeling/cleaning
│   ├── codeswitching/     # Speaker-reviewed code-switching reference examples
│   └── processed/         # Generated synthetic corpus + train/dev/test splits
├── src/
│   ├── data_processing/   # Generation, extraction, splitting, cleaning, tokenization
│   ├── training/           # mBERT fine-tuning
│   ├── evaluation/         # Metrics: macro-F1, entity F1, Whisper WER
│   └── utils/
├── backend/                # API layer serving the trained model (in progress)
├── frontend/                # Web interface for technicians (in progress)
├── models/                 # Saved checkpoints (gitignored — too large for git)
├── docs/                   # Chapter drafts and planning docs
└── tests/                  # Unit tests
```

## Branching strategy

- `main` — production-ready only, PR-only, never pushed to directly
- `dev` — integration branch; all feature work merges here first
- `feature/*` — one branch per component (e.g. `feature/model-training`,
  `feature/backend-api`, `feature/frontend`), branched from `dev`, merged back
  into `dev` via PR

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

See `docs/` for full methodology and data provenance documentation.