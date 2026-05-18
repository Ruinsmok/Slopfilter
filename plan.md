# SlopFilter — Project Plan

## Goal

Build a Chrome extension that automatically detects and hides AI-generated "slop" and brainrot content across YouTube, Instagram, and TikTok, using:
- **NLP classifier** — detects slop signals in video titles
- **OCR + classifier** — extracts thumbnail text and classifies it
- Both feed a **local Python inference server** the extension calls at browsing time

---

## GPU Configuration

| Decision | Choice | Reason |
|---|---|---|
| GPU | RTX 5070 Laptop (CUDA 13.0, PyTorch 2.11+cu130) | Already configured, CUDA available |
| Scope | Training + inference | <1GB VRAM for both models combined; 10–20× faster inference |
| Precision | BF16 everywhere | Blackwell tensor cores; stable range vs FP16; half VRAM |
| Batching | Debounced batch per scroll event (~100ms window) | GPU parallelism; eliminates per-card overhead |
| OCR framework | EasyOCR (PyTorch-native) | Single CUDA context; no PaddlePaddle conflict |
| Compilation | `torch.compile()` on NLP model | ~20–30% inference speedup; warmup at server start |
| Fallback | CPU if GPU OOM at startup | Server always functional even under VRAM pressure |

---

## Architecture

```
Browser (Chrome Extension)
│
├── content.js — MutationObserver detects new cards
│   └── debounce 100ms → collect batch
│                │
│   background.js proxies fetch (content scripts
│   cannot call localhost directly)
│                │
│                ▼
│        localhost:7272 (FastAPI)
│                │
│    POST /classify-batch [{ title, thumbnailUrl }, ...]
│                │
│       ┌────────┴────────┐
│       ▼                 ▼
│   NLP model         EasyOCR pipeline
│  (DistilBERT        (thumbnail image
│   BF16, compiled)    → text → classifier)
│       │                 │         BF16
│       └────────┬────────┘
│            Combined
│             score per item
│           hide / show each card
│
└── Fallback: regex rules if /health fails
```

---

## Project Structure (target)

```
slopfilter/
├── extension/                  # Chrome extension (move all current root JS/CSS/HTML here)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.js
│   ├── popup.html
│   ├── youtube-shorts.js
│   ├── youtube-shorts.css
│   ├── youtube-shorts-labeler.js
│   ├── instagram-reels.js
│   ├── tiktok-reels.js
│   └── icon.png
│
├── server/                     # Local inference server
│   ├── main.py                 # FastAPI app — POST /classify, GET /health
│   ├── classifier.py           # Combines NLP + OCR scores into final decision
│   ├── nlp.py                  # Title NLP classifier (DistilBERT fine-tune)
│   ├── ocr.py                  # PaddleOCR wrapper + text classifier
│   ├── models/                 # Saved model weights (gitignored if large)
│   └── requirements.txt
│
├── training/                   # Offline training scripts
│   ├── train_nlp.py            # Fine-tune title classifier
│   ├── train_ocr_classifier.py # Train classifier on OCR-extracted text
│   ├── build_dataset.py        # Merge + preprocess all data sources
│   ├── fetch_thumbnails.py     # Download thumbnails for labeled videos
│   └── evaluate.py             # Precision/recall/F1 report
│
├── data/
│   ├── labeled/
│   │   └── dataset.json        # User-labeled data exported from extension
│   ├── raw/                    # Downloaded public datasets (gitignored)
│   └── processed/              # Featurised splits ready for training
│
└── plan.md                     # This file
```

---

## Phases

### Phase 1 — Restructure ✓
- [x] Move all extension files into `extension/` (includes `popup.css`, `make-model.py` → `training/`)
- [x] Update `manifest.json` paths if needed (all files are flat so no path changes required after move)
- [x] Create `server/`, `training/`, `data/labeled/`, `data/raw/`, `data/processed/`
- [x] Move `dataset.json` → `data/labeled/dataset.json`
- [x] Add `server/requirements.txt` with initial deps: `fastapi uvicorn easyocr transformers torch pillow requests scikit-learn numpy`
- [x] Add `.gitignore` entries for `data/raw/`, `server/models/`, `.venv/`

---

### Phase 2 — Local inference server skeleton ✓
- [x] `server/main.py`: FastAPI with `/health` and `/classify-batch`, GPU init with CPU fallback, warmup call on lifespan
- [x] `server/classifier.py`: `classify_batch()` combining NLP + OCR scores
- [x] `server/nlp.py`: stub returning 0.5 per title
- [x] `server/ocr.py`: stub returning None per URL (classifier falls back to NLP-only)
- [x] `extension/background.js`: `CLASSIFY_BATCH` message handler proxies to server
- [x] `extension/content.js`: `probeServer()` on load, debounced `flushBatch()` queues non-ad/non-duration cards, server decisions override regex decisions in `decisionCache`
- [x] Fallback: `serverAvailable = false` silently disables queuing; regex rules remain active

---

### Phase 3 — Dataset collection & preparation (ongoing)

#### Your labeled data
- Already collecting `{ videoId, title, label, thumbnailUrl, timestamp }` via the labeler
- Run `training/fetch_thumbnails.py` to download all labeled thumbnail images locally into `data/raw/thumbnails/`

#### Public datasets to augment with
| Dataset | What it provides | Where to get it |
|---|---|---|
| [RAID Benchmark](https://github.com/liamdugan/raid) | AI-generated vs human text, multi-domain | HuggingFace |
| [HC3 (Human ChatGPT Comparison)](https://huggingface.co/datasets/Hello-SimpleAI/HC3) | Human vs ChatGPT answers | HuggingFace |
| [YouTube Spam Collection](https://www.kaggle.com/datasets/goneee/youtube-spam-collection) | Spam/clickbait video titles | Kaggle |
| [FakeThumbnail / Clickbait-Challenge](https://github.com/clickbait-challenge) | Clickbait titles + thumbnails | GitHub |
| Scraped Shorts labels | Use existing extension in label mode for 1–2 sessions | Self-collected |

#### OCR text diversity concern
- The classifier trained on thumbnail OCR text needs examples of:
  - AI bait text ("This AI SHOCKED everyone", emoji spam, all-caps hooks)
  - Normal thumbnail text (athlete names, timestamps, product labels)
- Strategy: label 200–300 thumbnails manually, extract OCR text from each, label the OCR text as slop/ok
- Augment with rendered synthetic thumbnails (PIL: paste meme-style text on stock photos) to cover font diversity

---

### Phase 4 — NLP title classifier (3–5 hours)

**Model:** Fine-tune `distilbert-base-uncased` (66M params, fast, fits in <500MB)

**Training data:** Your labeled titles + RAID + HC3 (map to binary slop/ok) + YouTube spam titles

**Steps:**
- [ ] `training/build_dataset.py` — merge sources, deduplicate by videoId, split 80/10/10 train/val/test
- [ ] `training/train_nlp.py` — HuggingFace `Trainer`, BF16 via `fp16=False, bf16=True` in `TrainingArguments`, binary cross-entropy, 3 epochs
- [ ] Target metrics: **F1 > 0.80** on val set before wiring into server
- [ ] Save to `server/models/nlp/`
- [ ] Implement `server/nlp.py`:
  - Load model → `.to(device)` → `torch.compile(model)`
  - Inference: `torch.amp.autocast(device_type="cuda", dtype=torch.bfloat16)`
  - Accept a list of titles, return list of scores (batch path)
- [ ] Fallback inside `nlp.py`: if model not loaded, run regex patterns as rule-based scorer

---

### Phase 5 — OCR pipeline (4–6 hours)

**OCR engine:** EasyOCR (PyTorch-native — single CUDA context with NLP model, no PaddlePaddle conflict)

**Steps:**
- [ ] `server/ocr.py`:
  1. Init: `easyocr.Reader(['en'], gpu=True)` — loads onto same CUDA device as NLP model
  2. Download thumbnail from URL (cache by URL hash in `%TEMP%\slop_thumbs\` on Windows)
  3. Run contrast enhancement via PIL `ImageEnhance.Contrast(img).enhance(1.8)` before OCR (improves dark-on-dark text)
  4. Extract text blocks, filter confidence < 0.6
  5. Concatenate remaining text → feed to text classifier (BF16 autocast)
- [ ] Text classifier on OCR output: same DistilBERT approach as Phase 4 (already on GPU, already compiled)
- [ ] `training/train_ocr_classifier.py` — train on OCR text extracted from labeled thumbnails, same BF16 training config

**OCR diversity mitigation:**
- EasyOCR handles rotated and stylized text natively (built-in CRAFT + CRNN)
- Contrast enhancement pass covers dark-on-dark thumbnail text
- If OCR returns < 3 words, skip OCR signal — don't let empty OCR poison the combined score

---

### Phase 6 — Combined classifier (1–2 hours)

- [ ] `server/classifier.py`:
  ```python
  def classify_batch(items):  # items: [{ title, thumbnailUrl }]
      nlp_scores = nlp.score_batch([i["title"] for i in items])        # GPU batch
      ocr_scores = ocr.score_batch([i["thumbnailUrl"] for i in items]) # GPU batch, None if <3 words
      results = []
      for nlp_s, ocr_s in zip(nlp_scores, ocr_scores):
          final = nlp_s if ocr_s is None else 0.6 * nlp_s + 0.4 * ocr_s
          results.append({ "score": final, "label": "slop" if final > 0.65 else "ok" })
      return results
  ```
- [ ] Threshold (`0.65`) should be tunable from the popup UI — expose as a sensitivity slider
- [ ] Log misclassified examples to `data/labeled/corrections.json` for future retraining

---

### Phase 7 — Polish & distribution (future)
- [ ] Popup: add server status indicator (green/red dot), sensitivity slider, model version shown
- [ ] `server/start.sh` / `start.bat` — one-click server launch script
- [ ] Package models with a downloader script (`server/download_models.py`) so users don't need to train
- [ ] Extend to Instagram/TikTok thumbnails (same OCR pipeline, different thumbnail URL patterns)

---

## Open Questions / Risks

| Risk | Mitigation |
|---|---|
| EasyOCR accuracy on heavily stylized fonts | Contrast enhancement pre-pass; CRAFT detector handles most cases; synthetic augmentation fills gaps |
| Too few labeled examples for OCR classifier | Synthetic data augmentation (Phase 3); active learning via existing labeler |
| Server startup friction for end users | `start.bat` / `start.sh` + tray icon wrapper (later) |
| YouTube DOM changes breaking selectors | Existing observers already handle this; low risk short term |
| False positives hiding legitimate content | Sensitivity slider + correction logging (Phase 6) |

---

## Current State

- Extension injects into YouTube, Instagram, TikTok ✓
- YouTube: hides Shorts shelf, filters by duration + regex slop patterns ✓
- Labeling UI (Keep/Slop buttons on thumbnails) ✓
- Dataset export from popup ✓
- `signalModel: null` in `content.js` — ML hook ready but not wired ✓
- Python `.venv` with `torch` exists — server deps partially available ✓
- **Nothing in `server/` or `training/` yet**
