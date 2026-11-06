"""
drive_admin.py — look at the Google Drive folder the way the sync sees it.

    python drive_admin.py tree                          # every folder and file, with its change signal
    python drive_admin.py check                         # ready for class? every register path present (exit 1 if not)
    python drive_admin.py fetch hr/leave-policy.md [out]  # download (or export) one file, to stdout or a file
    python drive_admin.py permissions hr/salary-bands-2026.md
                                                        # who may read it in Drive, next to the register
    python drive_admin.py token                         # a Changes API start token
    python drive_admin.py changes <token>               # what changed since that token

Read-only. It never uploads, edits or trashes anything: those are owner
actions you take in the Drive web UI, which is the point of the demo.
Needs DRIVE_SA_KEY and DRIVE_ROOT_FOLDER_ID in .env (see docs/drive-setup.md).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import DRIVE_DOC_EXPORT, DRIVE_ROOT_FOLDER_ID, DRIVE_SA_KEY  # noqa: E402
from app.ingest.connector_drive import FOLDER, DriveConnector  # noqa: E402
from app.ingest.register import load_register  # noqa: E402

# How the groups in Drive sharing map onto the register's groups. In
# production this table is the identity provider's job; here it shows
# what permissions.list gives you next to what the register says.
DRIVE_GROUP_MAP = {
    "hr-team@acme.example": "hr",
    "finance-team@acme.example": "finance",
    "engineering@acme.example": "engineering",
    "managers@acme.example": "managers",
    "leadership@acme.example": "leadership",
    "everyone@acme.example": "employees",
}


def connector() -> DriveConnector:
    return DriveConnector(DRIVE_ROOT_FOLDER_ID, DRIVE_SA_KEY, DRIVE_DOC_EXPORT)


def signal(record: dict) -> str:
    md5 = record.get("md5Checksum")
    return f"md5 {md5[:12]}…" if md5 else f"v{record.get('version', '?')} (native, exported)"


def tree(c: DriveConnector) -> int:
    def walk(folder_id: str, depth: int) -> None:
        for record in sorted(c._children(folder_id), key=lambda f: (f["mimeType"] != FOLDER, f["name"])):
            pad = "  " * depth
            if record["mimeType"] == FOLDER:
                print(f"{pad}{record['name']}/")
                walk(record["id"], depth + 1)
            else:
                size = f"{int(record['size']):,} B" if record.get("size") else ""
                print(f"{pad}{record['name']:<40} {signal(record):<32} {size}")

    print(f"Drive folder {c.root_id}\n")
    walk(c.root_id, 0)
    return 0


def check(c: DriveConnector) -> int:
    items = c.list_items()
    entries = load_register(c.fetch_register())
    listed = {item.path for item in items}
    wanted = {e.path for e in entries.values()}
    sites_wanted = {p.split("/")[0] for p in wanted}
    sites_seen = {p.split("/")[0] for p in listed}
    print(f"Drive folder {c.root_id}: {len(sites_seen)} site folder(s), {len(items)} file(s); "
          f"the register names {len(wanted)} document(s).")
    problems = 0
    for site in sorted(sites_wanted - sites_seen):
        print(f"  MISSING site folder: {site}/")
        problems += 1
    for path in sorted(wanted - listed):
        print(f"  MISSING in Drive (the register has it): {path}")
        problems += 1
    for path in sorted(listed - wanted):
        print(f"  not in the register (will be skipped, fail closed): {path}")
    print("\nREADY for class." if not problems else f"\nNOT READY: {problems} problem(s) above.")
    return 0 if not problems else 1


def fetch(c: DriveConnector, path: str, out: str | None) -> int:
    data = c.fetch(path)
    if out:
        Path(out).write_bytes(data)
        print(f"{len(data):,} bytes -> {out}")
    else:
        sys.stdout.write(data.decode("utf-8", errors="replace"))
    return 0


def permissions(c: DriveConnector, path: str) -> int:
    record = c._record(path)
    entry = next((e for e in load_register(c.fetch_register()).values() if e.path == path), None)
    try:
        response = c.service().permissions().list(
            fileId=record["id"], supportsAllDrives=True,
            fields="permissions(type,role,emailAddress,domain,displayName)",
        ).execute(num_retries=3)
    except Exception as exc:  # googleapiclient HttpError; the fake Drive never raises here
        if getattr(getattr(exc, "resp", None), "status", None) != 403:
            raise
        # A Viewer may read the file but not its sharing list: Drive shows that only to
        # identities that could change it. Print what a Viewer CAN see, and why.
        seen = c.service().files().get(
            fileId=record["id"], supportsAllDrives=True,
            fields="owners(emailAddress),shared,capabilities(canShare)",
        ).execute(num_retries=3)
        owners = ", ".join(o.get("emailAddress", "?") for o in seen.get("owners", [])) or "(a shared drive)"
        print(f"{path}\n")
        print("  permissions.list  ->  403 insufficientFilePermissions")
        print(f"  what a Viewer sees:  owner {owners}  |  shared: {seen.get('shared')}  |  canShare: {seen.get('capabilities', {}).get('canShare')}")
        print(f"\n  register allowed_groups: {', '.join(entry.allowed_groups) if entry else '(no register entry)'}")
        print("\n  The sync is a Viewer on purpose (least privilege), and Drive shows a file's sharing only to")
        print("  identities that could change it. Reading permissions needs a second, admin-approved identity")
        print("  with a metadata-only scope (Workspace: domain-wide delegation + drive.metadata.readonly).")
        print("  Until then the register is the truth about who may read what.")
        return 0
    print(f"{path}\n")
    print(f"  {'Drive sharing (permissions.list)':<48} {'as a register group'}")
    for p in response.get("permissions", []):
        who = p.get("emailAddress") or p.get("domain") or p.get("displayName") or p["type"]
        mapped = DRIVE_GROUP_MAP.get(who, "(no mapping)" if p["type"] != "user" else "(a person: owner or editor)")
        print(f"  {p['type']:<8} {p['role']:<10} {who:<28} {mapped}")
    print(f"\n  register allowed_groups: {', '.join(entry.allowed_groups) if entry else '(no register entry)'}")
    print("\n  In SharePoint this is GET /items/{id}/permissions. The sync keeps the register as the truth;")
    print("  mapping principals to groups is the identity provider's job, and this is where it would plug in.")
    return 0


def token(c: DriveConnector) -> int:
    response = c.service().changes().getStartPageToken(supportsAllDrives=True).execute(num_retries=3)
    print(response["startPageToken"])
    return 0


def changes(c: DriveConnector, page_token: str) -> int:
    response = c.service().changes().list(
        pageToken=page_token, spaces="drive", includeRemoved=True,
        supportsAllDrives=True, includeItemsFromAllDrives=True,
        fields="newStartPageToken,nextPageToken,changes(fileId,removed,time,file(name,mimeType,md5Checksum,version,trashed))",
    ).execute(num_retries=3)
    rows = response.get("changes", [])
    print(f"{len(rows)} change(s) since token {page_token}\n")
    for ch in rows:
        f = ch.get("file") or {}
        state = "REMOVED" if ch.get("removed") else ("trashed" if f.get("trashed") else "changed")
        print(f"  {ch.get('time', ''):<26} {state:<8} {f.get('name', ch['fileId']):<40} {signal(f) if f else ''}")
    print(f"\nnext token: {response.get('newStartPageToken') or response.get('nextPageToken')}")
    print("This is Graph's /delta: save the token, ask again later, download only what it names.")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] not in ("tree", "check", "fetch", "permissions", "token", "changes"):
        print(__doc__)
        return 1
    c = connector()
    command = args[0]
    if command == "tree":
        return tree(c)
    if command == "check":
        return check(c)
    if command == "fetch":
        return fetch(c, args[1], args[2] if len(args) > 2 else None)
    if command == "permissions":
        return permissions(c, args[1])
    if command == "token":
        return token(c)
    return changes(c, args[1])


if __name__ == "__main__":
    sys.exit(main())
