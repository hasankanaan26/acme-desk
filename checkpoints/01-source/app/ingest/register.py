# ============================================================
# Register — what the source system knows ABOUT each document
# ============================================================
# A document's text tells you what it says. It does not tell you:
#   - who may read it          (allowed_groups)
#   - whether it is in force   (status: current / superseded / draft)
#   - from when, until when    (effective_from / effective_to)
#   - what replaced it         (superseded_by / supersedes / amends)
#   - who to ask when it is wrong (owner)
#
# That metadata lives in the source system: SharePoint permissions,
# the policy register, the document control list. It travels with
# every chunk into the index, because a filter can only use what was
# stored at ingest time. There is no second chance at query time.
#
# Two rules this file enforces:
#   - FAIL CLOSED: a file with no register entry is not indexed. No
#     entry means no permissions, and no permissions means nobody.
#   - Drafts and withdrawn documents never enter the index.
# ============================================================

import json
from dataclasses import dataclass, field
from pathlib import Path

STATUSES = {"current", "superseded", "draft", "withdrawn"}
INDEXABLE_STATUSES = {"current", "superseded"}
OPEN_ENDED = 99991231  # effective_to for documents still in force


@dataclass
class DocEntry:
    doc_id: str
    path: str
    title: str
    owner: str
    doc_type: str
    topic: str
    allowed_groups: list[str]
    status: str
    version: int
    effective_from: str
    effective_to: str | None = None
    superseded_by: str | None = None
    supersedes: list[str] = field(default_factory=list)
    amends: str | None = None
    depends_on: list[str] = field(default_factory=list)

    @property
    def indexable(self) -> bool:
        return self.status in INDEXABLE_STATUSES

    def labels(self) -> dict:
        """The metadata every chunk of this document carries in the index."""
        return {
            "doc_id": self.doc_id,
            "title": self.title,
            "owner": self.owner,
            "doc_type": self.doc_type,
            "status": self.status,
            "version": self.version,
            "effective_from": date_int(self.effective_from),
            "effective_to": date_int(self.effective_to) if self.effective_to else OPEN_ENDED,
            "superseded_by": self.superseded_by or "",
            "allowed_groups": ",".join(sorted(self.allowed_groups)),
        }


class RegisterError(ValueError):
    pass


# Purpose:
# "2026-11-01" -> 20261101. Integers compare correctly, so the vector
# store can filter on dates with $lte / $gt.
def date_int(value: str | None) -> int:
    if not value:
        return OPEN_ENDED
    return int(value.replace("-", ""))


# Purpose:
# Parse and check the register. A bad register stops the sync before it
# touches the index: indexing with wrong permissions is worse than not
# indexing at all.
def load_register(raw: dict) -> dict[str, DocEntry]:
    """Return {path: DocEntry}. Raises RegisterError on bad data."""
    entries: dict[str, DocEntry] = {}
    seen_ids: set[str] = set()
    for i, item in enumerate(raw.get("documents", [])):
        try:
            entry = DocEntry(
                doc_id=item["doc_id"],
                path=item["path"],
                title=item["title"],
                owner=item["owner"],
                doc_type=item["doc_type"],
                topic=item.get("topic", ""),
                allowed_groups=list(item["allowed_groups"]),
                status=item["status"],
                version=int(item.get("version", 1)),
                effective_from=item["effective_from"],
                effective_to=item.get("effective_to"),
                superseded_by=item.get("superseded_by"),
                supersedes=list(item.get("supersedes", [])),
                amends=item.get("amends"),
                depends_on=list(item.get("depends_on", [])),
            )
        except KeyError as missing:
            raise RegisterError(f"register entry #{i + 1} is missing {missing}") from None
        if entry.status not in STATUSES:
            raise RegisterError(f"{entry.doc_id}: unknown status {entry.status!r}")
        if not entry.allowed_groups:
            raise RegisterError(f"{entry.doc_id}: allowed_groups is empty")
        if entry.doc_id in seen_ids:
            raise RegisterError(f"duplicate doc_id {entry.doc_id}")
        if entry.path in entries:
            raise RegisterError(f"two entries for {entry.path}")
        seen_ids.add(entry.doc_id)
        entries[entry.path] = entry
    return entries


# Purpose:
# Things a person should look at. Not errors: the sync still runs.
def register_warnings(entries: dict[str, DocEntry]) -> list[str]:
    warnings = []
    by_id = {e.doc_id: e for e in entries.values()}

    # Two current documents on the same topic, and neither amends or
    # supersedes the other: which one is the truth? Ask the owners.
    current = [e for e in entries.values() if e.status == "current" and e.topic]
    for i, a in enumerate(current):
        for b in current[i + 1:]:
            if a.topic != b.topic:
                continue
            linked = (a.amends == b.doc_id or b.amends == a.doc_id
                      or a.doc_id in b.supersedes or b.doc_id in a.supersedes)
            if not linked:
                warnings.append(
                    f"two current documents on topic '{a.topic}': {a.doc_id} ({a.owner}) "
                    f"and {b.doc_id} ({b.owner}). Ask the owners which one is canonical."
                )

    # Superseded documents should say what replaced them.
    for e in entries.values():
        if e.status == "superseded" and e.superseded_by not in by_id:
            warnings.append(f"{e.doc_id} is superseded but superseded_by={e.superseded_by!r} is not in the register")
    return warnings


# Purpose:
# Documents that quote another document go stale when it changes.
# The index cannot fix that; the owner can, if someone tells them.
def dependents_of(doc_ids: set[str], entries: dict[str, DocEntry]) -> list[tuple[DocEntry, str]]:
    found = []
    for e in entries.values():
        for dep in e.depends_on:
            if dep in doc_ids:
                found.append((e, dep))
    return found


# ---- Identities: who is asking ----

def load_identities(path: Path) -> dict[str, dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["users"]


# Purpose:
# Turn a user into their groups. In production this comes from the
# identity provider after login, NEVER from a field the caller can type.
# Unknown user -> error, not "no filter". Fail closed.
def groups_for(user: str, identities: dict[str, dict]) -> list[str]:
    if user not in identities:
        raise PermissionError(f"unknown user {user!r}; known users: {', '.join(sorted(identities))}")
    return list(identities[user]["groups"])


def all_groups(identities: dict[str, dict], entries: dict[str, DocEntry] | None = None) -> list[str]:
    """Every group name we know about (ACL flags are written for each)."""
    groups = {g for u in identities.values() for g in u["groups"]}
    for e in (entries or {}).values():
        groups.update(e.allowed_groups)
    return sorted(groups)


def can_read(allowed_groups: list[str], user_groups: list[str]) -> bool:
    return bool(set(allowed_groups) & set(user_groups))
