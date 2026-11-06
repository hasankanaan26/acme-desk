"""
sync.py — the ingestion job, by hand. Compares a tenant's documents with its index.

    python sync.py                     # dry run: what WOULD change, and what it would cost
    python sync.py --apply             # do it (recorded in sync_runs, like the worker's runs)
    python sync.py --rebuild           # plan a fresh index next to the live one (blue/green)
    python sync.py --rebuild --apply
    python sync.py --rollback          # point searches back at the previous index
    python sync.py --wipe              # delete the tenant's indexes (start the demo over)
    python sync.py --tenant acme       # which tenant (default: acme)

Part 2: the worker (python worker.py) does this on a timer. This script
does the same thing once, as the same database role (acme_sync), and
takes the same per-tenant lock, so it never collides with a worker.
Where the documents are comes from the tenant's row, not from .env.
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import db  # noqa: E402
from app.ingest.sync import ModelMismatch  # noqa: E402
from app.ingest.worker import run_tenant, tenant_by_slug  # noqa: E402
from app.rag import catalog  # noqa: E402

SOURCE = ""  # set in main(): the tenant's source, for the report header

ICONS = {"add": "+", "change": "~", "relabel": "*", "touch": "=", "remove": "-",
         "quarantine": "!", "skip": ".", "unchanged": " "}


def print_report(report: dict, verbose: bool) -> None:
    mode = "APPLIED" if report["applied"] else "DRY RUN (nothing written)"
    print(f"\n{mode}  ->  index {report['collection']}  ({report['embedding_model']})  source: {SOURCE}")
    if report.get("full_build"):
        print("Full build: every document is parsed and embedded.")
    print()
    for d in report["documents"]:
        if d["action"] == "unchanged" and not verbose:
            continue
        pii = f"  [PII redacted: {d['pii']}]" if d.get("pii") else ""
        print(f" {ICONS[d['action']]} {d['action']:<10} {d['doc_id']:<24} {d['reason']}{pii}")
    unchanged = report["counts"].get("unchanged", 0)
    if unchanged and not verbose:
        print(f"   unchanged  {unchanged} document(s), not even downloaded (use -v to list)")

    print("\nCounts: " + ", ".join(f"{k} {v}" for k, v in report["counts"].items()))
    print(f"To embed: {report['chunks_to_embed']} chunk(s), about {report['estimated_tokens']:,} tokens, "
          f"est. ${report['estimated_cost_usd']:.4f} at ${report['price_per_1m_tokens']}/1M tokens "
          f"(${report['estimated_cost_at_gemini_prices_usd']:.4f} at Gemini embedding prices)")
    if report["warnings"]:
        print("\nFor a human to look at:")
        for w in report["warnings"]:
            print(f"  - {w}")
    if report["applied"]:
        print(f"\nDone in {report['seconds']}s, {report.get('embed_batches', 0)} embedding batch(es). "
              f"Index now holds {report['chunks_in_index']} chunks.")
        if "activated" in report:
            state = "LIVE" if report["activated"] else "NOT activated"
            print(f"Smoke check: {', '.join(report['smoke_check'])}. New index is {state}.")
        print(f"Report: {report['report_file']}")
    else:
        print("\nNothing was written. Add --apply to run it.")


def main() -> None:
    global SOURCE
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to the index (default: dry run)")
    parser.add_argument("--rebuild", action="store_true", help="build a fresh index next to the live one")
    parser.add_argument("--rollback", action="store_true", help="switch back to the previous index")
    parser.add_argument("--wipe", action="store_true", help="delete every index of the tenant")
    parser.add_argument("--tenant", default="acme", help="the tenant's slug (default: acme)")
    parser.add_argument("-v", "--verbose", action="store_true", help="also list unchanged documents")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    tenant = tenant_by_slug(args.tenant)
    SOURCE = f"{tenant['source_kind']}:{tenant['source_ref']}"

    if args.wipe:
        with db.tx("sync", tenant["id"]) as conn:
            conn.execute("UPDATE tenants SET live_index = NULL, previous_index = NULL WHERE id = app_tenant()")
            n = conn.execute("DELETE FROM search_indexes").rowcount
        print(f"{args.tenant}: dropped {n} index(es). The next `python sync.py --apply` builds a fresh one.")
        return

    if args.rollback:
        with db.tx("sync", tenant["id"]):
            print(f"Live index is now {catalog.rollback()}")
        return

    try:
        result = run_tenant(tenant, trigger="cli", apply=args.apply, rebuild=args.rebuild)
    except (ModelMismatch, FileNotFoundError) as exc:
        sys.exit(f"STOP: {exc}")
    if result["skipped"]:
        sys.exit(f"STOP: {result['skipped']}")
    if result["error"]:
        sys.exit(f"STOP (sync run #{result['run_id']}, index untouched): {result['error']}")
    report = result["report"]
    if result["run_id"]:
        report["report_file"] = f"sync run #{result['run_id']} (and {report.get('report_file')})"
    print_report(report, args.verbose)


if __name__ == "__main__":
    main()
