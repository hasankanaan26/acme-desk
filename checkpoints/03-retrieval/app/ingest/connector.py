# ============================================================
# Connector — talks to the source system
# ============================================================
# Every enterprise source (SharePoint, Google Drive, Confluence,
# Slack, S3) answers the same three questions:
#
#   1. What items exist right now?      -> list_items()
#   2. Give me the bytes of this item.  -> fetch()
#   3. What do you know ABOUT it?       -> fetch_register()
#      (owner, who may read it, status, dates)
#
# Two connectors answer them here:
#   LocalFolderConnector   workspace/local-drive, a folder that plays
#                          the document library offline (SOURCE=local)
#   DriveConnector         a real Google Drive folder, read through a
#                          service account (SOURCE=drive), in
#                          connector_drive.py
# make_connector() picks one from the tenant's row in Postgres (Part 1:
# from .env). Nothing else in the pipeline knows which one it got.
# Part 2: question 3 is answered by Postgres for every source (see
# registry.py), wrapped around whichever connector answers 1 and 2.
#
# THE SAME THING IN SHAREPOINT (Microsoft Graph), for reference:
#   GET /drives/{drive-id}/root/delta              -> what changed, with eTags
#   GET /drives/{drive-id}/items/{id}/content      -> the bytes
#   GET /drives/{drive-id}/items/{id}/permissions  -> who may read it
#   Auth: an app registration (service principal), not a person's token.
#
# TEACHING POINT:
#   The eTag is the cheap change signal: it moves whenever the bytes
#   move, and the source hands it out with the listing, so unchanged
#   files are never downloaded. Google Drive reports an MD5 of every
#   uploaded file (md5Checksum). The local connector computes the same
#   MD5, so the same bytes get the same eTag on both sides.
# ============================================================

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.config import DRIVE_DOC_EXPORT, DRIVE_SA_KEY, REGISTER_FILENAME


def etag_of(data: bytes) -> str:
    """The change signal for a file: an MD5 of its bytes, the number Drive calls md5Checksum."""
    return hashlib.md5(data).hexdigest()


@dataclass
class SourceItem:
    """One file in the source system."""
    path: str        # relative path with forward slashes, e.g. "hr/leave-policy.md"
    size: int        # bytes
    modified: float  # last-modified time (seconds since epoch)
    etag: str        # changes whenever the bytes change


class Connector(Protocol):
    """What the sync job needs from any source system. Both connectors fit this shape."""

    def list_items(self) -> list[SourceItem]: ...
    def fetch(self, path: str) -> bytes: ...
    def fetch_register(self) -> dict: ...
    def source_url(self, path: str) -> str: ...


class LocalFolderConnector:
    """A document library on disk, playing Google Drive (or SharePoint) offline."""

    def __init__(self, root: Path):
        self.root = Path(root)

    # Purpose:
    # Walk the library and describe every file. Nothing is parsed here.
    def list_items(self) -> list[SourceItem]:
        if not self.root.exists():
            raise FileNotFoundError(
                f"No source at {self.root}. Run: python fake_drive.py reset"
            )
        items = []
        for path in sorted(self.root.rglob("*")):
            if not path.is_file() or path.name == REGISTER_FILENAME or path.name.startswith("."):
                continue
            data = path.read_bytes()
            items.append(SourceItem(
                path=path.relative_to(self.root).as_posix(),
                size=len(data),
                modified=path.stat().st_mtime,
                etag=etag_of(data),
            ))
        return items

    def fetch(self, path: str) -> bytes:
        """Download one item."""
        return (self.root / path).read_bytes()

    def fetch_register(self) -> dict:
        """The library's metadata: one entry per document (see register.py)."""
        register_path = self.root / REGISTER_FILENAME
        if not register_path.exists():
            raise FileNotFoundError(f"No {REGISTER_FILENAME} in {self.root}")
        return json.loads(register_path.read_text(encoding="utf-8"))

    def source_url(self, path: str) -> str:
        """The link a user would click in a citation. Offline, that is the file itself."""
        return (self.root / path).resolve().as_uri()


# Purpose:
# The connector for the tenant this transaction acts for (Part 2: the
# tenants table says where its documents are). The register always
# comes from Postgres, whatever the source.
def make_connector(tenant: dict | None = None, with_acl: bool = False) -> Connector:
    from app.ingest.registry import DbRegister, current_tenant_row, resolve_source_dir

    tenant = tenant or current_tenant_row()
    if tenant["source_kind"] == "drive":
        from app.ingest.connector_drive import DriveConnector  # lazy: the Google libraries load only when used

        inner = DriveConnector(tenant["source_ref"], DRIVE_SA_KEY, DRIVE_DOC_EXPORT)
    else:
        inner = LocalFolderConnector(resolve_source_dir(tenant["source_ref"]))
    return DbRegister(inner, with_acl=with_acl)
