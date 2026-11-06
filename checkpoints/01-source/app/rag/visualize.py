# ============================================================
# Embedding Visualization — t-SNE / PCA scatter plots
# ============================================================
# Reduces high-dimensional chunk embeddings to 2D for visualization.
# Helps students see that semantically similar chunks cluster together.
#
# TEACHING POINT:
#   Embeddings live in high-dimensional space (768+ dimensions).
#   We can't visualize that directly, but dimensionality reduction
#   techniques like t-SNE and PCA can project them to 2D while
#   preserving relative distances. Clusters in the plot correspond
#   to chunks about the same topic.
#
# USAGE:
#   from app.rag.visualize import generate_embedding_plot
#   png_bytes = generate_embedding_plot(method="tsne")
# ============================================================

import io
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for server use
import matplotlib.pyplot as plt
from app.rag import store


# Purpose:
# Fetches all stored embeddings and their source labels from the
# active vector store (ChromaDB or Postgres).
# Returns the full embedding vectors (not just previews).
def get_all_embeddings() -> tuple[list[list[float]], list[str]]:
    """
    Pull all embeddings and source labels from the vector store.

    Returns:
        (embeddings, sources) where embeddings is a list of vectors
        and sources is a list of source filenames, one per chunk.
    """
    return store.get_all_embeddings()


# Purpose:
# Applies t-SNE or PCA to reduce embedding vectors from N dimensions to 2D.
# This makes them plottable while preserving relative distances.
def reduce_dimensions(
    embeddings: list[list[float]],
    method: str = "tsne",
) -> list[list[float]]:
    """
    Reduce embedding dimensions to 2D using t-SNE or PCA.

    Args:
        embeddings: List of high-dimensional vectors.
        method: "tsne" or "pca".

    Returns:
        List of [x, y] coordinates, one per input embedding.
    """
    import numpy as np

    matrix = np.array(embeddings)

    if method == "pca":
        from sklearn.decomposition import PCA
        reducer = PCA(n_components=2, random_state=42)
    else:
        from sklearn.manifold import TSNE
        # Perplexity must be less than the number of samples
        perplexity = min(30, max(2, len(embeddings) - 1))
        reducer = TSNE(
            n_components=2,
            perplexity=perplexity,
            random_state=42,
            max_iter=500,
        )

    coords = reducer.fit_transform(matrix)
    return coords.tolist()


# Purpose:
# Creates a 2D scatter plot of all stored chunk embeddings,
# colored by source document, and returns it as PNG bytes.
def generate_embedding_plot(method: str = "tsne") -> bytes:
    """
    Generate a scatter plot PNG of all chunk embeddings.

    Each dot is a chunk. Color indicates source document.
    Nearby dots = semantically similar chunks.

    Args:
        method: "tsne" or "pca" for dimensionality reduction.

    Returns:
        PNG image as bytes.
    """
    embeddings, sources = get_all_embeddings()

    if len(embeddings) < 2:
        # Not enough data to visualize — return a message plot
        fig, ax = plt.subplots(figsize=(8, 6))
        ax.text(
            0.5, 0.5,
            "Not enough data to visualize.\nIngest documents first (POST /ingest).",
            ha="center", va="center", fontsize=14, color="#666",
            transform=ax.transAxes,
        )
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.read()

    # Reduce to 2D
    coords = reduce_dimensions(embeddings, method=method)

    # Assign colors by source document
    unique_sources = sorted(set(sources))
    color_map = matplotlib.colormaps["tab10"]
    source_colors = {src: color_map(i / max(1, len(unique_sources) - 1)) for i, src in enumerate(unique_sources)}

    # Plot
    fig, ax = plt.subplots(figsize=(10, 8))

    for src in unique_sources:
        xs = [coords[i][0] for i in range(len(sources)) if sources[i] == src]
        ys = [coords[i][1] for i in range(len(sources)) if sources[i] == src]
        ax.scatter(xs, ys, label=src, color=source_colors[src], alpha=0.7, s=50)

    method_label = "t-SNE" if method == "tsne" else "PCA"
    ax.set_title(f"Chunk Embeddings — {method_label} Projection", fontsize=14)
    ax.set_xlabel(f"{method_label} Dimension 1")
    ax.set_ylabel(f"{method_label} Dimension 2")
    ax.legend(
        title="Source Document",
        bbox_to_anchor=(1.05, 1),
        loc="upper left",
        fontsize=8,
    )
    ax.grid(True, alpha=0.3)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()
