"""
worker.py — the sync worker (Part 2). Keeps every tenant's index true to its documents.

    python worker.py                   # sync each tenant every SYNC_INTERVAL_SECONDS, and on Run now
    python worker.py --interval 20     # a tick every 20 s
    python worker.py --once            # one round over all tenants, then exit (cron-style)

Runs as the database role acme_sync: it may write chunks and indexes,
and cannot read users, sessions or groups. Start as many as you like;
a per-tenant advisory lock in Postgres lets only one sync a tenant at
a time. Stop with Ctrl+C: the sync in progress rolls back, untouched.
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import SYNC_INTERVAL_SECONDS  # noqa: E402
from app.ingest.worker import loop  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=float, default=SYNC_INTERVAL_SECONDS, help="seconds between ticks")
    parser.add_argument("--once", action="store_true", help="one round over all tenants, then exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)-13s | %(message)s", datefmt="%H:%M:%S")
    for noisy in ("httpx", "googleapiclient.discovery_cache", "psycopg.pool"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    try:
        loop(interval=args.interval, once=args.once)
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
