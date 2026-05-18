
# Stub — Phase 5 will replace this with EasyOCR + GPU text classifier.
# Returns None for every URL, which tells classifier.py to rely on NLP only.

def score_batch(urls: list[str]) -> list[float | None]:
    return [None] * len(urls)
