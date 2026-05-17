# SlopFilter — Project Plan

## Goal

Build a Chrome extension that automatically detects and hides AI-generated "slop" and brainrot content across YouTube, Instagram, and TikTok, using:
- **NLP classifier** — detects slop signals in video titles
- **OCR + classifier** — extracts thumbnail text and classifies it
- Both feed a **local Python inference server** the extension calls at browsing time

---

## Architecture

```
Browser (Chrome Extension)
│
├── content.js / background.js
│   └── POST /classify { title, thumbnailUrl }
│                │
│                ▼
│        localhost:7272 (FastAPI)
│                │
│       ┌────────┴────────┐
│       ▼                 ▼
│   NLP model         OCR pipeline
│  (title text)    (thumbnail image)
│       │                 │
│       └────────┬────────┘
│            Combined
│             score
│           hide / show
│
└── Fallback: regex rules if server is unreachable
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

### Phase 1 — Restructure (1–2 hours)
- [ ] Move all extension files into `extension/`
- [ ] Update `manifest.json` paths if needed (all files are flat so no path changes required after move)
- [ ] Create `server/`, `training/`, `data/labeled/`, `data/raw/`, `data/processed/`
- [ ] Move `dataset.json` → `data/labeled/dataset.json`
- [ ] Add `server/requirements.txt` with initial deps: `fastapi uvicorn paddleocr paddlepaddle transformers torch pillow requests`
- [ ] Add `.gitignore` entries for `data/raw/`, `server/models/`, `.venv/`

---

### Phase 2 — Local inference server skeleton (2–3 hours)
- [ ] `server/main.py`: FastAPI with two routes:
  - `GET /health` → `{ status: "ok", models_loaded: bool }`
  - `POST /classify` → `{ title, thumbnailUrl }` → `{ score: float, label: "slop"|"ok", signals: [...] }`
- [ ] Stub `nlp.py` and `ocr.py` — return random scores initially so the extension can be wired up
- [ ] Wire extension: in `background.js`, after receiving `LABEL_SHORT`, also expose a `CLASSIFY` message path; in `content.js`, replace `signalModel: null` with a call to the server via `background.js` (content scripts can't fetch localhost directly — must proxy through background)
- [ ] Fallback: if `/health` fails, silently fall back to existing regex rules

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
- [ ] `training/train_nlp.py` — HuggingFace `Trainer`, binary cross-entropy, 3 epochs
- [ ] Target metrics: **F1 > 0.80** on val set before wiring into server
- [ ] Save to `server/models/nlp/`
- [ ] Implement `server/nlp.py` — load model, tokenize title, return `{ score, matched_signals }`

**Fallback inside nlp.py:** if model isn't loaded, run existing regex patterns from `content.js` as a rule-based fallback so the server is always functional.

---

### Phase 5 — OCR pipeline (4–6 hours)

**OCR engine:** PaddleOCR (handles stylized fonts, busy backgrounds, mixed case far better than Tesseract)

**Steps:**
- [ ] `server/ocr.py`:
  1. Download thumbnail from URL (cache by URL hash in `/tmp/slop_thumbs/`)
  2. Run PaddleOCR — extract all text blocks with confidence scores
  3. Filter blocks with confidence < 0.6
  4. Concatenate remaining text → feed to text classifier
- [ ] Text classifier on OCR output: same DistilBERT approach as Phase 4, or simpler TF-IDF + logistic regression if OCR text is too short for transformer tokenization
- [ ] `training/train_ocr_classifier.py` — train on OCR text extracted from labeled thumbnails

**OCR diversity mitigation:**
- Use PaddleOCR's `use_angle_cls=True` to handle rotated text
- Run on both original and contrast-enhanced image (PIL `ImageEnhance.Contrast`) for dark-on-dark text
- If OCR returns < 3 words, skip OCR signal and rely on NLP only — don't let empty OCR poison the score

---

### Phase 6 — Combined classifier (1–2 hours)

- [ ] `server/classifier.py`:
  ```python
  def classify(title, thumbnail_url):
      nlp_score = nlp.score(title)          # 0.0–1.0
      ocr_score = ocr.score(thumbnail_url)  # 0.0–1.0, or None if OCR skipped
      if ocr_score is None:
          final = nlp_score
      else:
          final = 0.6 * nlp_score + 0.4 * ocr_score  # weight title higher
      return { "score": final, "label": "slop" if final > 0.65 else "ok" }
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
| PaddleOCR accuracy on stylized fonts | Test on 50 diverse thumbnails before committing; EasyOCR is drop-in alternative |
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
