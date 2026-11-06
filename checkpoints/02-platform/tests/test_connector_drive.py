# ============================================================
# The Drive connector, against a fake Drive API (no network)
# ============================================================
# The fake answers the three calls the connector makes: files.list,
# files.get(alt=media) and files.export. It is seeded from the same
# 20 files as the local folder, with the Leave Policy played by a
# native Google Doc, so the two connectors can be compared directly.
# ============================================================

import hashlib

from conftest import as_tenant

from app.config import SEED_DIR, SOURCE_DIR
from app.ingest.connector import LocalFolderConnector, etag_of
from app.ingest.connector_drive import DriveConnector
from app.ingest.sync import build_plan, run_sync
from app.rag import catalog

NATIVE_DOC = "hr/leave-policy.md"  # in the fake Drive this one is a Google Doc, not an upload
STAMP = "2026-11-06T18:00:00.000Z"


class _Call:
    def __init__(self, value):
        self.value = value

    def execute(self, num_retries=0):
        return self.value


class FakeDrive:
    """Just enough of the Drive v3 client for the connector."""

    def __init__(self):
        self.children: dict[str, list[dict]] = {"root": []}
        self.blobs: dict[str, bytes] = {}
        self.calls: list[tuple] = []

    # -- the client surface the connector touches --
    def files(self):
        return self

    def list(self, q, **kwargs):
        folder_id = q.split("'")[1]
        self.calls.append(("list", folder_id))
        return _Call({"files": list(self.children.get(folder_id, []))})

    def get_media(self, fileId, **kwargs):
        self.calls.append(("get", fileId))
        return _Call(self.blobs[fileId])

    def export_media(self, fileId, mimeType):
        self.calls.append(("export", fileId, mimeType))
        return _Call(self.blobs[fileId])

    # -- what an owner does in the Drive UI --
    def add_folder(self, parent, name, folder_id):
        self.children[parent].append({"id": folder_id, "name": name, "mimeType": "application/vnd.google-apps.folder"})
        self.children[folder_id] = []

    def add_file(self, parent, name, data, file_id, native=None, version="1"):
        record = {"id": file_id, "name": name, "version": version, "modifiedTime": STAMP,
                  "webViewLink": f"https://drive.google.com/file/d/{file_id}/view"}
        if native:
            record["mimeType"] = f"application/vnd.google-apps.{native}"
        else:
            record.update(mimeType="application/octet-stream", md5Checksum=hashlib.md5(data).hexdigest(),
                          size=str(len(data)))
        self.children[parent].append(record)
        self.blobs[file_id] = data
        return record

    def record(self, file_id):
        return next(r for rows in self.children.values() for r in rows if r["id"] == file_id)

    def replace_bytes(self, file_id, data):
        """'Manage versions > Upload new version': same file id, new bytes, new md5."""
        self.blobs[file_id] = data
        self.record(file_id).update(md5Checksum=hashlib.md5(data).hexdigest(), size=str(len(data)),
                                    version=str(int(self.record(file_id)["version"]) + 1))

    def bump_version(self, file_id):
        """A rename, a comment, a re-save: the version moves, the text does not."""
        self.record(file_id)["version"] = str(int(self.record(file_id)["version"]) + 1)

    def trash(self, file_id):
        for rows in self.children.values():
            rows[:] = [r for r in rows if r["id"] != file_id]


def seed_drive() -> FakeDrive:
    fake = FakeDrive()
    sites = SEED_DIR / "sites"
    for site in sorted(p for p in sites.iterdir() if p.is_dir()):
        fake.add_folder("root", site.name, f"folder-{site.name}")
        for file in sorted(p for p in site.iterdir() if p.is_file()):
            rel = f"{site.name}/{file.name}"
            if rel == NATIVE_DOC:
                fake.add_file(f"folder-{site.name}", file.stem, file.read_bytes(), "doc-leave", native="document", version="7")
            else:
                fake.add_file(f"folder-{site.name}", file.name, file.read_bytes(), f"file-{site.name}-{file.name}")
    return fake


def connector(fake: FakeDrive) -> DriveConnector:
    return DriveConnector("root", "secrets/not-needed-with-a-fake.json", "markdown", service=fake)


def seed_paths() -> set[str]:
    return {p.relative_to(SEED_DIR / "sites").as_posix() for p in (SEED_DIR / "sites").rglob("*") if p.is_file()}


def test_lists_every_file_under_the_register_paths():
    items = connector(seed_drive()).list_items()
    assert {item.path for item in items} == seed_paths()
    assert len(items) == 20


def test_listing_never_downloads_anything():
    fake = seed_drive()
    connector(fake).list_items()
    assert all(call[0] == "list" for call in fake.calls)
    assert len(fake.calls) == 8  # the root and the seven site folders


def test_uploaded_files_carry_the_md5_the_local_connector_computes():
    items = {item.path: item for item in connector(seed_drive()).list_items()}
    data = (SEED_DIR / "sites" / "company" / "company-faq.md").read_bytes()
    assert items["company/company-faq.md"].etag == etag_of(data) == hashlib.md5(data).hexdigest()
    assert items["company/company-faq.md"].size == len(data)


def test_a_native_doc_gets_a_version_etag_and_the_export_suffix():
    items = {item.path: item for item in connector(seed_drive()).list_items()}
    assert items[NATIVE_DOC].etag == "v7"


def test_shortcuts_and_unsupported_native_types_are_skipped():
    fake = seed_drive()
    fake.children["root"].append({"id": "sc", "name": "a shortcut", "mimeType": "application/vnd.google-apps.shortcut"})
    fake.add_file("root", "a survey", b"", "form-1", native="form")
    assert len(connector(fake).list_items()) == 20


def test_fetch_downloads_uploads_and_exports_native_docs():
    fake = seed_drive()
    c = connector(fake)
    assert c.fetch("company/company-faq.md") == (SEED_DIR / "sites" / "company" / "company-faq.md").read_bytes()
    assert c.fetch(NATIVE_DOC) == (SEED_DIR / "sites" / "hr" / "leave-policy.md").read_bytes()
    assert ("export", "doc-leave", "text/markdown") in fake.calls


def test_the_register_comes_from_the_local_file_by_default():
    register = connector(seed_drive()).fetch_register()
    assert {d["doc_id"] for d in register["documents"]} >= {"HR-LEAVE", "LEAD-Q3-NOTES", "COMPANY-FAQ"}


def test_citations_link_to_the_file_in_drive():
    c = connector(seed_drive())
    c.list_items()
    assert c.source_url("company/company-faq.md").startswith("https://drive.google.com/")


def test_the_first_plan_matches_the_local_connector(friday):
    drive_plan = build_plan(connector(seed_drive()), None)
    local_plan = build_plan(LocalFolderConnector(SOURCE_DIR), None)
    assert drive_plan.counts() == local_plan.counts()
    assert {d.doc_id: d.action for d in drive_plan.docs}["HR-LEAVE"] == "add"


def test_an_edit_a_trash_and_a_resave_plan_change_remove_and_touch(friday, tenants):
    fake = seed_drive()
    c = connector(fake)
    with as_tenant("sync", tenants["acme"]):
        run_sync(apply=True, connector=c)  # a fresh index, with the fake embedder

    fake.trash("file-leadership-q3-planning-notes.md")                       # Legal deletes the Q3 notes
    faq = fake.blobs["file-company-company-faq.md"] + b"\n\n## Parking\n\nBadge holders park on level 2.\n"
    fake.replace_bytes("file-company-company-faq.md", faq)                   # a real edit
    fake.bump_version("doc-leave")                                           # a re-save: new version, same text

    with as_tenant("sync", tenants["acme"]):
        actions = {d.doc_id: d.action for d in build_plan(c, catalog.active_name()).docs}
    assert actions["LEAD-Q3-NOTES"] == "remove"
    assert actions["COMPANY-FAQ"] == "change"
    assert actions["HR-LEAVE"] == "touch"
    assert actions["HR-REMOTE"] == "unchanged"
