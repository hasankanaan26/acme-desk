# ============================================================
# Router: /visualize — Embedding scatter plot
# ============================================================
# Generates a 2D scatter plot of all stored chunk embeddings
# using t-SNE or PCA dimensionality reduction.
#
# TEACHING POINT:
#   This visualization helps students see that chunks from the
#   same document (same topic) cluster together in embedding space.
#   That clustering is what makes semantic search work.
#
# DEMO:
#   1. POST /ingest to load documents
#   2. GET /visualize -> t-SNE scatter plot (default)
#   3. GET /visualize?method=pca -> PCA scatter plot
#   4. Notice how leave-policy chunks cluster together,
#      coding-standards chunks cluster together, etc.
# ============================================================

from fastapi import APIRouter, Query
from fastapi.responses import Response
from app.rag.visualize import generate_embedding_plot

router = APIRouter(prefix="/visualize", tags=["Visualization"])


# Purpose:
# Returns a PNG scatter plot of all stored chunk embeddings,
# reduced to 2D and colored by source document.
@router.get("")
def visualize_embeddings(
    method: str = Query(
        default="tsne",
        description="Dimensionality reduction method: 'tsne' or 'pca'.",
    ),
):
    """
    Render a 2D scatter plot of all chunk embeddings.

    Chunks from the same source document are colored the same.
    Nearby points = semantically similar chunks.
    """
    png_bytes = generate_embedding_plot(method=method)
    return Response(content=png_bytes, media_type="image/png")
