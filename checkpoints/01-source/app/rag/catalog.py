# ============================================================
# Catalog — which index is live (blue/green)
# ============================================================
# Checkpoint 4 rebuilt with POST /ingest?fresh=true: delete the
# collection, then re-embed everything. Between those two steps the
# index is EMPTY and every user gets "I don't know". If embedding
# fails halfway, it stays half-empty.
#
# Production does it the way you deploy code: build the new index
# NEXT TO the live one, check it, then switch a pointer.
#
#   catalog.json  ->  {"active": "acme_kb_20261109_091500",
#                      "previous": "acme_kb_20261108_220000", ...}
#
# Queries always read "active". A rebuild writes a new collection and
# only flips the pointer when the smoke checks pass. Rollback is
# flipping it back. Vector databases call this an "alias".
#
# When do you need a full rebuild instead of an incremental sync?
#   - you changed the embedding model (old vectors are incompatible)
#   - you changed chunking or parsing for every document
#   - you suspect the index drifted from the source
# ============================================================

import json
from datetime import datetime

from app.config import CATALOG_FILE


def load_catalog() -> dict:
    if CATALOG_FILE.exists():
        return json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    return {"active": None, "previous": None, "collections": {}}


def save_catalog(catalog: dict) -> None:
    CATALOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_FILE.write_text(json.dumps(catalog, indent=2), encoding="utf-8")


def active_name() -> str | None:
    return load_catalog()["active"]


def active_info() -> dict:
    catalog = load_catalog()
    return catalog["collections"].get(catalog["active"] or "", {})


def new_collection_name() -> str:
    return "acme_kb_" + datetime.now().strftime("%Y%m%d_%H%M%S")


def record_collection(name: str, info: dict) -> None:
    catalog = load_catalog()
    catalog["collections"][name] = {**catalog["collections"].get(name, {}), **info}
    save_catalog(catalog)


# Purpose:
# Point queries at a new collection. The old one is kept for rollback.
def activate(name: str) -> None:
    catalog = load_catalog()
    if catalog["active"] != name:
        catalog["previous"] = catalog["active"]
        catalog["active"] = name
    save_catalog(catalog)


def rollback() -> str:
    catalog = load_catalog()
    if not catalog["previous"]:
        raise RuntimeError("Nothing to roll back to.")
    catalog["active"], catalog["previous"] = catalog["previous"], catalog["active"]
    save_catalog(catalog)
    return catalog["active"]
