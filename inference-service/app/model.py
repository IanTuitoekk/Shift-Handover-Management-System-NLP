import json
import torch
import torch.nn as nn
import torch.nn.functional as F
import pysbd
from pathlib import Path
from transformers import AutoModel, AutoTokenizer

MODEL_NAME = "google-bert/bert-base-multilingual-cased"
MODEL_DIR = Path(__file__).resolve().parent.parent / "model"

IGNORE_INDEX = -100


class MultiTaskMBERT(nn.Module):
    def __init__(self, encoder, num_categories, num_bio_labels, dropout=0.3):
        super().__init__()
        self.encoder = encoder
        hidden_size = encoder.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.classification_head = nn.Linear(hidden_size, num_categories)
        self.ner_head = nn.Linear(hidden_size, num_bio_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        category_logits = self.classification_head(self.dropout(outputs.pooler_output))
        ner_logits = self.ner_head(self.dropout(outputs.last_hidden_state))
        return category_logits, ner_logits


class InferenceModel:
    """Loads the trained model once and keeps it in memory for reuse across requests."""

    def __init__(self):
        with open(MODEL_DIR / "label_maps.json") as f:
            label_maps = json.load(f)

        self.category_labels = label_maps["category_labels"]
        self.bio_labels = label_maps["bio_labels"]
        self.id_to_bio = {i: t for i, t in enumerate(self.bio_labels)}

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        print(f"Loading tokenizer ({MODEL_NAME})...")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

        print(f"Loading encoder ({MODEL_NAME})...")
        encoder = AutoModel.from_pretrained(MODEL_NAME)

        self.model = MultiTaskMBERT(
            encoder,
            num_categories=len(self.category_labels),
            num_bio_labels=len(self.bio_labels),
        ).to(self.device)

        print(f"Loading trained weights from {MODEL_DIR / 'best_model.pt'}...")
        self.model.load_state_dict(
            torch.load(MODEL_DIR / "best_model.pt", map_location=self.device)
        )
        self.model.eval()

        self.segmenter = pysbd.Segmenter(language="en", clean=False)

        print("Model ready.")

    @torch.no_grad()
    def predict(self, text: str):
        encoding = self.tokenizer(
            text,
            return_offsets_mapping=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        offsets = encoding.pop("offset_mapping")[0].tolist()
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)

        category_logits, ner_logits = self.model(input_ids, attention_mask)

        # Classification
        category_probs = torch.softmax(category_logits, dim=-1)[0]
        category_idx = category_probs.argmax().item()
        category = self.category_labels[category_idx]
        category_confidence = category_probs[category_idx].item()

        # NER: per-token BIO predictions
        ner_probs = torch.softmax(ner_logits, dim=-1)[0]
        ner_pred_ids = ner_probs.argmax(dim=-1).tolist()
        bio_tags = [self.id_to_bio[i] for i in ner_pred_ids]

        entities = self._extract_entities(text, bio_tags, offsets, ner_probs)
        summary = self.summarize(text)

        return {
            "incident_category": category,
            "category_confidence": round(category_confidence, 4),
            "entities": entities,
            "summary": summary,
        }

    def _extract_entities(self, text, bio_tags, offsets, ner_probs):
        """Converts per-token BIO tags back into entity spans with the
        original text and a confidence score (mean token probability)."""
        entities = []
        current = None

        for i, tag in enumerate(bio_tags):
            start, end = offsets[i]
            if start == end:  # special tokens ([CLS], [SEP], padding)
                continue

            token_confidence = ner_probs[i, ner_probs[i].argmax()].item()

            if tag.startswith("B-"):
                if current:
                    entities.append(current)
                current = {
                    "type": tag[2:],
                    "start": start,
                    "end": end,
                    "confidences": [token_confidence],
                }
            elif tag.startswith("I-") and current and current["type"] == tag[2:]:
                current["end"] = end
                current["confidences"].append(token_confidence)
            else:
                if current:
                    entities.append(current)
                current = None

        if current:
            entities.append(current)

        return [
            {
                "type": e["type"],
                "text": text[e["start"] : e["end"]],
                "confidence": round(sum(e["confidences"]) / len(e["confidences"]), 4),
            }
            for e in entities
        ]

    def summarize(self, text: str, max_sentences: int = 2):
        """Centroid-based extractive summarization: splits the narrative
        into sentences, embeds each using the fine-tuned mBERT encoder's
        pooled output, and returns the sentence(s) most similar to the
        whole document's embedding."""
        sentences = self.segmenter.segment(text)

        # Too short to meaningfully summarize -- return as-is
        if len(sentences) <= max_sentences:
            return text.strip()

        sentence_embeddings = self._embed_sentences(sentences)
        document_embedding = self._embed_sentences([text])[0]

        scores = F.cosine_similarity(
            sentence_embeddings, document_embedding.unsqueeze(0), dim=1
        )

        top_indices = torch.topk(scores, k=max_sentences).indices.tolist()
        top_indices.sort()  # preserve original sentence order

        return " ".join(sentences[i].strip() for i in top_indices)

    @torch.no_grad()
    def _embed_sentences(self, sentences):
        """Returns pooled [CLS] embeddings for a list of sentences, using
        the same fine-tuned encoder as classification/NER."""
        encoding = self.tokenizer(
            sentences,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(self.device)

        outputs = self.model.encoder(
            input_ids=encoding["input_ids"],
            attention_mask=encoding["attention_mask"],
        )
        return outputs.pooler_output