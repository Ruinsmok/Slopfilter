from nlp import score_batch as nlp_score_batch
from ocr import score_batch as ocr_score_batch

THRESHOLD = 0.65
NLP_WEIGHT = 0.6
OCR_WEIGHT = 0.4


def classify_batch(items: list[dict]) -> list[dict]:
    if not items:
        return []

    titles = [i["title"] for i in items]
    urls = [i["thumbnailUrl"] for i in items]

    nlp_scores = nlp_score_batch(titles)
    ocr_scores = ocr_score_batch(urls)

    results = []
    for nlp_s, ocr_s in zip(nlp_scores, ocr_scores):
        if ocr_s is None:
            final = nlp_s
        else:
            final = NLP_WEIGHT * nlp_s + OCR_WEIGHT * ocr_s
        results.append({
            "score": round(final, 4),
            "label": "slop" if final > THRESHOLD else "ok",
            "signals": [],
        })
    return results
