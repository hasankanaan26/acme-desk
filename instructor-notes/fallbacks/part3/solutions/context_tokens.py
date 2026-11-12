# Part 3, tonight's exercise 2: the price nobody prints.
# Don't share this tonight. Three changes.

# 1. app/evals/scoreboard.py: replace the TODO stub
def context_tokens(chunks: list[dict]) -> int:
    """About how many tokens the results put in front of the model (4 characters ~ 1 token)."""
    return sum(len(c.get("text", "")) for c in chunks) // 4


# 2. app/evals/scoreboard.py, in summarize(): one more key
#        "tokens": round(statistics.median(r["tokens"] for r in rows), 0) if rows else None,
#    (summarize() is also called on rows without "tokens" in the test: use r.get("tokens", 0))

# 3. scoreboard.py, in evaluate(): count it per question, and print the column
#        rows.append({..., "tokens": context_tokens(run.chunks), ...})
#    and in print_scenario(): a "tok/q" column, _cell(s['tokens'], 7, 0)
#
# What students should see (top 5, Monday, local MiniLM, measured 12 Nov): median tokens per
# question dense ~360, hybrid ~378, parent ~396, small ~228. parent costs a little more than
# dense (it returns whole sections, and its 5 sections are often longer ones); small costs about
# 60% of dense. On whole-section questions small is cheap AND wrong (Hit@5 0.25). The cheap
# answer is not the one with the fewest tokens: it is the one that is right first time.
