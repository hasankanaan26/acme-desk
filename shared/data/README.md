# Acme's SharePoint (`data/enterprise/`)

Written for the instructor. The corpus behind checkpoints 5 and 6: the same Acme Corp as
`data/knowledge/`, organised the way a company keeps documents, with the traps a real source has.
Nothing here is read directly by the sync job: `sharepoint.py reset` copies it to
`workspace/sharepoint/`, and the events are replayed there.

## Layout

| Path | What it is |
|---|---|
| `sites/<site>/...` | 20 files in 7 sites: hr, finance, engineering, it, company, people, leadership |
| `register.json` | Friday's register: one entry per file (owner, allowed groups, status, version, dates, links between documents) |
| `identities.json` | Five users and their groups: intern, eng-manager, hr-partner, finance-lead, sales-rep |
| `events/events.json` | The weekend: five changes, each a list of file and register operations |
| `events/files/` | The new and edited files the events copy in |

Ten files come from `data/knowledge/` (the leave, expense, remote work, onboarding, coding, stack,
FAQ, directory and meeting-notes documents). Five come from the previous bootcamp's ingestion
samples (engineering handbook PDF, scanned incident report, onboarding .docx, Q3 metrics .xlsx,
release email). The rest are new.

## The planted traps

| Trap | Where | What it tests |
|---|---|---|
| Formats Checkpoint 4 skips | `.docx`, `.xlsx`, `.html`, two `.eml` | silent skips vs format-aware parsing |
| A scan | `engineering/incident-report-scanned.pdf` (no text layer) | quarantine instead of embedding "" |
| Page chrome | `engineering/wiki-vector-database.html` (cookie banner, nav, sidebar, footer, scripts) | article extraction |
| A draft | `hr/parental-leave-2027-draft.md` (status `draft`, 24 weeks) | drafts never indexed |
| Mis-shared file | `hr/salary-bands-2026.md` readable by `employees` on Friday | event 4 relabels it; leak window |
| An amendment | `finance/expense-policy-2024-update.md` `amends` the 2023 policy | two current documents that disagree |
| Personal data | `it/phishing-notice-2026-10.eml`, `it/helpdesk-export-2026-10.csv` | 7 values redacted (3 emails, 4 phones); corporate addresses kept |
| Two onboarding owners | HR checklist vs engineering guide, same topic, no link | register warning: ask the owners |
| A quoting document | `company/company-faq.md` `depends_on` the leave and expense policies | stale-copy warning after events 1 and 2 |
| No register entry | (add any file) | fail closed: not indexed |

## The weekend (events)

1. Finance publishes `expense-policy-2026.md` (effective 2026-11-01): 2023 policy and 2024 update superseded.
2. HR edits the leave policy in place: carry-over 5 → 10 days; unpaid leave and public holidays move out (the file shrinks: orphan chunks for Checkpoint 4's upsert).
3. Legal deletes the Q3 planning notes (ghosts for Checkpoint 4).
4. HR restricts the salary bands to `hr` and `managers` (a relabel: no text changes).
5. The wiki footer changes (new bytes, same text: a `touch`, nothing re-embedded).

## Numbers worth knowing

- Expense rules by date: team meals $50 (2023) → $75 (2024) → $90 (2026); domestic per diem $60 → $75 → $85.
- Directory: 6 people in San Francisco, 3 Remote, 3 in New York (the list questions in checkpoint 6).
- Both golden sets (`checkpoint-5.../app/evals/golden.json`, `checkpoint-6.../app/evals/golden_retrieval.json`) describe MONDAY: all five events applied.
