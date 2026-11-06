"""
db.py — set up and inspect the Acme Desk database (Part 2)

    python db.py migrate                 apply new migrations (safe to repeat)
    python db.py seed                    the Acme tenant, 5 personas + an admin, the register
    python db.py seed --reset-passwords  ... and give every seeded account a new password
    python db.py reset                   DROP EVERYTHING, migrate, seed (class reset)
    python db.py status                  tenants, people, documents, indexes, last sync

Start Postgres first:  docker compose up -d db
Connects as the database OWNER (DATABASE_ADMIN_URL). The API and the
worker never do; they use acme_app and acme_sync.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.db import connect_admin  # noqa: E402
from app.db.migrate import migrate, reset  # noqa: E402
from app.db.seed import seed  # noqa: E402


def print_seed(result: dict) -> None:
    reg = result["register"]
    print(f"tenant {result['tenant']} ({result['source']}): {reg['documents']} documents, "
          f"{reg['groups']} groups in the register, {result['accounts']} accounts")
    if result["passwords"]:
        print("\nNew passwords (shown once; nothing stores them in clear):")
        for email, pw in result["passwords"].items():
            print(f"  {email:<28} {pw}")


def status() -> None:
    with connect_admin() as conn:
        for t in conn.execute("SELECT * FROM tenants ORDER BY slug"):
            tid = t["id"]
            people = conn.execute("SELECT count(*) AS n, count(*) FILTER (WHERE role = 'admin') AS admins "
                                  "FROM memberships WHERE tenant_id = %s", (tid,)).fetchone()
            docs = conn.execute("SELECT count(*) AS n FROM documents WHERE tenant_id = %s", (tid,)).fetchone()["n"]
            chunks = conn.execute("SELECT count(*) AS n FROM chunks WHERE tenant_id = %s AND index_name = %s",
                                  (tid, t["live_index"])).fetchone()["n"]
            last = conn.execute("SELECT * FROM sync_runs WHERE tenant_id = %s ORDER BY id DESC LIMIT 1",
                                (tid,)).fetchone()
            print(f"{t['slug']}: {t['name']}  source {t['source_kind']}:{t['source_ref']}"
                  f"{'  (sync paused)' if t['sync_paused'] else ''}")
            print(f"  people {people['n']} ({people['admins']} admin)  documents {docs}  "
                  f"live index {t['live_index'] or '(none)'} with {chunks} chunks")
            if last:
                state = "running" if last["finished_at"] is None else ("ok" if last["ok"] else
                                                                      (last["skipped_reason"] or last["error"]))
                print(f"  last sync #{last['id']} {last['trigger']} at {last['started_at'].astimezone():%Y-%m-%d %H:%M:%S}: "
                      f"{state}  {last['counts'] or ''}")
        workers = conn.execute("SELECT * FROM workers WHERE last_seen_at > now() - interval '2 minutes'").fetchall()
        print(f"\nworkers alive: {', '.join(w['id'] for w in workers) or 'none (start one: python worker.py)'}")


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd = args[0]
    if cmd == "migrate":
        ran = migrate()
        print(f"applied: {', '.join(ran)}" if ran else "up to date")
    elif cmd == "seed":
        print_seed(seed(reset_passwords="--reset-passwords" in args))
    elif cmd == "reset":
        reset()
        print(f"dropped everything; applied: {', '.join(migrate())}")
        print_seed(seed(reset_passwords=True))
    elif cmd == "status":
        status()
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
