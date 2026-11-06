# The same job on SharePoint

Acme Desk reads Google Drive because that is the real document source we can reach from a laptop. Most companies in the room run SharePoint. The pipeline does not care: everything below the connector is identical, and this page maps each Drive call to its Microsoft Graph equivalent.

## Concept by concept

| What the sync needs | Google Drive (this repo) | SharePoint, through Microsoft Graph |
|---|---|---|
| An identity for the job | a service account with a JSON key; scope `drive.readonly` | an app registration (service principal) with a client secret or certificate; application permission `Sites.Read.All`, or `Sites.Selected` for one site |
| What exists right now | `files.list(q="'<folder>' in parents and trashed=false")`, one call per folder | `GET /drives/{drive-id}/root/delta`: the first call lists everything |
| What changed since last time | `changes.getStartPageToken`, then `changes.list(pageToken=...)`; save the new token | the same `/delta` call with the `deltaLink` it gave you last time; save the new link |
| The cheap change signal | `md5Checksum` for uploads, `version` for native Docs and Sheets | `eTag` (moves on any change, metadata included) and `cTag` (content only) |
| The bytes | `files.get(fileId, alt=media)` | `GET /drives/{drive-id}/items/{item-id}/content` |
| Native formats | a Google Doc has no bytes: `files.export(mimeType="text/markdown")` | Word and Excel files are real files; `parsers.py` already reads `.docx` and `.xlsx` |
| Who may read it | `permissions.list(fileId)`: users, groups, domain, anyone-with-the-link | `GET /items/{item-id}/permissions`: users, Entra ID groups, sharing links; groups resolve through Entra ID |
| Owner, status, version, effective dates | our register file | library columns and content types, read from `listItem/fields` on each item |
| A deleted file | absent from the listing; `changes.list` reports `removed` | `/delta` returns the item one last time with a `deleted` facet |
| Push instead of polling | Drive push notifications (`files.watch`): a public HTTPS endpoint, expires, must be renewed | Graph change notifications (subscriptions): a public endpoint, expire within days, must be renewed |
| Being told to slow down | `403 rateLimitExceeded` or `429`; retry with backoff (`num_retries=3`) | `429` with a `Retry-After` header; honour it |
| Where a file lives | the folder walk builds `site/name` | `parentReference.path` on each `driveItem` |

Two things are the same on both sides and worth saying out loud:

- Polling the full listing is fine for hundreds of files and wasteful for hundreds of thousands. Both sources give you a delta feed for that; both still get polled as a backstop, because notifications get lost.
- The source's permission list tells you who may open the file today. The index needs that answer at ingest time, copied onto every chunk, because a filter can only use what was stored. That copy is what `access_filter()` in `app/rag/retriever.py` runs against, inside the vector query.

## What would change in this repo

One file. A `SharePointConnector` with the same four methods as `DriveConnector`:

```python
class SharePointConnector:
    def __init__(self, drive_id, tenant_id, client_id, client_secret): ...

    def list_items(self):
        # GET /drives/{drive_id}/root/delta, follow @odata.nextLink,
        # one SourceItem per file: path from parentReference.path + name,
        # etag from cTag, modified from lastModifiedDateTime
        ...

    def fetch(self, path):
        # GET /drives/{drive_id}/items/{item_id}/content  (302 to the bytes)
        ...

    def fetch_register(self):
        # the register file in the library, or listItem/fields on every item
        ...

    def source_url(self, path):
        # webUrl
        ...
```

Auth is `msal.ConfidentialClientApplication(...).acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])`, and every call is `httpx.get(url, headers={"Authorization": f"Bearer {token}"})`. `make_connector()` in `app/ingest/connector.py` grows a third branch. `sync.py`, `register.py`, the store and the retriever do not change, and neither do the tests that run against a fake service: swap the fake.
