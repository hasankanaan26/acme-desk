# ============================================================
# Pydantic models — Part 2: the platform
# ============================================================
# From Part 1: provenance on every source, /sync and /documents.
# New in Part 2: sign-in (who you are comes from the session, so no
# request model has a "user" field any more) and the admin API.
# ============================================================

from datetime import datetime

from pydantic import BaseModel, Field


class Provenance(BaseModel):
    """Where a chunk came from. Citations are built from this, never from the LLM."""
    doc_id: str = ""
    title: str = ""
    version: int = 0
    status: str = ""
    effective_from: str = ""
    section: str = ""
    source_url: str = ""


class SearchResult(Provenance):
    """A single search result from the vector store."""
    text: str
    source: str
    chunk_index: int
    distance: float


class SearchResponse(BaseModel):
    """Response from the /search endpoint."""
    query: str
    user: str
    groups: list[str]
    as_of: str | None = None
    results: list[SearchResult]
    total_results: int


class SourceInfo(Provenance):
    """A source chunk that contributed to a RAG answer."""
    source: str
    text: str
    distance: float = 0.0
    doc_type: str = ""


class DocFilterInfo(BaseModel):
    """
    How retrieval was narrowed by doc type before the vector search.
      mode                   -> what was requested: "auto", "off" or a doc type
      doc_type               -> the doc type searched first (None = no filter)
      picked_by              -> "llm", "manual" or None
      classifier_reply       -> the LLM's raw classification reply (auto mode only)
      fallback_used          -> filtered search was too weak, so all docs were searched
      filtered_best_distance -> best distance found inside the doc type
    """
    mode: str
    doc_type: str | None = None
    picked_by: str | None = None
    classifier_reply: str | None = None
    fallback_used: bool = False
    filtered_best_distance: float | None = None


class QueryRequest(BaseModel):
    """A question to be answered using RAG."""
    question: str = Field(min_length=1, max_length=2000)


class QueryResponse(BaseModel):
    """
    A RAG-grounded answer with source attribution and confidence.

    Confidence levels:
      - "high"  -> strong match, answer is well-supported
      - "medium" -> reasonable match, answer is likely correct
      - "low"  -> weak evidence, answer may be unreliable
      - "none" -> no relevant documents found
    """
    question: str
    answer: str
    model: str
    user: str = ""
    as_of: str | None = None
    sources: list[SourceInfo]
    chunks_used: int
    confidence: str = "high"
    no_result: bool = False
    request_id: str = ""
    doc_filter: DocFilterInfo | None = None
    llm_available: bool = True        # False: no written answer (no key, quota, outage); sources still shown


class SyncDocAction(BaseModel):
    """What the sync job did (or would do) to one document."""
    doc_id: str
    path: str
    action: str
    reason: str
    chunks: int = 0
    # The evidence: eTag and content hash in the index vs in the source.
    # None = not known (not indexed yet, file gone, or not downloaded).
    signals: dict[str, str | None] = {}


class SyncResponse(BaseModel):
    """A sync plan (dry run) or a sync report (applied)."""
    applied: bool
    collection: str
    embedding_model: str
    counts: dict[str, int]
    chunks_to_embed: int
    estimated_tokens: int
    estimated_cost_usd: float
    warnings: list[str]
    documents: list[SyncDocAction]
    report_file: str | None = None


class DocumentInfo(BaseModel):
    """One register entry, next to what the index holds for it."""
    doc_id: str
    path: str
    title: str
    owner: str
    status: str
    version: int
    effective_from: str
    effective_to: str | None = None
    allowed_groups: list[str]
    readable_by_you: bool
    in_index: bool
    chunks_in_index: int


class DocumentsResponse(BaseModel):
    user: str
    groups: list[str]
    documents: list[DocumentInfo]


# ---- Part 1: the scheduler ----

class SchedulerStatus(BaseModel):
    """The timer that runs the sync job on its own (GET /sync/status)."""
    enabled: bool
    paused: bool
    running: bool
    interval: float
    runs: int
    errors: int
    skipped: int
    last_run: str | None = None
    last_seconds: float | None = None
    last_summary: dict | None = None
    last_error: str | None = None
    next_run: str | None = None
    seconds_to_next_run: int | None = None
    worker: str | None = None          # the worker process that checked in last, None = no worker running
    pending_requests: int = 0          # "Run now" clicks the worker has not picked up yet


# ---- Sign-in ----

class LoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=256)


class TenantInfo(BaseModel):
    slug: str
    name: str


class Me(BaseModel):
    """The signed-in user, as the server sees them."""
    email: str
    display_name: str
    role: str
    tenant: TenantInfo
    groups: list[str]


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(max_length=256)


# ---- Admin ----

class UserInfo(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    groups: list[str]
    is_active: bool
    last_login_at: datetime | None = None
    other_tenants: bool = False        # also a member elsewhere: password, name and active flag are not ours to change


class UserCreate(BaseModel):
    email: str = Field(max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(max_length=256)
    role: str = Field(default="member", pattern="^(member|admin)$")
    groups: list[str] = []


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, pattern="^(member|admin)$")
    groups: list[str] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, max_length=256)


class GroupInfo(BaseModel):
    id: str
    name: str
    description: str
    members: int
    documents: int


class GroupCreate(BaseModel):
    name: str = Field(pattern="^[a-z0-9-]{1,40}$")
    description: str = Field(default="", max_length=200)


class DocumentUpdate(BaseModel):
    allowed_groups: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(current|superseded|draft|withdrawn)$")


class AuditEntry(BaseModel):
    at: datetime
    actor: str
    action: str
    target: str | None = None
    detail: dict
    ip: str | None = None


class SyncRunInfo(BaseModel):
    id: int
    trigger: str
    requested_by: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
    seconds: float | None = None
    ok: bool | None = None
    skipped_reason: str | None = None
    counts: dict | None = None
    chunks_in_index: int | None = None
    error: str | None = None
