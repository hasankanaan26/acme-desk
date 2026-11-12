# ============================================================
# Reranker — a cross-encoder reads (question, chunk) TOGETHER
# ============================================================
# The embedding model is a BI-encoder: it turns the question and each
# chunk into vectors separately, and compares the vectors. Fast
# (millions of chunks in milliseconds), but it never sees the two
# texts side by side.
#
# A CROSS-encoder takes the pair as one input and outputs one
# relevance score. Much better judgement, much slower: one model run
# per (question, chunk) pair. So it only re-orders a short list:
#
#     retrieve 20 cheaply  ->  rerank the 20  ->  keep the top 5
#
# The model: cross-encoder/ms-marco-MiniLM-L-6-v2 (about 90 MB, CPU is
# fine), run with onnxruntime and tokenizers, which ChromaDB already
# installed. No PyTorch. Downloaded on the first rerank (a few
# seconds), then cached by huggingface_hub.
#
# A reranker cannot find what the first stage missed. It can only
# promote what is already in the candidate list.
# ============================================================

import os
import time

import numpy as np

from app.config import RERANKER_MODEL

_session = None
_tokenizer = None


def _load():
    global _session, _tokenizer
    if _session is None:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer

        model_path = hf_hub_download(RERANKER_MODEL, "onnx/model.onnx")
        tokenizer_path = hf_hub_download(RERANKER_MODEL, "tokenizer.json")
        _tokenizer = Tokenizer.from_file(tokenizer_path)
        _tokenizer.enable_truncation(max_length=512)
        _tokenizer.enable_padding()
        _session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    return _session, _tokenizer


# Purpose:
# One relevance score per text, for this question. Higher = more relevant.
def score(question: str, texts: list[str]) -> list[float]:
    if not texts:
        return []
    if os.getenv("RERANKER") == "fake":  # offline tests: count shared words
        q = set(question.lower().split())
        return [float(len(q & set(t.lower().split()))) for t in texts]
    session, tokenizer = _load()
    encoded = tokenizer.encode_batch([(question, t) for t in texts])
    feed = {
        "input_ids": np.array([e.ids for e in encoded], dtype=np.int64),
        "attention_mask": np.array([e.attention_mask for e in encoded], dtype=np.int64),
    }
    if any(i.name == "token_type_ids" for i in session.get_inputs()):
        feed["token_type_ids"] = np.array([e.type_ids for e in encoded], dtype=np.int64)
    return [float(x) for x in session.run(None, feed)[0].reshape(-1)]


def rerank(question: str, chunks: list[dict], top_k: int) -> tuple[list[dict], float]:
    """Return the top_k chunks by cross-encoder score, and the milliseconds it took."""
    start = time.perf_counter()
    scores = score(question, [c["text"] for c in chunks])
    ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
    out = [{**c, "rerank_score": round(s, 3)} for c, s in ranked[:top_k]]
    return out, (time.perf_counter() - start) * 1000
