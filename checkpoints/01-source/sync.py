"""
sync.py — the ingestion job. Compares the document source with the index.

    python sync.py                     # dry run: what WOULD change, and what it would cost
    python sync.py --apply             # do it, and save a report in runs/
    python sync.py --rebuild           # plan a fresh index next to the live one (blue/green)
    python sync.py --rebuild --apply
    python sync.py --rollback          # point queries back at the previous index
    python sync.py --source drive      # read the real Google Drive folder instead of .env's SOURCE
    python sync.py --naive             # checkpoint 4's one-shot /ingest, into its own collection
    python sync.py --wipe              # delete every Acme Desk index (start the demo over)

Run from anywhere: paths are resolved from the repository root.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# --source must win over .env, and app.config reads .env on import,
# so the override is applied before anything from app is imported.
if "--source" in sys.argv:
    os.environ["SOURCE"] = sys.argv[sys.argv.index("--source") + 1]

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import SOURCE  # noqa: E402
from app.ingest.sync import ModelMismatch, run_sync  # noqa: E402
from app.rag import catalog  # noqa: E402

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
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to the index (default: dry run)")
    parser.add_argument("--rebuild", action="store_true", help="build a fresh index next to the live one")
    parser.add_argument("--rollback", action="store_true", help="switch back to the previous index")
    parser.add_argument("--source", choices=["local", "drive"], help="override SOURCE from .env for this run")
    parser.add_argument("--naive", action="store_true", help="run checkpoint 4's /ingest into its own collection")
    parser.add_argument("--wipe", action="store_true", help="delete every Acme Desk index and the catalog")
    parser.add_argument("-v", "--verbose", action="store_true", help="also list unchanged documents")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    if args.wipe:
        from app.config import CATALOG_FILE
        from app.rag.store_chroma import drop_collection, get_client
        names = [c if isinstance(c, str) else c.name for c in get_client().list_collections()]
        for name in names:
            if name.startswith("acme_"):
                drop_collection(name)
                print(f"dropped {name}")
        CATALOG_FILE.unlink(missing_ok=True)
        print("Catalog removed. The next `python sync.py --apply` builds a fresh index.")
        return

    if args.rollback:
        print(f"Live index is now {catalog.rollback()}")
        return

    if args.naive:
        from app.ingest.naive import run_naive_ingest
        r = run_naive_ingest()
        print(f"Checkpoint 4's /ingest -> collection {r['collection']}")
        print(f"  upserted {r['chunks_upserted']} chunks; the collection now holds {r['chunks_in_index']}")
        print(f"  silently skipped (unsupported formats): {', '.join(r['silently_skipped']) or 'none'}")
        print(f"  embedded EMPTY text from: {', '.join(r['embedded_empty_text']) or 'none'}")
        return

    try:
        report = run_sync(apply=args.apply, rebuild=args.rebuild)
    except ModelMismatch as exc:
        sys.exit(f"STOP: {exc}")
    except FileNotFoundError as exc:
        sys.exit(f"STOP: {exc}")
    print_report(report, args.verbose)


if __name__ == "__main__":
    main()
