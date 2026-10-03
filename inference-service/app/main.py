from fastapi import FastAPI
from pydantic import BaseModel
from app.model import InferenceModel

app = FastAPI(title="Shift Handover NLP Inference Service")

# Loaded once at startup, kept in memory for all requests
inference_model = InferenceModel()


class PredictRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(request: PredictRequest):
    if not request.text or not request.text.strip():
        return {"error": "text is required"}

    result = inference_model.predict(request.text)
    return result