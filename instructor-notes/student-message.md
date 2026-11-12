# Message to the cohort (send Sunday)

Fill in the start time before sending.

> Sent Sunday 8 Nov. The plan changed on 11 Nov: Part 2 became retrieval techniques, and Part 3
> (Fri 13 Nov) is "which search wins, and how you prove it" (two indexes, parent-document, HyDE and
> a scoreboard), because tools and agents were covered in an earlier course. The message below is
> what went out; the README and CHECKPOINTS.md have the current plan.

---

Subject: Monday's plan and the last four sessions

Friday ran short and I owe you a proper ending. Here is what happens instead of the schedule you have.

The capstone is cancelled. No design doc is due, nothing to submit, no demo day. If you already wrote one and want comments, send it and I'll read it.

The last four sessions build one production app together: Acme Desk, an employee helpdesk assistant over Acme's documents, in a new repo.

- Part 1 (Mon): the ingestion pipeline from Session 8 on a real document source (Google Drive), synced on a schedule.
- Part 2 (Wed): the chat assistant with LangGraph, retrieval and identity.
- Part 3 (Fri): tools and agents with real security controls.
- Part 4 (Mon 16): guardrails, evals as a release gate, and shipping it.

Every checkpoint runs offline on your laptop with no Google account: local folder mode and local embeddings. Your LLM key is only needed for answers from Part 2 on.

Before Monday (15 minutes):

```
git clone https://github.com/hasankanaan26/acme-desk
cd acme-desk
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
python warmup.py                # downloads one small model, about 80 MB; slow on class Wi-Fi
```

Pull again Monday morning. See you at <TIME>.
