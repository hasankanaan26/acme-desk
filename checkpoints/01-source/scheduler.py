"""
scheduler.py — the sync job on a timer, in the foreground.

    python scheduler.py                   # every SYNC_INTERVAL_SECONDS from .env (60 when unset or 0)
    python scheduler.py --interval 20
    python scheduler.py --source drive    # read the real Google Drive folder

Ctrl+C stops it. The API runs the same loop inside the server when
SYNC_INTERVAL_SECONDS > 0 (GET /sync/status shows it). This script is for a
terminal next to the API, for students without the API running, and for the
`scheduler` service in docker-compose.yml.

Run from anywhere: paths are resolved from the repository root.
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

# --source must win over .env, and app.config reads .env on import.
if "--source" in sys.argv:
    os.environ["SOURCE"] = sys.argv[sys.argv.index("--source") + 1]

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import SOURCE, SYNC_INTERVAL_SECONDS  # noqa: E402
from app.ingest import scheduler  # noqa: E402


def describe(status: dict) -> str:
    """One line per tick: what the sync decided, or why it failed."""
    stamp = time.strftime("%H:%M:%S")
    if status["last_error"]:
        return f"{stamp} tick #{status['runs']}: FAILED, index untouched: {status['last_error']}"
    summary = status["last_summary"] or {}
    counts = ", ".join(f"{k} {v}" for k, v in (summary.get("counts") or {}).items() if k != "unchanged")
    unchanged = (summary.get("counts") or {}).get("unchanged", 0)
    what = counts or "nothing to do"
    if unchanged:
        what += f" ({unchanged} unchanged)"
    return f"{stamp} tick #{status['runs']}: {what} | {summary.get('chunks_in_index')} chunks | {status['last_seconds']}s"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=float, default=None, help="seconds between ticks")
    parser.add_argument("--source", choices=["local", "drive"], help="override SOURCE from .env")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    interval = args.interval or SYNC_INTERVAL_SECONDS or 60
    print(f"Sync every {interval:g}s from source '{SOURCE}'. Ctrl+C to stop.\n")
    status = scheduler.status()
    try:
        while True:
            status = scheduler.tick()
            print(describe(status), flush=True)
            time.sleep(interval)
    except KeyboardInterrupt:
        print(f"\nStopped after {status['runs']} tick(s), {status['errors']} error(s).")


if __name__ == "__main__":
    main()
