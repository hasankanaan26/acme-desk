# ============================================================
# Connector: Google Drive — the real document source
# ============================================================
# Same three questions as the local connector, answered by the
# Drive API through a service account (a robot identity with its
# own key, exactly like a SharePoint app registration).
#
# SharePoint (Microsoft Graph)                 Google Drive (this file)
#   GET /drives/{id}/root/delta                 files.list(q="'folder' in parents")
#     every changed item since the last call      one listing per folder; changes.list
#                                                 with a saved page token is the delta feed
#   eTag / cTag                                 md5Checksum  (uploaded files)
#                                               version      (native Docs and Sheets)
#   GET /items/{id}/content                     files.get(alt=media)   -> the bytes
#                                               files.export            -> a Doc, as markdown
#   GET /items/{id}/permissions                 permissions.list
#   app registration + client secret            service account + JSON key
#   Sites.Read.All                              scope drive.readonly
#
# TEACHING POINT:
#   Nothing downstream knows which of the two it is talking to. The
#   sync asks list_items(), compares eTags, and only then fetch()es
#   the few files whose eTag moved. A folder of 20 files costs 8
#   listing calls per tick and zero downloads when nothing changed.
#   With the change gate (gate.py, section 4 below) a tick in which
#   nothing changed costs ONE call, and the walk does not happen.
# ============================================================

import json
import logging
from datetime import datetime
from pathlib import Path

from app.config import REGISTER_FILE, REGISTER_FILENAME, REGISTER_SOURCE
from app.ingest.connector import SourceItem

log = logging.getLogger("acme.drive")

DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly"
FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
GOOGLE_NATIVE = "application/vnd.google-apps."

# Native Google files have no bytes of their own. We export them, and
# the exported format decides the suffix the parsers see.
#   doc_export       Google Doc                    Google Sheet
EXPORTS = {
    "markdown": {"document": ("text/markdown", ".md"), "spreadsheet": ("text/csv", ".csv")},
    "html": {"document": ("text/html", ".html"), "spreadsheet": ("text/csv", ".csv")},
}
LIST_FIELDS = "nextPageToken, files(id,name,mimeType,md5Checksum,version,modifiedTime,size,webViewLink)"
CHANGE_FIELDS = "nextPageToken, newStartPageToken, changes(fileId, removed, time, file(name, mimeType, trashed))"


# Purpose:
# An authenticated Drive client for the service account. Imported
# lazily so the local connector and the tests never need the Google
# libraries or the network.
def build_service(credentials_path: Path):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_file(str(credentials_path), scopes=[DRIVE_READONLY])
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _epoch(rfc3339: str | None) -> float:
    """Drive's modifiedTime ("2026-11-06T18:21:03.123Z") as seconds since the epoch."""
    if not rfc3339:
        return 0.0
    return datetime.fromisoformat(rfc3339.replace("Z", "+00:00")).timestamp()


class DriveConnector:
    """A Google Drive folder tree, read through a service account."""

    def __init__(self, root_folder_id: str, credentials_path: str | Path, doc_export: str = "markdown", service=None):
        if not root_folder_id:
            raise FileNotFoundError("DRIVE_ROOT_FOLDER_ID is not set. Copy the folder id from its URL into .env.")
        if doc_export not in EXPORTS:
            raise ValueError(f"DRIVE_DOC_EXPORT must be one of {sorted(EXPORTS)}, not {doc_export!r}")
        self.root_id = root_folder_id
        self.credentials_path = Path(credentials_path)
        self.doc_export = doc_export
        self._service = service          # tests inject a fake here
        self._by_path: dict[str, dict] = {}  # path -> the Drive file record, filled by list_items()
        self.api_calls = 0                   # requests sent, so the Sync tab can compare a check with a walk

    def service(self):
        if self._service is None:
            if not self.credentials_path.is_file():
                raise FileNotFoundError(
                    f"No service-account key at {self.credentials_path}. See docs/drive-setup.md."
                )
            self._service = build_service(self.credentials_path)
        return self._service

    # ---- 1. What items exist right now? ----

    def _children(self, folder_id: str) -> list[dict]:
        """One folder's direct children, following nextPageToken."""
        files, token = [], None
        while True:
            self.api_calls += 1
            response = self.service().files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields=LIST_FIELDS,
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute(num_retries=3)
            files.extend(response.get("files", []))
            token = response.get("nextPageToken")
            if not token:
                return files

    def _walk(self, folder_id: str, prefix: str):
        """Yield (path, record) for every file under a folder, depth first."""
        for record in sorted(self._children(folder_id), key=lambda f: f["name"]):
            mime = record["mimeType"]
            if mime == FOLDER:
                yield from self._walk(record["id"], f"{prefix}{record['name']}/")
            elif mime == SHORTCUT:
                log.warning("skipping shortcut %s%s: index the target, not the pointer", prefix, record["name"])
            else:
                yield f"{prefix}{record['name']}", record

    # Purpose:
    # The path the register knows and the change signal the source
    # gives away for free. Uploaded files carry an MD5 of their bytes;
    # native Docs carry a version counter that moves on every edit.
    def _identity(self, path: str, record: dict) -> tuple[str, str | None]:
        mime = record["mimeType"]
        if mime.startswith(GOOGLE_NATIVE):
            export = EXPORTS[self.doc_export].get(mime.removeprefix(GOOGLE_NATIVE))
            if export is None:
                return path, None  # a Form, a Drawing, a Site: nothing to parse
            suffix = export[1]
            if not path.lower().endswith(suffix):
                path = path + suffix
            return path, f"v{record.get('version', '0')}"
        return path, record.get("md5Checksum") or f"v{record.get('version', '0')}"

    # Purpose:
    # Walk the library and describe every file. Nothing is downloaded here.
    def list_items(self) -> list[SourceItem]:
        self._by_path = {}
        items = []
        for path, record in self._walk(self.root_id, ""):
            if record["name"] == REGISTER_FILENAME:
                self._by_path[REGISTER_FILENAME] = record  # kept for fetch_register()
                continue
            path, etag = self._identity(path, record)
            if etag is None:
                log.warning("skipping %s: unsupported Google type %s", path, record["mimeType"])
                continue
            self._by_path[path] = record
            items.append(SourceItem(
                path=path,
                size=int(record.get("size") or 0),
                modified=_epoch(record.get("modifiedTime")),
                etag=etag,
            ))
        return items

    # ---- 2. Give me the bytes of this item. ----

    def _record(self, path: str) -> dict:
        if path not in self._by_path:
            self.list_items()
        if path not in self._by_path:
            raise FileNotFoundError(f"{path} is not in the Drive folder (or the service account cannot see it)")
        return self._by_path[path]

    def fetch(self, path: str) -> bytes:
        """Download one item: the bytes of an upload, or an export of a native Doc."""
        record = self._record(path)
        mime = record["mimeType"]
        files = self.service().files()
        if mime.startswith(GOOGLE_NATIVE):
            export_mime = EXPORTS[self.doc_export][mime.removeprefix(GOOGLE_NATIVE)][0]
            request = files.export_media(fileId=record["id"], mimeType=export_mime)
        else:
            request = files.get_media(fileId=record["id"], supportsAllDrives=True)
        self.api_calls += 1
        data = request.execute(num_retries=3)
        return data if isinstance(data, bytes) else str(data).encode("utf-8")

    # ---- 3. What do you know ABOUT it? ----

    def fetch_register(self) -> dict:
        """The register: a local file by default, or _register.json in the Drive root."""
        if REGISTER_SOURCE == "drive":
            record = self._record(REGISTER_FILENAME)
            raw = self.service().files().get_media(fileId=record["id"], supportsAllDrives=True).execute(num_retries=3)
            return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        if not REGISTER_FILE.is_file():
            raise FileNotFoundError(f"No register at {REGISTER_FILE}")
        return json.loads(REGISTER_FILE.read_text(encoding="utf-8"))

    def source_url(self, path: str) -> str:
        """The link a user clicks in a citation: the real file in Drive."""
        record = self._by_path.get(path)
        return record.get("webViewLink", "") if record else ""

    # ---- 4. What changed since last time? (the change gate, gate.py) ----
    #
    # Drive keeps a change log, like Graph's /delta. Take a bookmark once
    # (getStartPageToken), then ask "what changed since this bookmark?"
    # (changes.list): the answer is the changed files and a new bookmark.
    # The worker asks this before every scheduled tick and skips the sync
    # when the answer is empty: one call instead of a walk of every folder.
    #
    # The log covers everything the service account can see, not just
    # this folder. Here it can only see this folder, so that is the same
    # thing; with a wider account, filter by parents first.

    def start_page_token(self) -> str:
        """A bookmark at "now" in Drive's change log."""
        self.api_calls += 1
        response = self.service().changes().getStartPageToken(supportsAllDrives=True).execute(num_retries=3)
        return response["startPageToken"]

    # Purpose:
    # Every change after the bookmark, and the bookmark to save for next
    # time. Follows nextPageToken until Drive hands out newStartPageToken.
    def changes_since(self, token: str) -> tuple[list[dict], str]:
        changes = []
        while True:
            self.api_calls += 1
            response = self.service().changes().list(
                pageToken=token,
                fields=CHANGE_FIELDS,
                pageSize=1000,
                includeRemoved=True,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute(num_retries=3)
            changes.extend(response.get("changes", []))
            if response.get("newStartPageToken"):
                return changes, response["newStartPageToken"]
            token = response["nextPageToken"]
