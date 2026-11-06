"""
search.py — ask the knowledge base as someone, as of a date.

    python search.py "salary range for a senior developer" --user intern
    python search.py "salary range for a senior developer" --user hr-partner
    python search.py "team dinner limit per person"                      # today
    python search.py "team dinner limit per person" --as-of 2023-06-01   # back then
    python search.py "team dinner limit per person" --index naive        # checkpoint 4's index
    python search.py "team dinner limit per person" --answer             # + the LLM's answer (costs a call)

Users: intern, eng-manager, hr-partner, finance-lead, sales-rep.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import NAIVE_COLLECTION  # noqa: E402
from app.rag import store  # noqa: E402
from app.rag.embedder import embed_text  # noqa: E402
from app.rag.retriever import resolve_user, retrieve  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("question")
    parser.add_argument("--user", default=None, help="who is asking (default: intern)")
    parser.add_argument("--as-of", default=None, help="YYYY-MM-DD: what was in force that day")
    parser.add_argument("--index", choices=["sync", "naive"], default="sync")
    parser.add_argument("-k", type=int, default=5)
    parser.add_argument("--answer", action="store_true", help="also generate an answer with the LLM")
    args = parser.parse_args()

    user, groups = resolve_user(args.user)
    if args.index == "naive":
        chunks = store.search(embed_text(args.question), top_k=args.k, collection=NAIVE_COLLECTION)
        print(f"\nCheckpoint 4's index (no permissions, no versions). Asked as: anyone\n")
    else:
        chunks = retrieve(args.question, user=user, top_k=args.k, as_of=args.as_of)
        when = f"as of {args.as_of}" if args.as_of else "today"
        print(f"\nLive index. Asked as: {user} {groups}, {when}\n")

    if not chunks:
        print("  (nothing this user may read matches)")
    for i, c in enumerate(chunks, 1):
        if args.index == "naive":
            label = c.get("source", "")
        else:
            eff = str(c.get("effective_from", ""))
            label = (f"{c.get('title')} | v{c.get('version')} | {c.get('status')} | "
                     f"from {eff[:4]}-{eff[4:6]}-{eff[6:]} | {c.get('section')}")
        body = c["text"].split("\n", 1)[-1] if args.index == "sync" else c["text"]
        print(f"{i}. [{c['distance']:.2f}] {label}")
        print("   " + body.replace("\n", " ")[:150] + ("..." if len(body) > 150 else ""))

    if args.answer and chunks:
        from app.llm import call_llm
        from app.prompts.rag_answer import RAG_SYSTEM_PROMPT
        from app.routers.query import build_context
        if args.index == "naive":
            context = "\n\n".join(f"[Source: {c['source']}]\n{c['text']}" for c in chunks)
        else:
            context = build_context(chunks)
        print("\nAnswer:\n" + call_llm(args.question, RAG_SYSTEM_PROMPT.format(context=context)))


if __name__ == "__main__":
    main()
