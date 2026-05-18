

# Stub — Phase 4 will replace this with a fine-tuned DistilBERT classifier.
# Returns 0.5 (neutral) for every title so the server is wire-compatible
# without affecting any hide/show decisions during development.

def score_batch(titles: list[str]) -> list[float]:
    return [0.5] * len(titles)
