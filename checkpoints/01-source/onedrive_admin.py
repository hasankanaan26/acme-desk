"""
onedrive_admin.py — sign in to OneDrive and look at the folder the way the sync sees it.

    python onedrive_admin.py login                          # ONEDRIVE_AUTH=device: sign in once in the browser
    python onedrive_admin.py check                          # ready for class? every register path present (exit 1 if not)
    python onedrive_admin.py tree                           # every folder and file, with its change signal
    python onedrive_admin.py fetch hr/leave-policy.md [out] # download one file, to stdout or a file

Read-only. It never uploads, edits or deletes anything: those are owner
actions you take in the OneDrive web UI. Needs the ONEDRIVE_* settings
in .env (see docs/onedrive-setup.md).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import (  # noqa: E402
    ONEDRIVE_AUTH,
    ONEDRIVE_CLIENT_ID,
    ONEDRIVE_CLIENT_SECRET,
    ONEDRIVE_DRIVE,
    ONEDRIVE_FOLDER,
    ONEDRIVE_TENANT_ID,
    ONEDRIVE_TOKEN_CACHE,
)
from app.ingest.connector_onedrive import (  # noqa: E402
    DeviceAuth,
    GraphAuthError,
    OneDriveConnector,
    drive_base,
    make_auth,
)
from app.ingest.register import load_register  # noqa: E402


def connector() -> OneDriveConnector:
    auth = make_auth(ONEDRIVE_AUTH, ONEDRIVE_TENANT_ID, ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_TOKEN_CACHE)
    return OneDriveConnector(auth, drive_base(ONEDRIVE_DRIVE, ONEDRIVE_AUTH), ONEDRIVE_FOLDER)


def where(c: OneDriveConnector) -> str:
    return f"{c.drive}  folder '{c.folder or '(root)'}'"


def login() -> int:
    if ONEDRIVE_AUTH != "device":
        print("ONEDRIVE_AUTH=app signs in with the client secret on every run: there is nothing to log in to.\n"
              "Run `check` instead.")
        return 1
    DeviceAuth(ONEDRIVE_TENANT_ID, ONEDRIVE_CLIENT_ID, ONEDRIVE_TOKEN_CACHE).login()
    print(f"\nSigned in. Refresh token saved to {ONEDRIVE_TOKEN_CACHE} (keep it out of git; secrets/ is ignored).")
    print("Next: python checkpoints/01-source/onedrive_admin.py check")
    return 0


def tree(c: OneDriveConnector) -> int:
    def walk(item_id: str, depth: int) -> None:
        for item in sorted(c._children(item_id), key=lambda i: ("folder" not in i, i["name"])):
            pad = "  " * depth
            if "folder" in item:
                print(f"{pad}{item['name']}/")
                walk(item["id"], depth + 1)
            else:
                kind = "" if "file" in item else "  (skipped: shortcut or OneNote)"
                print(f"{pad}{item['name']:<40} {c.etag(item)[:28]:<30} {int(item.get('size') or 0):>9,} B{kind}")

    print(f"OneDrive {where(c)}\n")
    walk(c.root_id(), 0)
    return 0


def check(c: OneDriveConnector) -> int:
    items = c.list_items()
    entries = load_register(c.fetch_register())
    listed = {item.path for item in items}
    wanted = {e.path for e in entries.values()}
    sites_wanted = {p.split("/")[0] for p in wanted}
    sites_seen = {p.split("/")[0] for p in listed}
    print(f"OneDrive {where(c)}: {len(sites_seen)} site folder(s), {len(items)} file(s); "
          f"the register names {len(wanted)} document(s).")
    problems = 0
    for site in sorted(sites_wanted - sites_seen):
        print(f"  MISSING site folder: {site}/")
        problems += 1
    for path in sorted(wanted - listed):
        print(f"  MISSING in OneDrive (the register has it): {path}")
        problems += 1
    for path in sorted(listed - wanted):
        print(f"  not in the register (will be skipped, fail closed): {path}")
    print("\nREADY." if not problems else f"\nNOT READY: {problems} problem(s) above.")
    return 0 if not problems else 1


def fetch(c: OneDriveConnector, path: str, out: str | None) -> int:
    data = c.fetch(path)
    if out:
        Path(out).write_bytes(data)
        print(f"{len(data):,} bytes -> {out}")
    else:
        sys.stdout.write(data.decode("utf-8", errors="replace"))
    return 0


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] not in ("login", "tree", "check", "fetch") or (args[0] == "fetch" and len(args) < 2):
        print(__doc__)
        return 1
    try:
        if args[0] == "login":
            return login()
        c = connector()
        if args[0] == "tree":
            return tree(c)
        if args[0] == "check":
            return check(c)
        return fetch(c, args[1], args[2] if len(args) > 2 else None)
    except (GraphAuthError, PermissionError, FileNotFoundError) as exc:
        print(f"\n{exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
