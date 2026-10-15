from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from app.model import InferenceModel
from app.transcribe import AudioError, Transcriber

app = FastAPI(title="Shift Handover NLP Inference Service")

# Loaded once at startup, kept in memory for all requests
inference_model = InferenceModel()
transcriber = Transcriber()
transcriber.warm_up()

MAX_AUDIO_BYTES = 10 * 1024 * 1024


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


@app.post("/transcribe")
def transcribe(audio: UploadFile = File(...), language: str | None = Form(None)):
    """Speech to text. Multipart form: `audio` (webm/ogg/mp4/wav, up to 10 MB, 3 minutes) and
    optional `language` ("en" or "sw"; detected when absent)."""
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recordings can be up to 10 MB.")
    try:
        return transcriber.transcribe(data, language)
    except AudioError as err:
        raise HTTPException(status_code=400, detail=str(err))
