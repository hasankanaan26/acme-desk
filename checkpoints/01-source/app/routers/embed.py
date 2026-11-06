# ============================================================
# Router: /embed — Explore how embeddings work
# ============================================================
# This endpoint is a teaching tool. It lets you embed any
# texts and see how "close" or "far" they are from each other
# in vector space.
#
# The distance between two vectors tells you how similar their
# meanings are. Low distance = similar meaning, high distance
# = different meaning.
#
# TRY THESE EXPERIMENTS:
#
#   1. Synonyms:
#      ["vacation days", "annual leave", "time off"]
#      → All three should be close to each other
#
#   2. Same topic vs different topic:
#      ["vacation days", "annual leave", "Python programming"]
#      → First pair close, other pairs far
#
#   3. Question vs answer match:
#      ["How many vacation days?", "Employees receive 20 days of annual leave"]
#      → Should be fairly close (good for RAG!)
#
#   4. Different languages, same meaning:
#      ["vacation", "vacaciones", "urlaub"]
#      → Often close, depending on the embedding model
#
# The distances help you understand:
#   - Why RAG can find relevant chunks even without keyword matches
#   - How the embedding model "understands" language
#   - What kinds of queries will work well (or poorly) with your chunks
# ============================================================

import math
from fastapi import APIRouter
from app.models import EmbedRequest, EmbedResponse
from app.rag.embedder import embed_texts

router = APIRouter(prefix="/embed", tags=["Embedding Explorer"])


@router.post("", response_model=EmbedResponse)
def explore_embeddings(request: EmbedRequest):
    """
    Embed a list of texts and compute pairwise distances.

    Send 2+ texts to see how similar they are in vector space.
    Low distance = similar meaning, high distance = different.
    """
    texts = request.texts

    # Embed all texts in one batch
    embeddings = embed_texts(texts)
    dimensions = len(embeddings[0]) if embeddings else 0

    # Compute pairwise L2 (Euclidean) distances
    distances = {}
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            # L2 distance: sqrt(sum((a_k - b_k)^2))
            dist = math.sqrt(
                sum(
                    (embeddings[i][k] - embeddings[j][k]) ** 2
                    for k in range(dimensions)
                )
            )
            # Use a readable key showing which texts are being compared
            label = f"'{texts[i]}' ↔ '{texts[j]}'"
            distances[label] = round(dist, 4)

    return EmbedResponse(distances=distances, dimensions=dimensions)
