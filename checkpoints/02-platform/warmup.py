"""
warmup.py — download the local embedding model BEFORE class.

    python checkpoints/01-source/warmup.py      (or python warmup.py from the repo root)

The first embedding call downloads all-MiniLM-L6-v2 (about 80 MB) to
~/.cache/chroma. On slow Wi-Fi that takes minutes, so do it at home.
After that, everything in this checkpoint runs offline and free.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.rag.embedder import embed_texts, embedding_model_id  # noqa: E402

start = time.time()
print(f"Loading {embedding_model_id()} (first time: downloads about 80 MB)...")
vectors = embed_texts(["How many vacation days do I get?", "Employees receive 20 days of annual leave."])
print(f"Ready: {len(vectors[0])}-dimension vectors in {time.time() - start:.1f}s. You're set for class.")
