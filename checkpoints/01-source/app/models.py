# ============================================================
# Pydantic models — Checkpoint 5
# ============================================================
# Checkpoint 4: confidence + no_result, doc_type routing info.
# Added in Checkpoint 5:
#   - every source carries its provenance: doc_id, title, version,
#     status, effective date, section and a link back to the source
#   - answers say WHO asked (user) and AS OF which date
#   - /sync and /documents responses
# ============================================================

from pydantic import BaseModel


class Question(BaseModel):
    """A user question sent to the assistant."""
    question: str


class Answer(BaseModel):
    """A plain LLM answer — may or may not be grounded in context."""
    answer: str
    model: str
    grounded: bool = False


class ChunkInfo(BaseModel):
    """Metadata about a single chunk — used in API responses."""
    text: str
    source: str
    chunk_index: int
    doc_type: str = ""


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


class StoredChunkInfo(BaseModel):
    """Detailed info about a stored chunk."""
    id: str
    text: str
    source: str
    chunk_index: int
    doc_type: str = ""
    metadata: dict[str, str | int | float | bool] = {}
    embedding_preview: list[float] | None = None
    embedding_dimensions: int | None = None


class StoreInspectResponse(BaseModel):
    """Response from the /store/inspect endpoint."""
    collection: str
    total_stored: int
    sources: list[str]
    chunks: list[StoredChunkInfo]


class EmbedRequest(BaseModel):
    """Request to embed texts for exploration."""
    texts: list[str]


class EmbedResponse(BaseModel):
    """Response with pairwise distances between embedded texts."""
    distances: dict[str, float]
    dimensions: int


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
    question: str


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


class CompareRequest(BaseModel):
    """A question to compare RAG vs plain LLM answers."""
    question: str


class PlainResult(BaseModel):
    """The plain (non-RAG) LLM answer."""
    answer: str
    model: str


class RAGResult(BaseModel):
    """The RAG-grounded answer with transparency metadata."""
    answer: str
    model: str
    sources: list[SourceInfo]
    chunks_used: int
    confidence: str
    no_result: bool


class CompareResponse(BaseModel):
    """Side-by-side comparison of RAG vs plain LLM for the same question."""
    question: str
    rag: RAGResult
    plain: PlainResult
    note: str
    request_id: str = ""


# ---- Checkpoint 5: the sync job and the document list ----

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
