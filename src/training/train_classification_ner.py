"""

Step: model training (classification + NER), joint mBERT fine-tuning.

Trains a single mBERT encoder with two task-specific heads:
  - Classification head: predicts incident_category_grouped from the
    pooled [CLS] representation.
  - NER head: predicts a BIO tag for every token, from the per-token
    hidden states.

Both heads share the same mBERT encoder and are trained jointly with a
combined loss (classification cross-entropy + token-level NER
cross-entropy, equal weighting).

Input: train_processed.jsonl and validation_processed.jsonl, as produced
by process_corpus.py -- each record already has "input_ids" (mBERT
token ids) and "bio_tags" (string labels per token) precomputed, so this
script does not re-tokenize; it only builds label ids, batches, and
trains.

test.jsonl is never touched by this script.

Setup:
    pip install torch transformers scikit-learn seqeval

Usage:
    python train_classification_ner.py \
        --data_dir /content/drive/MyDrive/shift-handover-nlp-data \
        --output_dir /content/drive/MyDrive/shift-handover-nlp-data/models/classification_ner \
        --epochs 15 --batch_size 8
"""

import argparse
import json
import os
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup
from sklearn.metrics import f1_score as sklearn_f1
from seqeval.metrics import f1_score as seqeval_f1, classification_report as seqeval_report

MODEL_NAME = "google-bert/bert-base-multilingual-cased"

CATEGORY_LABELS = [
    "Aircraft Equipment Problem",
    "Deviation/Discrepancy - Procedural",
    "Other/Rare Ground Event",
]

CATEGORY_TO_ID = {c: i for i, c in enumerate(CATEGORY_LABELS)}

ENTITY_TYPES = ["AIRCRAFT", "COMPONENT", "ROLE", "LOCATION", "TASK", "TIME"]
BIO_LABELS = ["O"] + [f"{p}-{e}" for e in ENTITY_TYPES for p in ("B", "I")]
BIO_TO_ID = {t: i for i, t in enumerate(BIO_LABELS)}
ID_TO_BIO = {i: t for t, i in BIO_TO_ID.items()}

IGNORE_INDEX = -100


def load_records(path):
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


class ClassificationNERDataset(Dataset):
    def __init__(self, records):
        self.examples = []
        skipped = 0
        for r in records:
            category = r.get("incident_category_grouped")
            if category not in CATEGORY_TO_ID:
                skipped += 1
                continue
            input_ids = r["input_ids"]
            bio_tags = r["bio_tags"]
            if len(input_ids) != len(bio_tags):
                skipped += 1
                continue
            label_ids = [BIO_TO_ID.get(t, BIO_TO_ID["O"]) for t in bio_tags]
            self.examples.append({
                "input_ids": input_ids,
                "ner_labels": label_ids,
                "category_label": CATEGORY_TO_ID[category],
            })
        self.skipped = skipped

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        return self.examples[idx]


def make_collate_fn(pad_token_id):
    def collate_fn(batch):
        max_len = max(len(ex["input_ids"]) for ex in batch)
        input_ids, attention_mask, ner_labels, category_labels = [], [], [], []
        for ex in batch:
            ids = ex["input_ids"]
            labels = ex["ner_labels"]
            pad_len = max_len - len(ids)
            input_ids.append(ids + [pad_token_id] * pad_len)
            attention_mask.append([1] * len(ids) + [0] * pad_len)
            ner_labels.append(labels + [IGNORE_INDEX] * pad_len)
            category_labels.append(ex["category_label"])
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "ner_labels": torch.tensor(ner_labels, dtype=torch.long),
            "category_labels": torch.tensor(category_labels, dtype=torch.long),
        }
    return collate_fn


class MultiTaskMBERT(nn.Module):
    def __init__(self, encoder, num_categories, num_bio_labels, dropout=0.1):
        super().__init__()
        self.encoder = encoder
        hidden_size = encoder.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.classification_head = nn.Linear(hidden_size, num_categories)
        self.ner_head = nn.Linear(hidden_size, num_bio_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        sequence_output = outputs.last_hidden_state  # (batch, seq_len, hidden)
        pooled_output = outputs.pooler_output         # (batch, hidden)

        category_logits = self.classification_head(self.dropout(pooled_output))
        ner_logits = self.ner_head(self.dropout(sequence_output))
        return category_logits, ner_logits


def compute_loss(category_logits, ner_logits, category_labels, ner_labels, device):
    # Class weights: [Aircraft Equipment, Deviation/Discrepancy, Other/Rare Ground Event]
    # Weighted inversely to training frequency (354 : 315 : 15 records)
    class_weights = torch.tensor([1.0, 1.0, 5.0]).to(device)
    category_loss_fn = nn.CrossEntropyLoss(weight=class_weights)
    ner_loss_fn = nn.CrossEntropyLoss(ignore_index=IGNORE_INDEX)

    category_loss = category_loss_fn(category_logits, category_labels)
    ner_loss = ner_loss_fn(ner_logits.view(-1, ner_logits.size(-1)), ner_labels.view(-1))
    return category_loss + ner_loss, category_loss.item(), ner_loss.item()


@torch.no_grad()
def evaluate(model, dataloader, device):
    model.eval()
    all_category_preds, all_category_true = [], []
    all_ner_preds, all_ner_true = [], []

    for batch in dataloader:
        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        category_labels = batch["category_labels"].to(device)
        ner_labels = batch["ner_labels"].to(device)

        category_logits, ner_logits = model(input_ids, attention_mask)

        category_preds = category_logits.argmax(dim=-1)
        all_category_preds.extend(category_preds.cpu().tolist())
        all_category_true.extend(category_labels.cpu().tolist())

        ner_preds = ner_logits.argmax(dim=-1)
        for i in range(input_ids.size(0)):
            true_seq, pred_seq = [], []
            for j in range(input_ids.size(1)):
                if ner_labels[i, j].item() == IGNORE_INDEX:
                    continue
                true_seq.append(ID_TO_BIO[ner_labels[i, j].item()])
                pred_seq.append(ID_TO_BIO[ner_preds[i, j].item()])
            all_ner_true.append(true_seq)
            all_ner_preds.append(pred_seq)

    category_macro_f1 = sklearn_f1(all_category_true, all_category_preds, average="macro", zero_division=0)
    entity_f1 = seqeval_f1(all_ner_true, all_ner_preds)

    return {
        "category_macro_f1": category_macro_f1,
        "entity_f1": entity_f1,
        "ner_report": seqeval_report(all_ner_true, all_ner_preds, zero_division=0),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", required=True, help="Directory containing train_processed.jsonl and validation_processed.jsonl")
    parser.add_argument("--output_dir", required=True, help="Directory to save checkpoints and label maps")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--learning_rate", type=float, default=3e-5)
    parser.add_argument("--patience", type=int, default=3, help="Early stopping patience (epochs with no val improvement)")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_records = load_records(data_dir / "train_processed.jsonl")
    val_records = load_records(data_dir / "validation_processed.jsonl")

    train_dataset = ClassificationNERDataset(train_records)
    val_dataset = ClassificationNERDataset(val_records)
    print(f"Train examples: {len(train_dataset)} (skipped {train_dataset.skipped})")
    print(f"Validation examples: {len(val_dataset)} (skipped {val_dataset.skipped})")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    collate_fn = make_collate_fn(tokenizer.pad_token_id)

    # Oversample the minority class so it appears in every batch, rather than
    # relying solely on the loss weight to compensate for rare exposure
    category_ids = [ex["category_label"] for ex in train_dataset.examples]
    class_counts = Counter(category_ids)
    sample_weights = [1.0 / class_counts[cid] for cid in category_ids]
    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True,
    )

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, sampler=sampler, collate_fn=collate_fn)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, collate_fn=collate_fn)

    encoder = AutoModel.from_pretrained(MODEL_NAME)
    model = MultiTaskMBERT(encoder, len(CATEGORY_LABELS), len(BIO_LABELS)).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(0.1 * total_steps), num_training_steps=total_steps)

    best_combined_f1 = -1.0
    epochs_without_improvement = 0
    log = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            category_labels = batch["category_labels"].to(device)
            ner_labels = batch["ner_labels"].to(device)

            optimizer.zero_grad()
            category_logits, ner_logits = model(input_ids, attention_mask)
            loss, cat_loss, ner_loss = compute_loss(category_logits, ner_logits, category_labels, ner_labels, device)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()

        avg_train_loss = total_loss / len(train_loader)
        val_metrics = evaluate(model, val_loader, device)
        combined_f1 = (val_metrics["category_macro_f1"] + val_metrics["entity_f1"]) / 2

        print(f"Epoch {epoch}/{args.epochs} | train_loss={avg_train_loss:.4f} | "
              f"val_category_macro_f1={val_metrics['category_macro_f1']:.4f} | "
              f"val_entity_f1={val_metrics['entity_f1']:.4f}")

        log.append({
            "epoch": epoch,
            "train_loss": avg_train_loss,
            "val_category_macro_f1": val_metrics["category_macro_f1"],
            "val_entity_f1": val_metrics["entity_f1"],
        })

        if combined_f1 > best_combined_f1:
            best_combined_f1 = combined_f1
            epochs_without_improvement = 0
            torch.save(model.state_dict(), output_dir / "best_model.pt")
            with open(output_dir / "best_metrics.json", "w") as f:
                json.dump({
                    "epoch": epoch,
                    "category_macro_f1": val_metrics["category_macro_f1"],
                    "entity_f1": val_metrics["entity_f1"],
                    "ner_report": val_metrics["ner_report"],
                }, f, indent=2)
            print(f"  -> New best model saved (combined F1: {combined_f1:.4f})")
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= args.patience:
                print(f"Early stopping: no improvement for {args.patience} epochs")
                break

    with open(output_dir / "training_log.json", "w") as f:
        json.dump(log, f, indent=2)
    with open(output_dir / "label_maps.json", "w") as f:
        json.dump({"category_labels": CATEGORY_LABELS, "bio_labels": BIO_LABELS}, f, indent=2)

    print(f"\nDone. Best combined F1: {best_combined_f1:.4f}")
    print(f"Checkpoint, metrics, log, and label maps saved to {output_dir}")


if __name__ == "__main__":
    main()