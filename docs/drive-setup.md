# Google Drive setup

Acme Desk reads its documents from a Google Drive folder through a service account: a robot identity with its own key, the Google equivalent of a SharePoint app registration. You need a Google account (personal Gmail or Workspace), about 30 minutes, and the files in `shared/data/sites/`.

Students do not need any of this. Every checkpoint runs offline with `SOURCE=local`.

## 1. A Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com), create a project, name it `acme-desk`.
2. APIs & Services, Library: enable **Google Drive API**. Enable **Google Sheets API** too (Part 3 writes tickets to a Sheet).

## 2. The service account and its key

1. IAM & Admin, Service Accounts, Create service account. Name: `acme-desk-sync`. No roles. Done.
2. Open it, Keys tab, Add key, Create new key, JSON. Save the download as `secrets/acme-desk-sa.json` (the folder is gitignored).
3. Copy the account's email, something like `acme-desk-sync@acme-desk-123456.iam.gserviceaccount.com`. You share the folder with it in step 4.

A service account on a personal Google account has no Drive storage of its own, so it cannot upload or own files. That is exactly what we want: the sync only reads. Every edit, upload or deletion in the demo is done by you, the owner, in the Drive web UI.

## 3. The folder

1. In Drive: New, Folder, `Acme Corp Documents`.
2. Inside it, seven folders named exactly `company`, `engineering`, `finance`, `hr`, `it`, `leadership`, `people`.
3. Before uploading, open Drive settings (the gear) and untick **Convert uploads to Google Docs editor format**. Uploaded files then keep their bytes and get an `md5Checksum`, which is the change signal the sync uses.
4. Drag the files from `shared/data/sites/<site>/` into the matching folder. 20 files in all.

## 4. Share it with the service account

Right-click `Acme Corp Documents`, Share, paste the service account's email, role **Viewer**, untick "Notify people", Share. The seven folders inherit it.

Copy the folder id from the address bar: `https://drive.google.com/drive/folders/<THIS PART>`.

## 5. `.env`

```
SOURCE=drive
DRIVE_SA_KEY=secrets/acme-desk-sa.json
DRIVE_ROOT_FOLDER_ID=<the id from step 4>
SYNC_INTERVAL_SECONDS=60          # for class; 0 keeps the sync manual
```

## 6. Check, then sync

```
python checkpoints/01-source/drive_admin.py check     # READY for class, or what is missing
python checkpoints/01-source/drive_admin.py tree      # every file with its md5 or version
python checkpoints/01-source/sync.py --source drive   # dry run: add 18, quarantine 1, skip 1
python checkpoints/01-source/sync.py --source drive --apply
```

Run `check` again 20 minutes before every class.

## 7. The live edit (two ways, test both on Saturday)

**A. A native Google Doc.** Right-click `hr/leave-policy.md`, Open with, Google Docs. Drive creates a Google Doc called `leave-policy` next to the file. Move the original `.md` to the trash: the connector names the Doc `hr/leave-policy.md` (its export suffix), and two items with the same path would shadow each other. Then compare the export with the original:

```
python checkpoints/01-source/drive_admin.py fetch hr/leave-policy.md /tmp/leave.md
git diff --no-index shared/data/sites/hr/leave-policy.md /tmp/leave.md
```

If the `##` headings survive, this is the demo: edit the Doc in the browser (carry-over 5 to 10 days) and the next tick plans `change`. If the export mangles the structure, try `DRIVE_DOC_EXPORT=html`, or use B.

**B. Upload a new version.** Keep the `.md` as an upload. Edit a local copy, then right-click the file in Drive, Manage versions, Upload new version. Same file id, new `md5Checksum`. Fewer surprises, one more click.

## 8. The live deletion

Right-click `leadership/q3-planning-notes.md`, Move to trash. The next tick plans `remove`. Before the next class, restore it from the trash (`check` will tell you it is missing if you forget).

## 9. Register changes

The register stays a local file, `shared/data/register.json`, so an ACL or status change is an edit to that file. For the salary-bands demo (event 4) edit `allowed_groups` live, then `git checkout shared/data/register.json` afterwards.

If you would rather keep it in Drive: upload `register.json` to the root folder as `_register.json`, set `REGISTER_SOURCE=drive`, and change it through Manage versions.

## 10. Part 3: the tickets Sheet

New, Google Sheets, `Acme Desk Tickets`. Three tabs, `Tickets`, `LeaveRequests`, `Outbox`, each with a header row (see `checkpoints/03-tools/app/tools/backend_sheets.py` for the columns). Share with the service account as **Editor**. The id from the URL goes into `SHEETS_SPREADSHEET_ID`.

## Troubleshooting

| You see | It means |
|---|---|
| `DRIVE_ROOT_FOLDER_ID is not set` | step 5 |
| `No service-account key at secrets/...` | step 2, or the path in `.env` |
| `404 File not found` on the root folder | the folder is not shared with the service account (step 4), or the id is wrong |
| `403 ... API has not been used in project` | step 1, enable the Drive API, wait a minute |
| `check` lists a file as missing | the name differs from the register's path, or it sits in the wrong folder |
| The Doc export has no `##` headings | `DRIVE_DOC_EXPORT=html`, or use method B |
| A tick fails mid-demo | the scheduler counts the error and leaves the index alone; press Run now, or fall back to `SOURCE=local` and `fake_drive.py apply 2` |

Quota is not a concern: one tick is one listing call per folder (8 calls) and a download only for files whose signal moved.
