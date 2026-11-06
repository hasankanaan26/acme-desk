# ============================================================
# Test setup — offline, isolated, no API keys, no Google account
# ============================================================
# Run from the repository root:
#   pytest checkpoints/01-source/tests -q
#
# Before any app module is imported, point every path at a temp
# folder, pick the local source, switch the embedder to "fake"
# (hash-based vectors) and keep the scheduler off. Nothing here
# touches your real index, your .env keys, Drive or the network.
# ============================================================

import os
import sys
import tempfile
from pathlib import Path

import pytest

CHECKPOINT = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="acme-01-tests-"))

os.environ["SOURCE"] = "local"
os.environ["SOURCE_DIR"] = str(TMP / "local-drive")
os.environ["CHROMA_PATH"] = str(TMP / "chroma")
os.environ["ACME_RUNS_DIR"] = str(TMP / "runs")
os.environ["EMBEDDING_PROVIDER"] = "fake"
os.environ["EMBED_RETRY_BASE_SECONDS"] = "0"
os.environ["SYNC_INTERVAL_SECONDS"] = "0"
os.environ["ANONYMIZED_TELEMETRY"] = "False"
sys.path.insert(0, str(CHECKPOINT))


@pytest.fixture
def friday():
    """A fresh local drive (Friday) and no index at all."""
    import fake_drive
    from app.config import CATALOG_FILE
    from app.rag.store_chroma import drop_collection, get_client

    for col in get_client().list_collections():
        drop_collection(col if isinstance(col, str) else col.name)
    CATALOG_FILE.unlink(missing_ok=True)
    fake_drive.reset()
    return fake_drive


@pytest.fixture
def events():
    """Load the weekend's events by id."""
    import fake_drive
    return {e["id"]: e for e in fake_drive.load_events()}
