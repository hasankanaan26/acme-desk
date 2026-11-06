# ============================================================
# Sync — the ingestion JOB (replaces POST /ingest)
# ============================================================
# Checkpoint 4's /ingest read a folder and upserted every chunk.
# Run it against a source that CHANGES and five things go wrong:
#
#   1. A deleted file's chunks stay searchable forever.
#   2. A file that got shorter leaves its old last chunks behind
#      (ids are "<file>_<n>": the new version only overwrites 0..k).
#   3. Every run re-embeds every chunk, changed or not.
#   4. Nobody knows who may read what, or which version is in force.
#   5. ?fresh=true empties the index BEFORE rebuilding it.
#
# This job compares the source with the index, document by
# document, and decides one action for each:
#
#   add        new document                 -> parse, embed, insert
#   change     its text changed             -> embed, then delete old + insert new
#   relabel    only metadata changed        -> update labels, no embedding
#              (who may read it, status, dates)
#   touch      bytes changed, text did not  -> update the eTag only
#              (a footer, a timestamp)
#   remove     gone, withdrawn, now a draft -> delete every chunk
#   quarantine cannot be read (a scan)      -> not indexed, reported
#   skip       never to be indexed (draft, no register entry)
#   unchanged  same eTag                    -> not even downloaded
#
# Then it prices the run, and only spends money when you --apply.
#
# HOW A CHANGE IS DETECTED (cheapest check first):
#   eTag          from the source, changes when the bytes change
#   content hash  SHA-256 of the chunks we WOULD store, after
#                 parsing, redaction and chunking, plus the pipeline
#                 and parser versions. Same hash = same vectors.
#   labels        the register fields every chunk carries
# ============================================================

import hashlib
import json
import math
import time
from dataclasses import dataclass, field
from datetime import datetime

from app.config import (
    CORPORATE_EMAIL_DOMAINS,
    EMBED_BATCH_SIZE,
    EMBEDDING_PRICE_PER_1M_TOKENS,
    IDENTITIES_FILE,
    PIPELINE_VERSION,
    RUNS_DIR,
    SECTION_MAX_CHARS,
)
from app.ingest.connector import Connector, make_connector
from app.ingest.parsers import PARSER_VERSION, Section, parse
from app.ingest.pii import redact
from app.ingest.register import (
    DocEntry,
    all_groups,
    dependents_of,
    load_identities,
    load_register,
    register_warnings,
)
from app.rag import catalog, store
from app.rag.chunker import chunk_sections
from app.rag.embedder import embed_texts, embedding_model_id, estimate_tokens, get_provider

ACTION_ORDER = ["add", "change", "relabel", "touch", "remove", "quarantine", "skip", "unchanged"]


class ModelMismatch(RuntimeError):
    """The live index was built with a different embedding model."""


@dataclass
class DocPlan:
    doc_id: str
    path: str
    action: str
    reason: str
    chunks: list[dict] = field(default_factory=list)
    labels: dict = field(default_factory=dict)
    pii: dict = field(default_factory=dict)
    remove_old: bool = False
    signals: dict = field(default_factory=dict)  # the evidence behind the action, see _signals()


@dataclass
class SyncPlan:
    collection: str
    embedding_model: str
    full_build: bool
    docs: list[DocPlan]
    warnings: list[str]

    def counts(self) -> dict[str, int]:
        counts = {a: 0 for a in ACTION_ORDER}
        for d in self.docs:
            counts[d.action] += 1
        return {a: n for a, n in counts.items() if n}

    def chunks_to_embed(self) -> list[dict]:
        return [c for d in self.docs if d.action in ("add", "change") for c in d.chunks]


# ---- Building the plan (reads the source and the index, writes nothing) ----

def doc_labels(entry: DocEntry, groups: list[str], connector: Connector) -> dict:
    """Everything a chunk of this document carries, except its own text."""
    labels = entry.labels()
    labels.update({f"acl_{g}": g in entry.allowed_groups for g in groups})
    labels["source"] = entry.path
    labels["source_url"] = connector.source_url(entry.path)
    return labels


def content_hash(chunks: list[dict]) -> str:
    h = hashlib.sha256(f"{PIPELINE_VERSION}|{PARSER_VERSION}|{SECTION_MAX_CHARS}".encode())
    for chunk in chunks:
        h.update(b"\x00" + chunk["text"].encode("utf-8"))
    return h.hexdigest()[:16]


def _label_changes(old: dict, new: dict) -> list[str]:
    changes, acl_only = [], False
    for key, value in new.items():
        if old.get(key) == value:
            continue
        if key.startswith("acl_"):
            acl_only = True
            continue
        changes.append(f"{key}: {old.get(key)!r} -> {value!r}")
    if acl_only and not changes:
        changes.append("access flags updated")
    return changes


# Purpose:
# The evidence behind one decision, shown in the UI's plan table:
# the eTag and content hash the index holds next to the ones the
# source has now. None = not known: the document is not in the index,
# the file is gone, or (hash_source) it was never downloaded because
# the eTag already matched.
def _signals(old: dict | None, etag_source: str | None = None, hash_source: str | None = None) -> dict:
    old = old or {}
    return {"etag_index": old.get("etag"), "etag_source": etag_source,
            "hash_index": old.get("content_hash"), "hash_source": hash_source}


def redact_sections(sections: list[Section]) -> tuple[list[Section], dict]:
    totals: dict[str, int] = {}
    cleaned = []
    for s in sections:
        heading, c1 = redact(s.heading, CORPORATE_EMAIL_DOMAINS)
        text, c2 = redact(s.text, CORPORATE_EMAIL_DOMAINS)
        for counts in (c1, c2):
            for k, v in counts.items():
                totals[k] = totals.get(k, 0) + v
        cleaned.append(Section(heading, text))
    return cleaned, totals


# Purpose:
# Compare the source with the index and decide what to do with every
# document. Reads only. Safe to run at any time.
def build_plan(connector: Connector, collection: str | None, full: bool = False) -> SyncPlan:
    entries = load_register(connector.fetch_register())
    groups = all_groups(load_identities(IDENTITIES_FILE), entries)
    items = {item.path: item for item in connector.list_items()}
    exists = bool(collection) and store.collection_exists(collection)
    state = store.index_state(collection) if (exists and not full) else {}

    docs: list[DocPlan] = []
    warnings: list[str] = []

    for entry in sorted(entries.values(), key=lambda e: e.doc_id):
        old = state.get(entry.doc_id)
        path = entry.path

        item = items.get(path)
        etag = item.etag if item else None

        if not entry.indexable:
            if old:
                docs.append(DocPlan(entry.doc_id, path, "remove", f"status is now {entry.status}",
                                    signals=_signals(old, etag)))
            else:
                docs.append(DocPlan(entry.doc_id, path, "skip", f"status is {entry.status}: never indexed",
                                    signals=_signals(old, etag)))
            continue

        if item is None:
            warnings.append(f"{entry.doc_id} is in the register but {path} is not in the source")
            docs.append(DocPlan(entry.doc_id, path, "remove" if old else "skip", "file missing from the source",
                                signals=_signals(old)))
            continue

        labels = doc_labels(entry, groups, connector)

        # Cheapest check first: same eTag means same bytes. Don't download.
        if old and old.get("etag") == item.etag:
            changes = _label_changes(old, labels)
            if changes:
                docs.append(DocPlan(entry.doc_id, path, "relabel", "; ".join(changes), labels=labels,
                                    signals=_signals(old, etag)))
            else:
                docs.append(DocPlan(entry.doc_id, path, "unchanged", "same eTag: not downloaded",
                                    signals=_signals(old, etag)))
            continue

        parsed = parse(path, connector.fetch(path))
        if parsed.needs_ocr or not parsed.sections:
            docs.append(DocPlan(entry.doc_id, path, "quarantine", parsed.note or "the parser found no text",
                                remove_old=bool(old), signals=_signals(old, etag)))
            continue
        if parsed.note:
            warnings.append(f"{entry.doc_id}: {parsed.note}")

        sections, pii = redact_sections(parsed.sections)
        pieces = chunk_sections(sections, entry.title, SECTION_MAX_CHARS)
        chash = content_hash(pieces)
        chunks = [{
            "id": f"{entry.doc_id}::{p['chunk_index']:03d}",
            "text": p["text"],
            "metadata": {
                **labels,
                "section": p["section"],
                "chunk_index": p["chunk_index"],
                "content_hash": chash,
                "etag": item.etag,
                "parser": parsed.parser,
                "pii_redactions": sum(pii.values()),
            },
        } for p in pieces]

        if not old:
            plan = DocPlan(entry.doc_id, path, "add", f"new: {len(chunks)} chunk(s) from the {parsed.parser} parser",
                           chunks=chunks)
        elif old.get("content_hash") != chash:
            plan = DocPlan(entry.doc_id, path, "change",
                           f"text changed: {old['chunks']} old chunk(s) out, {len(chunks)} new in", chunks=chunks)
        else:
            changes = _label_changes(old, labels)
            new_labels = {**labels, "etag": item.etag}
            if changes:
                plan = DocPlan(entry.doc_id, path, "relabel", "; ".join(changes), labels=new_labels)
            else:
                plan = DocPlan(entry.doc_id, path, "touch",
                               "bytes changed but the extracted text is identical: no re-embedding",
                               labels=new_labels)
        plan.pii = pii
        plan.signals = _signals(old, etag, chash)
        docs.append(plan)

    # In the index, but the source no longer knows the document.
    known = {e.doc_id for e in entries.values()}
    for doc_id, old in sorted(state.items()):
        if doc_id not in known:
            docs.append(DocPlan(doc_id, old.get("source", ""), "remove",
                                "no longer in the register (deleted at the source)", signals=_signals(old)))

    # In the source, but nobody registered it: fail closed.
    for path in sorted(set(items) - set(entries)):
        docs.append(DocPlan("(none)", path, "skip", "no register entry, so no permissions: not indexed"))

    warnings.extend(register_warnings(entries))

    # Documents that quote a document that just changed may now be wrong.
    # (Skipped on a full build: everything is "new" then, nothing changed.)
    full_build = full or not exists
    if not full_build:
        touched = {d.doc_id for d in docs if d.action in ("add", "change", "remove")
                   or (d.action == "relabel" and "status" in d.reason)}
        for dependent, dep in dependents_of(touched, entries):
            warnings.append(f"{dependent.doc_id} quotes {dep}, which changed in this sync. "
                            f"Ask {dependent.owner} to review it.")

    return SyncPlan(collection or "(new)", embedding_model_id(), full_build, docs, warnings)


# ---- Applying the plan ----

# Purpose:
# Do what the plan says. Embeds FIRST, so a failed embedding batch
# leaves the index exactly as it was: nothing is deleted until the new
# vectors exist.
def apply_plan(plan: SyncPlan) -> dict:
    started = time.time()
    to_embed = plan.chunks_to_embed()
    vectors = embed_texts([c["text"] for c in to_embed])
    vector_of = {c["id"]: v for c, v in zip(to_embed, vectors)}

    name = plan.collection
    for d in plan.docs:
        if d.action == "add":
            store.add_chunks(d.chunks, [vector_of[c["id"]] for c in d.chunks], name)
        elif d.action == "change":
            store.delete_doc(d.doc_id, name)
            store.add_chunks(d.chunks, [vector_of[c["id"]] for c in d.chunks], name)
        elif d.action in ("relabel", "touch"):
            store.update_doc_labels(d.doc_id, d.labels, name)
        elif d.action == "remove" or (d.action == "quarantine" and d.remove_old):
            store.delete_doc(d.doc_id, name)

    total = store.count(name)
    catalog.record_collection(name, {
        "embedding_model": plan.embedding_model,
        "pipeline_version": PIPELINE_VERSION,
        "last_sync": datetime.now().isoformat(timespec="seconds"),
        "chunks": total,
    })
    report = summarize(plan, applied=True)
    report["seconds"] = round(time.time() - started, 2)
    report["chunks_in_index"] = total
    report["embed_batches"] = math.ceil(len(to_embed) / EMBED_BATCH_SIZE) if to_embed else 0
    return report


# Purpose:
# Before a new index goes live: does it contain what the plan said?
def smoke_check(plan: SyncPlan) -> list[str]:
    problems = []
    if store.count(plan.collection) == 0:
        problems.append("the new index is empty")
    state = store.index_state(plan.collection) if store.count(plan.collection) else {}
    for d in plan.docs:
        if d.action == "add" and d.doc_id not in state:
            problems.append(f"{d.doc_id} was planned but has no chunks")
    return problems


def summarize(plan: SyncPlan, applied: bool) -> dict:
    texts = [c["text"] for c in plan.chunks_to_embed()]
    tokens = estimate_tokens(texts)
    price = EMBEDDING_PRICE_PER_1M_TOKENS.get(get_provider(), 0.0)
    return {
        "applied": applied,
        "collection": plan.collection,
        "embedding_model": plan.embedding_model,
        "full_build": plan.full_build,
        "counts": plan.counts(),
        "chunks_to_embed": len(texts),
        "estimated_tokens": tokens,
        "price_per_1m_tokens": price,
        "estimated_cost_usd": round(tokens / 1_000_000 * price, 6),
        # What the same run would cost with a cloud embedding model, for scale.
        "estimated_cost_at_gemini_prices_usd": round(
            tokens / 1_000_000 * EMBEDDING_PRICE_PER_1M_TOKENS["gemini"], 6),
        "warnings": plan.warnings,
        "documents": [
            {"doc_id": d.doc_id, "path": d.path, "action": d.action, "reason": d.reason,
             "chunks": len(d.chunks), "pii": d.pii, "signals": d.signals}
            for d in plan.docs
        ],
    }


def write_report(report: dict) -> str:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"sync-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return str(path)


# ---- The entry point the CLI and the API share ----

# Purpose:
# One sync run. Without apply=True it only plans. With rebuild=True it
# builds a NEW collection next to the live one and switches over only
# if the smoke check passes (blue/green).
def run_sync(apply: bool = False, rebuild: bool = False, connector: Connector | None = None) -> dict:
    connector = connector or make_connector()
    active = catalog.active_name()
    if active and not store.collection_exists(active):
        active = None
    built_with = catalog.active_info().get("embedding_model")
    model = embedding_model_id()

    if active and not rebuild and built_with and built_with != model:
        raise ModelMismatch(
            f"The live index was built with {built_with}, but the embedder is now {model}. "
            "Vectors from two models cannot share an index. Run: python sync.py --rebuild"
        )

    new_index = rebuild or not active
    target = catalog.new_collection_name() if new_index else active
    plan = build_plan(connector, target, full=new_index)

    if not apply:
        return summarize(plan, applied=False)

    report = apply_plan(plan)
    if new_index:
        problems = smoke_check(plan)
        report["smoke_check"] = problems or ["ok"]
        if problems:
            report["activated"] = False
            report["report_file"] = write_report(report)
            return report
        previous = catalog.active_name()
        catalog.activate(target)
        report["activated"] = True
        report["previous_collection"] = previous
    report["report_file"] = write_report(report)
    return report
