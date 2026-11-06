"""
fake_drive.py — plays Google Drive for the offline demo (SOURCE=local).

The sync job reads workspace/local-drive/. This script creates it from
shared/data (Friday's snapshot) and replays what people change over the
weekend, one event at a time: the same edits you make by hand in the
real Drive folder when SOURCE=drive.

    python fake_drive.py reset        # Friday: copy the seed into workspace/local-drive
    python fake_drive.py events       # list the weekend's events
    python fake_drive.py apply 2      # replay one event (or: apply all)
    python fake_drive.py status       # which events have been applied

Part 2: the register lives in Postgres. Events that change it (a new
policy, a status, who may read the salary bands) are written to the
tenant whose source is this folder, playing the people who own the
register. In the app, a tenant admin does the same in Document access.

Run from anywhere: paths are resolved from the repository root.
"""

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import REGISTER_FILENAME, SEED_DIR, SOURCE_DIR  # noqa: E402

EVENTS_FILE = SEED_DIR / "events" / "events.json"
STATE_FILE = SOURCE_DIR / ".applied_events.json"


def load_events() -> list[dict]:
    return json.loads(EVENTS_FILE.read_text(encoding="utf-8"))["events"]


def applied() -> list[int]:
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else []


# Purpose:
# Part 2: write the folder's register into Postgres, for every tenant
# whose source is this folder. Set-up tooling: it uses the owner's
# connection, like db.py, never the API's or the worker's.
def push_register(register: dict) -> None:
    from app.db import connect_admin
    from app.ingest.registry import import_register, resolve_source_dir

    try:
        with connect_admin(autocommit=False) as conn, conn.transaction():
            tenants = [t for t in conn.execute("SELECT id, slug, source_kind, source_ref FROM tenants")
                       if t["source_kind"] == "local" and resolve_source_dir(t["source_ref"]).resolve() == SOURCE_DIR.resolve()]
            for t in tenants:
                import_register(conn, str(t["id"]), register, replace=True)
    except Exception as exc:  # noqa: BLE001 - the files changed anyway; say what did not
        print(f"  (register NOT written to Postgres: {type(exc).__name__}: {exc}. Is the database up? python db.py seed)")
        return
    if tenants:
        print(f"  register written to Postgres for: {', '.join(t['slug'] for t in tenants)}")
    else:
        print("  (no tenant reads this folder; the register stayed in the folder only)")


def reset() -> None:
    if SOURCE_DIR.exists():
        shutil.rmtree(SOURCE_DIR)
    shutil.copytree(SEED_DIR / "sites", SOURCE_DIR)
    shutil.copy(SEED_DIR / "register.json", SOURCE_DIR / REGISTER_FILENAME)
    STATE_FILE.write_text("[]")
    files = [p for p in SOURCE_DIR.rglob("*") if p.is_file() and not p.name.startswith((".", "_"))]
    print(f"Local drive reset to Friday: {len(files)} files in {SOURCE_DIR}")
    push_register(json.loads((SOURCE_DIR / REGISTER_FILENAME).read_text(encoding="utf-8")))


def apply_event(event: dict) -> None:
    register_path = SOURCE_DIR / REGISTER_FILENAME
    register = json.loads(register_path.read_text(encoding="utf-8"))
    docs = register["documents"]
    for op in event["ops"]:
        kind = op["op"]
        if kind in ("add_file", "replace_file"):
            target = SOURCE_DIR / op["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(SEED_DIR / "events" / op["from"], target)
        elif kind == "delete_file":
            (SOURCE_DIR / op["path"]).unlink(missing_ok=True)
        elif kind == "add_entry":
            docs.append(op["entry"])
        elif kind == "remove_entry":
            register["documents"] = docs = [d for d in docs if d["doc_id"] != op["doc_id"]]
        elif kind == "patch_entry":
            for d in docs:
                if d["doc_id"] == op["doc_id"]:
                    d.update(op["set"])
        else:
            raise ValueError(f"unknown op {kind}")
    register_path.write_text(json.dumps(register, indent=2), encoding="utf-8")
    STATE_FILE.write_text(json.dumps(sorted(set(applied() + [event["id"]]))))
    print(f"Event {event['id']} applied: {event['title']}")
    print(f"  {event['story']}")
    if any(op["op"] in ("add_entry", "remove_entry", "patch_entry") for op in event["ops"]):
        push_register(register)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("reset", "events", "apply", "status"):
        print(__doc__)
        sys.exit(1)
    command = sys.argv[1]
    events = load_events()

    if command == "reset":
        reset()
    elif command == "events":
        done = applied() if SOURCE_DIR.exists() else []
        for e in events:
            mark = "x" if e["id"] in done else " "
            print(f"[{mark}] {e['id']}. {e['title']}\n      {e['story']}")
    elif command == "status":
        print(f"Source: {SOURCE_DIR}\nApplied events: {applied() or 'none (Friday)'}")
    elif command == "apply":
        if not SOURCE_DIR.exists():
            sys.exit("No local drive yet. Run: python fake_drive.py reset")
        wanted = sys.argv[2] if len(sys.argv) > 2 else "all"
        ids = [e["id"] for e in events] if wanted == "all" else [int(wanted)]
        for event in events:
            if event["id"] in ids:
                if event["id"] in applied():
                    print(f"Event {event['id']} was already applied; skipping.")
                else:
                    apply_event(event)


if __name__ == "__main__":
    main()
