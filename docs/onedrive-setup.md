# OneDrive (or SharePoint) setup

Acme Desk can read its documents from a OneDrive folder, or from a SharePoint document library (the same API), through Microsoft Graph. The connector is `checkpoints/01-source/app/ingest/connector_onedrive.py`; `SOURCE=onedrive` selects it. Nothing below the connector changes.

You need a Microsoft account and an **app registration** in Microsoft Entra ID (the Microsoft equivalent of the Google service account). Pick one of two ways to sign in:

| | `ONEDRIVE_AUTH=device` | `ONEDRIVE_AUTH=app` |
|---|---|---|
| Who signs in | you, once, in a browser | the app itself, every run, with a secret |
| Works with | **personal** accounts (outlook.com, hotmail, live) and work/school | work/school (Microsoft 365) only |
| Permission | delegated `Files.Read`, no admin needed | application `Files.Read.All` or `Sites.Read.All`, **an admin must consent** |
| What it can read | your own OneDrive | any user's OneDrive or SharePoint site in the organisation |
| Kept on disk | a refresh token in `secrets/onedrive-token.json` | nothing; the secret lives in `.env` |

A personal OneDrive has no app-only access at all, so a personal account always means `device`.

## 1. The folder

1. In OneDrive on the web: New, Folder, `Acme Corp Documents`.
2. Inside it, seven folders named exactly `company`, `engineering`, `finance`, `hr`, `it`, `leadership`, `people`.
3. Drag the files from `shared/data/sites/<site>/` into the matching folder. 20 files in all.

OneDrive keeps uploads as they are (no conversion), so every file has a content hash (`quickXorHash`), which is the change signal the sync uses.

## 2. The app registration

1. Open [entra.microsoft.com](https://entra.microsoft.com) (or portal.azure.com, Microsoft Entra ID), App registrations, **New registration**. Signing in with a personal account creates a free directory for you the first time.
   - Name: `acme-desk-sync`
   - Supported account types:
     - personal account: **Accounts in any organizational directory and personal Microsoft accounts**
     - work/school: **Accounts in this organizational directory only**
   - Redirect URI: leave empty. Register.
2. On the Overview page, copy the **Application (client) ID**, and for work/school also the **Directory (tenant) ID**.

### 2a. For `device` (personal or work account)

3. Authentication, Advanced settings, **Allow public client flows: Yes**. Save.
4. API permissions, Add a permission, Microsoft Graph, **Delegated permissions**, `Files.Read`. Add. (`User.Read` is there already; leave it.)

### 2b. For `app` (work/school, admin required)

3. Certificates & secrets, New client secret. Copy its **Value** right away (it is shown once; the Secret ID is not the secret).
4. API permissions, Add a permission, Microsoft Graph, **Application permissions**:
   - a user's OneDrive: `Files.Read.All`
   - a SharePoint library: `Sites.Read.All`, or `Sites.Selected` plus a grant for that one site (least privilege)
5. **Grant admin consent for <your organisation>**. Until the status column shows a green tick, every call is a 403.

`Files.Read.All` as an application permission reads every file in the organisation. That is why it needs an admin, and why `Sites.Selected` exists.

## 3. `.env`

Personal account:

```
SOURCE=onedrive
ONEDRIVE_AUTH=device
ONEDRIVE_TENANT_ID=consumers
ONEDRIVE_CLIENT_ID=<Application (client) ID>
ONEDRIVE_FOLDER=Acme Corp Documents
```

Work/school account, signing in yourself: the same, with `ONEDRIVE_TENANT_ID=<Directory (tenant) ID>`.

Work/school, app-only:

```
SOURCE=onedrive
ONEDRIVE_AUTH=app
ONEDRIVE_TENANT_ID=<Directory (tenant) ID>
ONEDRIVE_CLIENT_ID=<Application (client) ID>
ONEDRIVE_CLIENT_SECRET=<the secret's Value>
ONEDRIVE_DRIVE=dana@yourco.onmicrosoft.com     # whose OneDrive, or a drive id (below)
ONEDRIVE_FOLDER=Acme Corp Documents
```

`ONEDRIVE_DRIVE` takes three shapes: empty (your own, `device` only), a sign-in name (that person's OneDrive), or a **drive id** (any drive, including a SharePoint library). To find a library's drive id, in [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer):

```
GET https://graph.microsoft.com/v1.0/sites/yourco.sharepoint.com:/sites/AcmeCorp:/drives
```

and copy the `id` of the library (it starts with `b!`). `ONEDRIVE_FOLDER` is then the folder path inside that library, or empty for its root.

## 4. Sign in (device only), check, then sync

```
python checkpoints/01-source/onedrive_admin.py login       # prints a code: enter it at microsoft.com/devicelogin
python checkpoints/01-source/onedrive_admin.py check       # READY, or what is missing
python checkpoints/01-source/onedrive_admin.py tree        # every file with its content hash
python checkpoints/01-source/sync.py --source onedrive     # dry run: add 18, quarantine 1, skip 1
python checkpoints/01-source/sync.py --source onedrive --apply
```

`login` is once per machine. The refresh token renews itself on every sync; one that goes unused for about 90 days expires, and `login` again fixes it.

## 5. The live edit and the live deletion

- **Edit:** open `hr/leave-policy.md` in OneDrive, or edit a local copy and upload it over the original (Replace). The content hash moves and the next tick plans `change`.
- **A metadata-only change** (a comment, a tag, uploading the same bytes again): the `eTag` moves but the content hash does not, so the plan says `unchanged` and nothing is downloaded or re-embedded.
- **Delete:** delete `leadership/q3-planning-notes.md`. The next tick plans `remove`. Restore it from the Recycle bin afterwards.

## 6. Register changes

As for Google Drive: the register is `shared/data/register.json` by default. To keep it in OneDrive instead, upload `register.json` to the root of `ONEDRIVE_FOLDER` as `_register.json` and set `REGISTER_SOURCE=drive`.

## Troubleshooting

| You see | It means |
|---|---|
| `ONEDRIVE_AUTH=device needs ONEDRIVE_CLIENT_ID` | step 3 |
| `Not signed in to OneDrive` | run `onedrive_admin.py login` |
| `AADSTS7000218` ... Allow public client flows | step 2a.3 |
| `AADSTS50020` or `AADSTS50194` | personal account against a single-tenant app: register with "personal Microsoft accounts" and use `ONEDRIVE_TENANT_ID=consumers` |
| `AADSTS7000215` invalid client secret | you copied the Secret ID, not the Value; or it expired |
| `AADSTS65001` / Graph 403 `accessDenied` | the permission was added but not consented (step 2b.5) |
| Graph 404 on `root:/...` | `ONEDRIVE_FOLDER` does not exist at that path in that drive |
| `ONEDRIVE_AUTH=app has no 'me'` | app-only needs `ONEDRIVE_DRIVE` |
| `invalid_grant` on a sync | the refresh token expired or was revoked: `login` again |
| a file is listed by `tree` but never synced | it is not in the register (fail closed), or it is a shortcut or a OneNote notebook |
