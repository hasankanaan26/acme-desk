# ============================================================
# The OneDrive connector, against a fake Microsoft Graph (no network)
# ============================================================
# The fake is an httpx.MockTransport, so the connector's real HTTP
# code runs: the folder lookup, children with @odata.nextLink, the 302
# from /content to a download host, 401 and 429 handling. It is seeded
# from the same 20 files as the local folder and the fake Drive.
# ============================================================

import hashlib
import json
from urllib.parse import parse_qs

import httpx
import pytest

from app.config import SEED_DIR, SOURCE_DIR
from app.ingest.connector import LocalFolderConnector
from app.ingest.connector_onedrive import (
    AppAuth,
    DeviceAuth,
    GraphAuthError,
    OneDriveConnector,
    drive_base,
)
from app.ingest.sync import build_plan, run_sync
from app.rag import catalog

FOLDER = "Acme Corp Documents"
STAMP = "2026-11-06T18:00:00Z"


def qxh(data: bytes) -> str:
    """Stands in for quickXorHash: any stable hash of the bytes will do for the fake."""
    return hashlib.sha1(data).hexdigest()


class FakeAuth:
    def __init__(self):
        self.calls = []

    def token(self, force=False):
        self.calls.append(force)
        return "fresh" if force else "stale-or-fresh"


class FakeGraph:
    """Just enough of Graph's driveItem API, behind an httpx transport."""

    def __init__(self, page_size=1000):
        self.children: dict[str, list[dict]] = {"root-folder": []}
        self.blobs: dict[str, bytes] = {}
        self.calls: list[tuple] = []
        self.page_size = page_size
        self.fail_next: list[httpx.Response] = []  # canned answers for the next requests
        self.download_auth: list[str | None] = []

    # -- the HTTP surface --
    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.fail_next and request.url.host == "graph.microsoft.com":
            return self.fail_next.pop(0)
        path = request.url.path
        if request.url.host == "download.example":
            self.calls.append(("download", path.strip("/")))
            self.download_auth.append(request.headers.get("Authorization"))
            return httpx.Response(200, content=self.blobs[path.strip("/")])
        if path == f"/v1.0/me/drive/root:/{FOLDER}":
            self.calls.append(("root",))
            return httpx.Response(200, json={"id": "root-folder", "name": FOLDER, "folder": {}})
        if path.startswith("/v1.0/me/drive/root:/"):
            return httpx.Response(404, json={"error": {"code": "itemNotFound", "message": "The resource could not be found."}})
        parts = path.split("/")  # ['', 'v1.0', 'me', 'drive', 'items', '<id>', 'children'|'content']
        item_id, verb = parts[5], parts[6]
        if verb == "children":
            skip = int(request.url.params.get("skip", "0"))
            self.calls.append(("list", item_id, skip))
            rows = self.children.get(item_id, [])
            body = {"value": rows[skip:skip + self.page_size]}
            if skip + self.page_size < len(rows):
                body["@odata.nextLink"] = f"https://graph.microsoft.com/v1.0/me/drive/items/{item_id}/children?skip={skip + self.page_size}"
            return httpx.Response(200, json=body)
        if verb == "content":
            self.calls.append(("content", item_id))
            return httpx.Response(302, headers={"Location": f"https://download.example/{item_id}"})
        return httpx.Response(400)

    # -- what an owner does in the OneDrive web UI --
    def add_folder(self, parent, name, folder_id):
        self.children[parent].append({"id": folder_id, "name": name, "folder": {"childCount": 0}})
        self.children[folder_id] = []

    def add_file(self, parent, name, data, item_id):
        self.children[parent].append({
            "id": item_id, "name": name, "size": len(data), "lastModifiedDateTime": STAMP,
            "eTag": f'"{{{item_id}}},1"', "cTag": f'"c:{{{item_id}}},1"',
            "file": {"mimeType": "text/markdown", "hashes": {"quickXorHash": qxh(data)}},
            "lastModifiedBy": {"user": {"displayName": "Dana Owner", "email": "dana@acme.example"}},
            "webUrl": f"https://acme-my.sharepoint.com/personal/dana/Documents/{item_id}",
        })
        self.blobs[item_id] = data

    def item(self, item_id):
        return next(r for rows in self.children.values() for r in rows if r["id"] == item_id)

    def replace_bytes(self, item_id, data):
        """Save a new version: same item id, new hash, new eTag and cTag."""
        self.blobs[item_id] = data
        it = self.item(item_id)
        it.update(size=len(data), eTag=it["eTag"] + "+", cTag=it["cTag"] + "+")
        it["file"]["hashes"]["quickXorHash"] = qxh(data)

    def touch_metadata(self, item_id):
        """A rename-in-place or a property edit: eTag moves, the bytes (and their hash) do not."""
        self.item(item_id)["eTag"] += "+"

    def delete(self, item_id):
        for rows in self.children.values():
            rows[:] = [r for r in rows if r["id"] != item_id]


def seed_graph(**kwargs) -> FakeGraph:
    fake = FakeGraph(**kwargs)
    sites = SEED_DIR / "sites"
    for site in sorted(p for p in sites.iterdir() if p.is_dir()):
        fake.add_folder("root-folder", site.name, f"folder-{site.name}")
        for file in sorted(p for p in site.iterdir() if p.is_file()):
            fake.add_file(f"folder-{site.name}", file.name, file.read_bytes(), f"item-{site.name}-{file.name}")
    return fake


def connector(fake: FakeGraph, auth=None, sleeps=None) -> OneDriveConnector:
    http = httpx.Client(transport=httpx.MockTransport(fake.handler))
    sleep = sleeps.append if sleeps is not None else (lambda s: None)
    return OneDriveConnector(auth or FakeAuth(), "/me/drive", FOLDER, http=http, sleep=sleep)


def seed_paths() -> set[str]:
    return {p.relative_to(SEED_DIR / "sites").as_posix() for p in (SEED_DIR / "sites").rglob("*") if p.is_file()}


# ---- 1. What items exist right now? ----

def test_lists_every_file_under_the_register_paths():
    items = connector(seed_graph()).list_items()
    assert {item.path for item in items} == seed_paths()
    assert len(items) == 20


def test_listing_never_downloads_anything():
    fake = seed_graph()
    connector(fake).list_items()
    assert fake.calls[0] == ("root",)
    assert all(call[0] == "list" for call in fake.calls[1:])
    assert len(fake.calls) == 1 + 8  # find the folder, then the root and the seven site folders


def test_follows_next_links_across_pages():
    fake = seed_graph(page_size=2)
    items = connector(fake).list_items()
    assert len(items) == 20
    assert any(call[0] == "list" and call[2] > 0 for call in fake.calls)


def test_the_etag_is_the_content_hash_and_the_editor_is_kept():
    items = {item.path: item for item in connector(seed_graph()).list_items()}
    data = (SEED_DIR / "sites" / "company" / "company-faq.md").read_bytes()
    faq = items["company/company-faq.md"]
    assert faq.etag == qxh(data)
    assert faq.size == len(data)
    assert faq.modified_by == "Dana Owner <dana@acme.example>"
    assert faq.modified > 0


def test_without_a_hash_the_ctag_is_the_signal():
    item = {"cTag": '"c:{x},3"', "eTag": '"{x},9"', "file": {}}
    assert OneDriveConnector.etag(item) == '"c:{x},3"'


def test_shortcuts_onenote_and_the_root_register_are_not_indexed():
    fake = seed_graph()
    fake.children["root-folder"] += [
        {"id": "sc", "name": "Shared plan", "remoteItem": {"id": "elsewhere"}},
        {"id": "nb", "name": "Team notes", "package": {"type": "oneNote"}},
    ]
    fake.add_file("root-folder", "_register.json", b"{}", "reg")
    assert {i.path for i in connector(fake).list_items()} == seed_paths()


def test_a_missing_folder_says_which_setting_to_fix():
    c = connector(seed_graph())
    c.folder = "Acme Corp Documents (old)"
    with pytest.raises(FileNotFoundError, match="ONEDRIVE_FOLDER"):
        c.list_items()


# ---- 2. Give me the bytes of this item. ----

def test_fetch_follows_the_redirect_without_leaking_the_token():
    fake = seed_graph()
    c = connector(fake)
    assert c.fetch("company/company-faq.md") == (SEED_DIR / "sites" / "company" / "company-faq.md").read_bytes()
    assert ("content", "item-company-company-faq.md") in fake.calls
    assert fake.download_auth == [None]  # the pre-signed URL needs no token, and must not get one


def test_a_401_signs_in_again_once():
    fake = seed_graph()
    auth = FakeAuth()
    fake.fail_next = [httpx.Response(401, json={"error": {"code": "InvalidAuthenticationToken"}})]
    assert len(connector(fake, auth=auth).list_items()) == 20
    assert auth.calls[:2] == [False, True]


def test_a_429_waits_as_long_as_retry_after_says():
    fake = seed_graph()
    sleeps = []
    fake.fail_next = [httpx.Response(429, headers={"Retry-After": "7"}),
                      httpx.Response(503, headers={"Retry-After": "2"})]
    assert len(connector(fake, sleeps=sleeps).list_items()) == 20
    assert sleeps == [7.0, 2.0]


def test_a_403_is_a_permission_error_with_a_hint():
    fake = seed_graph()
    fake.fail_next = [httpx.Response(403, json={"error": {"code": "accessDenied", "message": "Access denied"}})]
    with pytest.raises(PermissionError, match="admin-consented"):
        connector(fake).list_items()


# ---- 3. What do you know ABOUT it? ----

def test_the_register_comes_from_the_local_file_by_default():
    register = connector(seed_graph()).fetch_register()
    assert {d["doc_id"] for d in register["documents"]} >= {"HR-LEAVE", "LEAD-Q3-NOTES", "COMPANY-FAQ"}


def test_citations_link_to_the_file_in_onedrive():
    c = connector(seed_graph())
    c.list_items()
    assert c.source_url("company/company-faq.md").startswith("https://acme-my.sharepoint.com/")


# ---- The sync does not know which connector it got ----

def test_the_first_plan_matches_the_local_connector(friday):
    onedrive_plan = build_plan(connector(seed_graph()), None)
    local_plan = build_plan(LocalFolderConnector(SOURCE_DIR), None)
    assert onedrive_plan.counts() == local_plan.counts()


def test_an_edit_a_delete_and_a_metadata_change_plan_change_remove_and_nothing(friday):
    fake = seed_graph()
    c = connector(fake)
    run_sync(apply=True, connector=c)  # a fresh index, with the fake embedder

    fake.delete("item-leadership-q3-planning-notes.md")
    faq = fake.blobs["item-company-company-faq.md"] + b"\n\n## Parking\n\nBadge holders park on level 2.\n"
    fake.replace_bytes("item-company-company-faq.md", faq)
    fake.touch_metadata("item-hr-leave-policy.md")  # eTag moves, content hash does not

    actions = {d.doc_id: d.action for d in build_plan(c, catalog.active_name()).docs}
    assert actions["LEAD-Q3-NOTES"] == "remove"
    assert actions["COMPANY-FAQ"] == "change"
    assert actions["HR-LEAVE"] == "unchanged"


# ---- Settings and sign-in ----

def test_drive_base_reads_the_three_shapes_of_onedrive_drive():
    assert drive_base("", "device") == "/me/drive"
    assert drive_base("dana@acme.example", "app") == "/users/dana%40acme.example/drive"
    assert drive_base("b!abc", "app") == "/drives/b%21abc"
    with pytest.raises(GraphAuthError, match="ONEDRIVE_DRIVE"):
        drive_base("", "app")


def test_app_auth_names_the_missing_settings():
    with pytest.raises(GraphAuthError, match="ONEDRIVE_CLIENT_SECRET"):
        AppAuth("tenant-guid", "client-guid", "")
    with pytest.raises(GraphAuthError, match="tenant"):
        AppAuth("common", "client-guid", "secret")


def test_app_auth_asks_for_a_client_credentials_token_once():
    posts = []

    def handler(request):
        posts.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"access_token": "app-token", "expires_in": 3600})

    auth = AppAuth("tenant-guid", "client-guid", "s3cret", http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert auth.token() == auth.token() == "app-token"
    assert len(posts) == 1
    assert posts[0]["grant_type"] == ["client_credentials"]
    assert posts[0]["scope"] == ["https://graph.microsoft.com/.default"]


def test_device_auth_keeps_the_rotated_refresh_token(tmp_path):
    cache = tmp_path / "onedrive-token.json"
    cache.write_text(json.dumps({"refresh_token": "rt-1"}), encoding="utf-8")
    sent = []

    def handler(request):
        sent.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"access_token": "at", "refresh_token": "rt-2", "expires_in": 3600})

    auth = DeviceAuth("consumers", "client-guid", cache, http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert auth.token() == "at"
    assert sent[0]["refresh_token"] == ["rt-1"]
    assert json.loads(cache.read_text(encoding="utf-8"))["refresh_token"] == "rt-2"


def test_device_auth_without_a_login_says_how_to_sign_in(tmp_path):
    auth = DeviceAuth("consumers", "client-guid", tmp_path / "none.json")
    with pytest.raises(GraphAuthError, match="onedrive_admin.py login"):
        auth.token()


def test_device_login_waits_for_the_person_then_saves_the_token(tmp_path):
    answers = [httpx.Response(400, json={"error": "authorization_pending"}),
               httpx.Response(200, json={"access_token": "at", "refresh_token": "rt", "expires_in": 3600})]

    def handler(request):
        if request.url.path.endswith("/devicecode"):
            return httpx.Response(200, json={"device_code": "dc", "message": "Go to microsoft.com/devicelogin",
                                             "interval": 1, "expires_in": 900})
        return answers.pop(0)

    cache = tmp_path / "t.json"
    said = []
    auth = DeviceAuth("consumers", "client-guid", cache, http=httpx.Client(transport=httpx.MockTransport(handler)))
    auth.login(say=said.append, sleep=lambda s: None)
    assert said == ["Go to microsoft.com/devicelogin"]
    assert json.loads(cache.read_text(encoding="utf-8"))["refresh_token"] == "rt"


def test_entra_errors_come_with_the_fix(tmp_path):
    def handler(request):
        return httpx.Response(400, json={"error": "invalid_client",
                                         "error_description": "AADSTS7000218: The request body must contain "
                                                              "client_assertion or client_secret."})

    auth = DeviceAuth("consumers", "client-guid", tmp_path / "t.json",
                      http=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(GraphAuthError, match="Allow public client flows"):
        auth.login(say=lambda m: None, sleep=lambda s: None)
