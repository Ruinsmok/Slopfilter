from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from classifier import classify_batch

device: torch.device | None = None
models_loaded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global device, models_loaded
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    except Exception:
        device = torch.device("cpu")
    print(f"[SlopFilter] device: {device}")
    # Phase 4+: load NLP and OCR models here, set models_loaded = True
    # Phase 2 stub: warmup with empty batch to pre-import modules
    classify_batch([])
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class VideoItem(BaseModel):
    title: str
    thumbnailUrl: str


class ClassifyResult(BaseModel):
    score: float
    label: str
    signals: list[str]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": models_loaded,
        "device": str(device) if device else "uninitialized",
    }


@app.post("/classify-batch", response_model=list[ClassifyResult])
def classify_batch_route(items: list[VideoItem]):
    return classify_batch([i.model_dump() for i in items])
