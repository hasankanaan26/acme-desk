# ============================================================
# Connector: OneDrive (and SharePoint) — through Microsoft Graph
# ============================================================
# Same three questions as the other connectors, answered by Graph.
# OneDrive for Business and a SharePoint document library are the
# same API (a "drive" of "driveItems"), so this one file covers both.
#
# Google Drive (connector_drive.py)            OneDrive / SharePoint (this file)
#   files.list(q="'folder' in parents")         GET /drives/{d}/items/{id}/children
#                                                 follow @odata.nextLink
#   md5Checksum / version                       file.hashes.quickXorHash, else cTag
#                                                 (cTag moves on content only, eTag on
#                                                 any change, a rename included)
#   files.get(alt=media)                        GET /drives/{d}/items/{id}/content
#                                                 (a 302 to a short-lived download URL)
#   native Docs need files.export               Word and Excel are real files:
#                                                 parsers.py reads .docx and .xlsx
#   shortcut                                    remoteItem (a "shortcut to My files")
#   webViewLink                                 webUrl
#   service account + JSON key                  app registration + client secret
#   scope drive.readonly                        Files.Read.All / Sites.Read.All
#
# Two ways to sign in (ONEDRIVE_AUTH):
#   app     client credentials: the app registration IS the identity,
#           no person involved. Work or school accounts only. Needs an
#           admin to grant the application permission Files.Read.All
#           (or Sites.Selected for one SharePoint site).
#   device  a person signs in once in the browser (device code flow);
#           the refresh token is kept in secrets/. The only way in for
#           a PERSONAL Microsoft account, whose OneDrive has no app-only
#           access at all. Delegated scope Files.Read.
#
# TEACHING POINT:
#   Exactly what docs/sharepoint-mapping.md promised: one file and a
#   third branch in make_connector(). sync.py, register.py, the store
#   and the retriever do not change.
# ============================================================

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import httpx

from app.config import REGISTER_FILE, REGISTER_FILENAME, REGISTER_SOURCE
from app.ingest.connector import SourceItem

log = logging.getLogger("acme.onedrive")

GRAPH = "https://graph.microsoft.com/v1.0"
LOGIN = "https://login.microsoftonline.com"
APP_SCOPE = "https://graph.microsoft.com/.default"      # whatever the admin granted the app
DEVICE_SCOPE = "Files.Read offline_access"              # read your own files, and keep a refresh token
CHILD_FIELDS = "id,name,size,file,folder,package,remoteItem,eTag,cTag,lastModifiedDateTime,lastModifiedBy,webUrl"
MAX_ATTEMPTS = 4          # per Graph call: the first try and three retries
MAX_RETRY_WAIT = 30.0     # seconds; Graph's Retry-After is honoured up to this


class GraphAuthError(RuntimeError):
    """Sign-in failed or was never done. The message says what to fix."""


def _epoch(iso: str | None) -> float:
    """Graph's lastModifiedDateTime ("2026-11-06T18:21:03Z") as seconds since the epoch."""
    if not iso:
        return 0.0
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _who(identity_set: dict | None) -> str:
    """lastModifiedBy as "Name <email>" (personal accounts often carry no email)."""
    user = (identity_set or {}).get("user") or {}
    name, email = user.get("displayName", ""), user.get("email", "")
    return f"{name} <{email}>" if name and email else name or email


# ---- Signing in ----

class AppAuth:
    """Client credentials: the app registration signs in as itself."""

    def __init__(self, tenant_id: str, client_id: str, client_secret: str, http: httpx.Client | None = None):
        missing = [n for n, v in (("ONEDRIVE_TENANT_ID", tenant_id), ("ONEDRIVE_CLIENT_ID", client_id),
                                  ("ONEDRIVE_CLIENT_SECRET", client_secret)) if not v]
        if missing:
            raise GraphAuthError(f"ONEDRIVE_AUTH=app needs {', '.join(missing)} in .env. See docs/onedrive-setup.md.")
        if tenant_id in ("common", "consumers", "organizations"):
            raise GraphAuthError("ONEDRIVE_AUTH=app needs your directory (tenant) id, not "
                                 f"{tenant_id!r}: app-only sign-in is always to one organisation.")
        self.tenant_id, self.client_id, self.client_secret = tenant_id, client_id, client_secret
        self.http = http or httpx.Client(timeout=30)
        self._token, self._expires = "", 0.0

    def token(self, force: bool = False) -> str:
        if force or not self._token or time.time() > self._expires - 60:
            body = _token_request(self.http, self.tenant_id, {
                "grant_type": "client_credentials", "client_id": self.client_id,
                "client_secret": self.client_secret, "scope": APP_SCOPE,
            })
            self._token, self._expires = body["access_token"], time.time() + float(body.get("expires_in", 3600))
        return self._token


class DeviceAuth:
    """A person signs in once (device code flow); the refresh token is kept on disk."""

    def __init__(self, tenant_id: str, client_id: str, cache_path: str | Path, http: httpx.Client | None = None):
        if not client_id:
            raise GraphAuthError("ONEDRIVE_AUTH=device needs ONEDRIVE_CLIENT_ID in .env. See docs/onedrive-setup.md.")
        self.tenant_id = tenant_id or "common"
        self.client_id = client_id
        self.cache_path = Path(cache_path)
        self.http = http or httpx.Client(timeout=30)
        self._token, self._expires = "", 0.0

    def _save(self, body: dict) -> None:
        self._token, self._expires = body["access_token"], time.time() + float(body.get("expires_in", 3600))
        if body.get("refresh_token"):  # Microsoft rotates it: always keep the newest
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps({
                "tenant_id": self.tenant_id, "client_id": self.client_id,
                "refresh_token": body["refresh_token"], "saved_at": time.time(),
            }), encoding="utf-8")

    def token(self, force: bool = False) -> str:
        if not force and self._token and time.time() < self._expires - 60:
            return self._token
        if not self.cache_path.is_file():
            raise GraphAuthError(f"Not signed in to OneDrive (no {self.cache_path}). "
                                 "Run: python checkpoints/01-source/onedrive_admin.py login")
        cached = json.loads(self.cache_path.read_text(encoding="utf-8"))
        self._save(_token_request(self.http, self.tenant_id, {
            "grant_type": "refresh_token", "client_id": self.client_id,
            "refresh_token": cached["refresh_token"], "scope": DEVICE_SCOPE,
        }))
        return self._token

    # Purpose:
    # The one interactive step: show a code, wait while the person
    # types it at microsoft.com/devicelogin and consents, keep the token.
    def login(self, say=print, sleep=time.sleep) -> None:
        response = self.http.post(f"{LOGIN}/{self.tenant_id}/oauth2/v2.0/devicecode",
                                  data={"client_id": self.client_id, "scope": DEVICE_SCOPE})
        flow = response.json()
        if response.status_code != 200:
            raise GraphAuthError(_explain(flow))
        say(flow["message"])
        interval, deadline = int(flow.get("interval", 5)), time.time() + int(flow.get("expires_in", 900))
        while time.time() < deadline:
            sleep(interval)
            response = self.http.post(f"{LOGIN}/{self.tenant_id}/oauth2/v2.0/token", data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": self.client_id, "device_code": flow["device_code"],
            })
            body = response.json()
            if response.status_code == 200:
                self._save(body)
                return
            if body.get("error") == "authorization_pending":
                continue
            if body.get("error") == "slow_down":
                interval += 5
                continue
            raise GraphAuthError(_explain(body))
        raise GraphAuthError("The sign-in code expired before it was used. Run login again.")


def _token_request(http: httpx.Client, tenant_id: str, data: dict) -> dict:
    response = http.post(f"{LOGIN}/{tenant_id}/oauth2/v2.0/token", data=data)
    body = response.json()
    if response.status_code != 200:
        raise GraphAuthError(_explain(body))
    return body


def _explain(body: dict) -> str:
    """Entra ID's error, plus the fix for the ones everybody hits on day one."""
    text = body.get("error_description") or body.get("error") or str(body)
    hints = {
        "AADSTS7000218": "Turn on 'Allow public client flows' (app registration > Authentication).",
        "AADSTS7000215": "ONEDRIVE_CLIENT_SECRET is wrong: copy the secret's Value, not its Secret ID.",
        "AADSTS700016": "ONEDRIVE_CLIENT_ID or ONEDRIVE_TENANT_ID is wrong, or the app is in another directory.",
        "AADSTS50020": "A personal account needs ONEDRIVE_TENANT_ID=consumers (or common) and an app that "
                       "allows personal Microsoft accounts.",
        "AADSTS65001": "Nobody has consented to the permission yet: an admin must grant it.",
        "AADSTS70000": "The refresh token is no longer valid. Run onedrive_admin.py login again.",
        "invalid_grant": "The refresh token is no longer valid. Run onedrive_admin.py login again.",
    }
    for code, hint in hints.items():
        if code in text or body.get("error") == code:
            return f"{text.splitlines()[0]}\n  -> {hint}"
    return text.splitlines()[0] if text else "sign-in failed"


def make_auth(mode: str, tenant_id: str, client_id: str, client_secret: str, cache_path: str | Path):
    if mode == "app":
        return AppAuth(tenant_id, client_id, client_secret)
    if mode == "device":
        return DeviceAuth(tenant_id, client_id, cache_path)
    raise ValueError(f"ONEDRIVE_AUTH must be app or device, not {mode!r}")


def drive_base(drive: str, auth_mode: str) -> str:
    """ONEDRIVE_DRIVE as a Graph path: your own drive, a user's OneDrive, or any drive by id."""
    drive = drive.strip()
    if drive in ("", "me"):
        if auth_mode == "app":
            raise GraphAuthError("ONEDRIVE_AUTH=app has no 'me': set ONEDRIVE_DRIVE to the owner's "
                                 "sign-in name (someone@yourco.onmicrosoft.com) or a drive id.")
        return "/me/drive"
    if "@" in drive:
        return f"/users/{quote(drive)}/drive"
    return f"/drives/{quote(drive)}"


class OneDriveConnector:
    """A OneDrive (or SharePoint library) folder tree, read through Microsoft Graph."""

    def __init__(self, auth, drive: str = "/me/drive", folder: str = "", http: httpx.Client | None = None,
                 sleep=time.sleep):
        self.auth = auth                  # anything with token(force=False) -> str; tests pass a fake
        self.drive = drive                # a Graph path from drive_base()
        self.folder = folder.strip("/")   # path from the drive's root, "" = the root itself
        self.http = http or httpx.Client(timeout=60)
        self.sleep = sleep
        self._root_id: str | None = None
        self._by_path: dict[str, dict] = {}  # path -> the driveItem, filled by list_items()

    # Purpose:
    # One Graph GET, with the two things every Graph client must do:
    # sign in again once on a 401, and back off on 429/503 for as long
    # as Retry-After says.
    def _get(self, url: str, params: dict | None = None, follow_redirects: bool = False) -> httpx.Response:
        url = url if url.startswith("https://") else GRAPH + url
        refreshed = force = False
        for attempt in range(1, MAX_ATTEMPTS + 1):
            response = self.http.get(url, params=params, follow_redirects=follow_redirects,
                                     headers={"Authorization": f"Bearer {self.auth.token(force=force)}"})
            force = False
            if response.status_code == 401 and not refreshed:
                refreshed = force = True
                continue
            if response.status_code in (429, 503, 504) and attempt < MAX_ATTEMPTS:
                wait = min(_retry_after(response, default=2.0 ** attempt), MAX_RETRY_WAIT)
                log.warning("Graph said %s; retrying in %.0fs", response.status_code, wait)
                self.sleep(wait)
                continue
            if response.status_code >= 400:
                raise _graph_error(response, url)
            return response
        raise _graph_error(response, url)

    def root_id(self) -> str:
        if self._root_id is None:
            path = f"{self.drive}/root" + (f":/{quote(self.folder)}" if self.folder else "")
            item = self._get(path, {"$select": "id,name,folder"}).json()
            if "folder" not in item:
                raise FileNotFoundError(f"ONEDRIVE_FOLDER {self.folder!r} is a file, not a folder")
            self._root_id = item["id"]
        return self._root_id

    # ---- 1. What items exist right now? ----

    def _children(self, item_id: str) -> list[dict]:
        """One folder's direct children, following @odata.nextLink."""
        items, url, params = [], f"{self.drive}/items/{item_id}/children", {"$select": CHILD_FIELDS, "$top": "200"}
        while url:
            body = self._get(url, params).json()
            items.extend(body.get("value", []))
            url, params = body.get("@odata.nextLink"), None  # the next link carries its own query
        return items

    def _walk(self, item_id: str, prefix: str):
        """Yield (path, item) for every file under a folder, depth first."""
        for item in sorted(self._children(item_id), key=lambda i: i["name"]):
            name = f"{prefix}{item['name']}"
            if "folder" in item:
                yield from self._walk(item["id"], f"{name}/")
            elif "remoteItem" in item:
                log.warning("skipping %s: a shortcut to someone else's item, index the original", name)
            elif "package" in item:
                log.warning("skipping %s: a %s package (OneNote), nothing to parse", name, item["package"].get("type"))
            elif "file" in item:
                yield name, item

    @staticmethod
    def etag(item: dict) -> str:
        """The content signal: a hash of the bytes if Graph has one, else the content tag."""
        hashes = (item.get("file") or {}).get("hashes") or {}
        return hashes.get("quickXorHash") or hashes.get("sha256Hash") or hashes.get("sha1Hash") \
            or item.get("cTag") or item.get("eTag", "")

    # Purpose:
    # Walk the library and describe every file. Nothing is downloaded here.
    def list_items(self) -> list[SourceItem]:
        self._by_path = {}
        items = []
        for path, item in self._walk(self.root_id(), ""):
            self._by_path[path] = item
            if item["name"] == REGISTER_FILENAME and "/" not in path:
                continue  # kept for fetch_register(), never indexed
            items.append(SourceItem(
                path=path,
                size=int(item.get("size") or 0),
                modified=_epoch(item.get("lastModifiedDateTime")),
                etag=self.etag(item),
                modified_by=_who(item.get("lastModifiedBy")),
            ))
        return items

    # ---- 2. Give me the bytes of this item. ----

    def _item(self, path: str) -> dict:
        if path not in self._by_path:
            self.list_items()
        if path not in self._by_path:
            raise FileNotFoundError(f"{path} is not in the OneDrive folder (or this sign-in cannot see it)")
        return self._by_path[path]

    def fetch(self, path: str) -> bytes:
        """Download one item. Graph answers 302 with a pre-signed URL; httpx follows it
        and drops the Authorization header on the way, as it should for another host."""
        item = self._item(path)
        return self._get(f"{self.drive}/items/{item['id']}/content", follow_redirects=True).content

    # ---- 3. What do you know ABOUT it? ----

    def fetch_register(self) -> dict:
        """The register: a local file by default, or _register.json in the folder (REGISTER_SOURCE=drive)."""
        if REGISTER_SOURCE == "drive":
            return json.loads(self.fetch(REGISTER_FILENAME).decode("utf-8"))
        if not REGISTER_FILE.is_file():
            raise FileNotFoundError(f"No register at {REGISTER_FILE}")
        return json.loads(REGISTER_FILE.read_text(encoding="utf-8"))

    def source_url(self, path: str) -> str:
        """The link a user clicks in a citation: the file in OneDrive or SharePoint."""
        item = self._by_path.get(path)
        return item.get("webUrl", "") if item else ""

    # ---- The delta feed (not used by the sync yet) ----
    #
    # GET {drive}/items/{root}/delta returns everything the first time
    # and an @odata.deltaLink at the end; call that link next time and
    # you get only what changed (deleted items carry a "deleted" facet).
    # Same Lab exercise as connector_drive.py: keep the link in runs/.


def _retry_after(response: httpx.Response, default: float) -> float:
    """Retry-After in seconds (Graph sends seconds; an HTTP date falls back to the default)."""
    try:
        return max(0.0, float(response.headers.get("Retry-After", default)))
    except ValueError:
        return default


def _graph_error(response: httpx.Response, url: str) -> Exception:
    try:
        err = response.json().get("error", {})
        detail = f"{err.get('code', '')}: {err.get('message', '')}".strip(": ")
    except ValueError:
        detail = response.text[:200]
    hint = {
        401: "the token was refused: check the app's API permissions and that consent was granted",
        403: "signed in, but not allowed: the permission is missing or not yet admin-consented",
        404: "not found: check ONEDRIVE_DRIVE and ONEDRIVE_FOLDER (folder names are case-insensitive, "
             "but the path must be exact)",
    }.get(response.status_code, "")
    message = f"Graph {response.status_code} on {url}: {detail}" + (f"\n  -> {hint}" if hint else "")
    if response.status_code == 404:
        return FileNotFoundError(message)
    if response.status_code in (401, 403):
        return PermissionError(message)
    return RuntimeError(message)
