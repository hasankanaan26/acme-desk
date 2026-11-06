# ============================================================
# Judge — score retrieval against the source of truth
# ============================================================
# Two kinds of numbers, both computed WITHOUT an LLM:
#
# 1. Did the right document come back?            (quality)
#    Hit@5  1 if any expected document is in the top 5, else 0
#    MRR    1 / rank of the first expected document (0 if absent)
#
# 2. Did anything come back that must NOT?         (safety)
#    leak   a chunk this user is not allowed to read
#    stale  a chunk from a superseded document or a draft
#           (superseded is fine when the question asks "as of" a date)
#    ghost  a chunk whose document was deleted, or whose text is no
#           longer in the current version of the file
#    pii    a chunk containing a personal email or phone number
#    empty  a chunk with no text at all
#
# The truth comes from the source system as it is NOW: the register
# (status, permissions) and the files (current text). A deleted
# document is looked up in Friday's register to know who could read it.
#
# Safety numbers are counted per QUESTION: "4 of 31 questions put a
# forbidden chunk in front of the model". One is one too many.
# ============================================================

import json
import re
from dataclasses import dataclass

from app.config import CORPORATE_EMAIL_DOMAINS, SEED_DIR, SOURCE_DIR
from app.ingest.parsers import parse
from app.ingest.pii import redact
from app.ingest.register import can_read, load_register

FLAGS = ["leak", "stale", "ghost", "pii", "empty"]


@dataclass
class DocTruth:
    doc_id: str
    status: str            # current / superseded / draft / withdrawn / unregistered
    allowed_groups: list[str]
    exists: bool
    parsed_text: str       # what today's parsers + redaction produce (production chunks)
    raw_text: str          # what Checkpoint 4's loader produces (naive chunks)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


# Purpose:
# Build {path: DocTruth} from the live register (Part 2: Postgres, passed
# in as register.json-shaped `live_register`), the live files, and
# Friday's register for documents that have since disappeared.
def build_truth(live_register: dict) -> dict[str, DocTruth]:
    live = load_register(live_register)
    friday = load_register(json.loads((SEED_DIR / "register.json").read_text(encoding="utf-8")))
    truth: dict[str, DocTruth] = {}
    for path, entry in {**friday, **live}.items():
        file = SOURCE_DIR / path
        exists = path in live and file.exists()
        parsed_text = raw_text = ""
        if exists:
            data = file.read_bytes()
            sections = parse(path, data).sections
            parsed_text = _norm(" ".join(redact(s.text, CORPORATE_EMAIL_DOMAINS)[0] for s in sections))
            # raw_text stays "": Part 2 has no Checkpoint 4 naive index to judge
        status = entry.status if path in live else "withdrawn"
        truth[path] = DocTruth(entry.doc_id, status, entry.allowed_groups, exists, parsed_text, raw_text)
    return truth


# Purpose:
# What is wrong with this one chunk, for this user, for this question?
def judge_chunk(chunk: dict, truth: dict[str, DocTruth], user_groups: list[str], as_of: str | None,
                naive: bool) -> tuple[str, list[str]]:
    path = chunk.get("path") or chunk.get("source", "")
    doc = truth.get(path)
    text = chunk.get("text", "")
    flags = []
    if not text.strip():
        flags.append("empty")
    if doc is None:
        return "(unregistered)", flags + ["leak"]
    if not can_read(doc.allowed_groups, user_groups):
        flags.append("leak")
    if doc.status == "draft" or (doc.status == "superseded" and not as_of):
        flags.append("stale")
    # Production chunks start with a "<title> > <section>" header line.
    body = text if naive else text.split("\n", 1)[-1]
    current = doc.raw_text if naive else doc.parsed_text
    if not doc.exists or (body.strip() and _norm(body) not in current):
        flags.append("ghost")
    if redact(text, CORPORATE_EMAIL_DOMAINS)[1]:
        flags.append("pii")
    return doc.doc_id, flags


# Purpose:
# Score one question's top-k.
def score_question(q: dict, chunks: list[dict], truth: dict, user_groups: list[str], naive: bool) -> dict:
    judged = [judge_chunk(c, truth, user_groups, q.get("as_of"), naive) for c in chunks]
    doc_ids = [doc_id for doc_id, _ in judged]
    expected = set(q["expect"])
    rank = next((i + 1 for i, d in enumerate(doc_ids) if d in expected), None)
    flags = sorted({f for _, fs in judged for f in fs})
    return {
        "id": q["id"],
        "question": q["question"],
        "user": q["user"],
        "as_of": q.get("as_of"),
        "kind": q.get("kind", ""),
        "expect": q["expect"],
        "retrieved": [{"doc_id": d, "flags": fs} for d, fs in judged],
        "hit": bool(rank) if expected else None,
        "rank": rank,
        "flags": flags,
    }


def summarize(rows: list[dict]) -> dict:
    answerable = [r for r in rows if r["expect"]]
    n = len(rows)
    summary = {
        "questions": n,
        "answerable": len(answerable),
        "hit@5": round(sum(r["hit"] for r in answerable) / len(answerable), 3) if answerable else 0.0,
        "mrr": round(sum(1 / r["rank"] for r in answerable if r["rank"]) / len(answerable), 3) if answerable else 0.0,
    }
    for flag in FLAGS:
        summary[f"{flag}_questions"] = sum(1 for r in rows if flag in r["flags"])
    summary["clean_questions"] = sum(1 for r in rows if not r["flags"])
    return summary
