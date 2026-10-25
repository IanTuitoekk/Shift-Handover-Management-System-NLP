FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    # mBERT and Whisper download here once; compose keeps it in a volume.
    HF_HOME=/models-cache
WORKDIR /app
COPY requirements.txt .
# CPU-only PyTorch first (the default wheel bundles GPU libraries and is several GB larger); the
# pinned torch in requirements.txt is then already satisfied.
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts
# The trained weights (model/best_model.pt, label_maps.json) are mounted at /app/model, not built in.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
