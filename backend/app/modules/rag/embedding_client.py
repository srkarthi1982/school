"""Client for the external bge-m3 embedding sidecar (HF text-embeddings-inference
or Infinity), spoken over the OpenAI-compatible ``/v1/embeddings`` endpoint.

Sync by design: ingestion runs in APScheduler worker threads and search runs in
the request thread (both sync SQLAlchemy), so an async client would buy nothing.
Mirrors the config pattern of the LLM client (configurable base URL, key, verify,
timeout).
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    """Raised when the embedding service cannot be reached or returns garbage."""


class EmbeddingClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.EMBEDDING_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.EMBEDDING_API_KEY
        self.model = model or settings.EMBEDDING_MODEL
        self._client = httpx.Client(
            verify=settings.EMBEDDING_VERIFY_SSL,
            timeout=settings.EMBEDDING_TIMEOUT_SECONDS,
        )

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.post(
            f"{self.base_url}{settings.EMBEDDING_PATH}",
            headers=self._headers(),
            json={"model": self.model, "input": texts,"encoding_format": "float"},
        )
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("data")
        if not isinstance(rows, list) or len(rows) != len(texts):
            raise EmbeddingError("Unexpected embedding response shape.")
        # Preserve request order regardless of how the server returns indices.
        rows_sorted = sorted(rows, key=lambda r: r.get("index", 0))
        vectors = [r["embedding"] for r in rows_sorted]
        for v in vectors:
            if len(v) != settings.EMBEDDING_DIM:
                raise EmbeddingError(
                    f"Embedding dim {len(v)} != configured EMBEDDING_DIM "
                    f"{settings.EMBEDDING_DIM}."
                )
        return vectors

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed many texts, batched by EMBEDDING_BATCH_SIZE."""
        if not texts:
            return []
        out: list[list[float]] = []
        batch = max(1, settings.EMBEDDING_BATCH_SIZE)
        for i in range(0, len(texts), batch):
            out.extend(self._embed_batch(texts[i : i + batch]))
        return out

    def embed_query(self, text: str) -> list[float]:
        return self._embed_batch([text])[0]

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass


class LocalEmbeddingClient:
    """In-process dense embeddings (bge-m3, 1024-dim), via either
    sentence-transformers or FlagEmbedding (settings.EMBEDDING_LOCAL_ENGINE).

    The model is a lazily-loaded process-wide singleton. Heavy: pulls torch and
    holds ~2.3GB per process — prefer the http backend when running many uvicorn
    workers. Requires the optional dep for the chosen engine.

    FlagEmbedding is the official bge-m3 wrapper and can also emit sparse
    (lexical) vectors — see ``embed_sparse`` — the hook for a future true
    dense+sparse hybrid (which would also need a pgvector ``sparsevec`` column).
    """

    _model = None  # process-wide singleton
    _engine: str | None = None

    @classmethod
    def _load(cls):
        if cls._model is not None:
            return cls._model, cls._engine
        engine = settings.EMBEDDING_LOCAL_ENGINE.lower()
        name = settings.EMBEDDING_LOCAL_MODEL
        if engine == "flagembedding":
            try:
                from FlagEmbedding import BGEM3FlagModel
            except ImportError as exc:  # pragma: no cover
                raise EmbeddingError(
                    "EMBEDDING_LOCAL_ENGINE=flagembedding requires FlagEmbedding "
                    "(pip install FlagEmbedding)."
                ) from exc
            logger.info("Loading FlagEmbedding %s…", name)
            cls._model = BGEM3FlagModel(name, use_fp16=settings.EMBEDDING_LOCAL_DEVICE != "cpu")
            cls._engine = "flagembedding"
        else:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:  # pragma: no cover
                raise EmbeddingError(
                    "EMBEDDING_BACKEND=local requires sentence-transformers "
                    "(pip install 'sentence-transformers')."
                ) from exc
            logger.info("Loading sentence-transformers %s (%s)…", name, settings.EMBEDDING_LOCAL_DEVICE)
            cls._model = SentenceTransformer(name, device=settings.EMBEDDING_LOCAL_DEVICE)
            cls._engine = "sentence-transformers"
        return cls._model, cls._engine

    def _check_dims(self, vecs: list[list[float]]) -> list[list[float]]:
        for v in vecs:
            if len(v) != settings.EMBEDDING_DIM:
                raise EmbeddingError(
                    f"Local embedding dim {len(v)} != configured EMBEDDING_DIM "
                    f"{settings.EMBEDDING_DIM}."
                )
        return vecs

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model, engine = self._load()
        batch = max(1, settings.EMBEDDING_BATCH_SIZE)
        if engine == "flagembedding":
            out = model.encode(
                texts, batch_size=batch,
                return_dense=True, return_sparse=False, return_colbert_vecs=False,
            )
            vecs = [v.tolist() for v in out["dense_vecs"]]
        else:
            arr = model.encode(
                texts, normalize_embeddings=True, convert_to_numpy=True, batch_size=batch
            )
            vecs = [v.tolist() for v in arr]
        return self._check_dims(vecs)

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def embed_sparse(self, texts: list[str]) -> list[dict]:
        """Lexical (sparse) weights {token_id: weight} — FlagEmbedding only. Not
        yet wired into search; the hook for a future dense+sparse hybrid."""
        model, engine = self._load()
        if engine != "flagembedding":
            raise EmbeddingError(
                "Sparse embeddings require EMBEDDING_LOCAL_ENGINE=flagembedding."
            )
        out = model.encode(
            texts, return_dense=False, return_sparse=True, return_colbert_vecs=False
        )
        return out["lexical_weights"]

    def close(self) -> None:
        pass


def make_embedding_client():
    """Return the embedding client for the configured EMBEDDING_BACKEND."""
    if settings.EMBEDDING_BACKEND.lower() == "local":
        return LocalEmbeddingClient()
    return EmbeddingClient()
