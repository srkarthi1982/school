from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic.fields import FieldInfo
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource
from pydantic_settings.sources import DotEnvSettingsSource


class _CsvOrJsonDotEnvSource(DotEnvSettingsSource):
    _CSV_FIELDS = frozenset({"FILE_SHARING_ALLOWED_TYPES",
                            "ALLOWED_ATTACHMENT_TYPES", "MATERIAL_ALLOWED_TYPES",
                            "RAG_ALLOWED_CONTENT_TYPES",
                            "ANALYTICS_EXCLUDED_FEATURES"})

    def decode_complex_value(self, field_name: str, field: FieldInfo, value: Any) -> Any:
        if field_name in self._CSV_FIELDS and isinstance(value, str) and not value.lstrip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return super().decode_complex_value(field_name, field, value)


_DEFAULT_SECRET = "change-me-to-a-random-secret-key"


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/academic_db"
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ESNAAD_BASE_URL: str = "http://localhost:5008/api"
    ESNAAD_API_KEY: str = ""
    # Cookie settings for refresh token
    COOKIE_SECURE: bool = False  # Set True in production (HTTPS)
    COOKIE_SAMESITE: str = "lax"  # "strict" | "lax" | "none"

    # LDAP
    LDAP_MOCK: bool = False
    LDAP_SERVER: str = "ldap://localhost:389"
    LDAP_BASE_DN: str = "dc=example,dc=com"
    LDAP_USER_DN_TEMPLATE: str = "uid={username},ou=users,dc=example,dc=com"
    LDAP_SEARCH_FILTER: str = "(uid={username})"

    # Logging
    LOG_LEVEL: str = "INFO"
    SQL_LOG_LEVEL: str = "WARNING"
    # Rotating file log (daily, 14 days) written regardless of how the server
    # is launched, so no shell redirection (`> server.log 2>&1`) is needed.
    LOG_TO_FILE: bool = True
    LOG_DIR: Path = Path(__file__).parent.parent.parent / "logs"

    # When True, unhandled (500) responses expose the exception type, message and
    # a short traceback to the client so the UI can show why it failed. Keep this
    # ON in dev/staging; set False in production to avoid leaking internals.
    DEBUG: bool = True

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173", "http://localhost:3000"]

    # Allow all origins in development (only use in dev, not production!)
    ALLOW_ALL_ORIGINS: bool = True

    # Isolated internal 3D aircraft viewer
    AIRCRAFT_VIEWER_ENABLED: bool = True

    # Chat attachments
    PRIVATE_UPLOAD_DIR: Path = Path(
        __file__).parent.parent.parent / "private_uploads" / "chat"
    MAX_ATTACHMENT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    MAX_ATTACHMENTS_PER_MESSAGE: int = 5
    ALLOWED_ATTACHMENT_TYPES: set[str] = {
        # Images
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        # Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        # Text
        "text/plain",
        "text/csv",
        "text/markdown",
        "text/html",
        "application/json",
        # Video
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/x-msvideo",
        "video/mpeg",
    }

 # Library attachments
    LIBRARY_UPLOAD_DIR: Path = Path(__file__).parent.parent.parent / "private_uploads" / "library"
    MAX_ATTACHMENT_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    MAX_ATTACHMENTS_PER_MESSAGE: int = 5
    ALLOWED_ATTACHMENT_TYPES: set[str] = {
        # Images
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        # Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        # Text
        "text/plain",
        "text/csv",
        "text/markdown",
        "text/html",
        "application/json",
        # Video
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "video/x-msvideo",
        "video/mpeg",
    }

    # File Sharing
    FILE_SHARING_UPLOAD_DIR: Path = Path(
        __file__).parent.parent.parent / "private_uploads" / "files"
    FILE_SHARING_MAX_FILE_SIZE_BYTES: int = 100 * 1024 * 1024  # 100 MB
    FILE_SHARING_ALLOWED_TYPES: set[str] = {
        # Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        # Images
        "image/jpeg",
        "image/png",
        # Videos
        "video/mp4",
        "video/webm",
        "video/quicktime",
        # Text
        "text/plain",
     }
    FILE_SHARING_STORAGE_BACKEND: str = "filesystem"  # future: "database", "s3"

    # Course Builder — Material
    MATERIAL_UPLOAD_DIR: Path = Path(
        __file__).parent.parent / "private_uploads" / "materials"
    MATERIAL_MAX_FILE_SIZE_BYTES: int = 200 * 1024 * 1024  # 200 MB (videos)
    MATERIAL_ALLOWED_TYPES: set[str] = {
        # Documents
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        # Images
        "image/jpeg",
        "image/png",
        # Audio
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        # Video
        "video/mp4",
        "video/quicktime",
    }

    # Document Summarization Service
    DOC_SUMMARY_BASE_URL: str = ""
    DOC_SUMMARY_API_KEY: str = ""  # reserved for future use
    DOC_SUMMARY_WEBHOOK_BASE_URL: str = "http://localhost:8000"

    # AI agent (AskMAI) — OpenAI-compatible chat-completions endpoint
    LLM_BASE_URL: str = "http://localhost:11434/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "qwen2.5:14b"
    LLM_MAX_TOKENS: int = 1024
    LLM_TEMPERATURE: float = 0.2
    LLM_VERIFY_SSL: bool = False
    LLM_TIMEOUT_SECONDS: float = 120.0
    AGENT_HISTORY_LIMIT: int = 12
    AGENT_MAX_ITERATIONS: int = 6
    AGENT_MAX_CONCURRENCY: int = 4
    AGENT_RUN_TIMEOUT_SECONDS: float = 180.0
    AGENT_TOOL_RESULT_MAX_CHARS: int = 6000
    AGENT_MEMORY_MAX_PER_USER: int = 50
    AGENT_MEMORY_MAX_CHARS: int = 500
    AGENT_SUMMARY_MAX_CHARS: int = 2000
    AGENT_SUMMARY_MIN_OVERFLOW: int = 4

    # MCP endpoint (/api/v1/mcp) — per-user tool-call rate limit
    MCP_RATE_LIMIT_PER_MINUTE: int = 30

    # LiveKit virtual classroom
    # Defaults match `livekit-server --dev` so onboarding works out of the box.
    # In production, set LIVEKIT_API_SECRET to a random ≥32-char value.
    # LIVEKIT_URL is the WebSocket endpoint clients connect to (ws/wss).
    # LIVEKIT_API_URL is the HTTP admin endpoint the backend uses for
    # room create/delete/list-participants. Same port for `--dev`.
    LIVEKIT_URL: str = "ws://localhost:7880"
    LIVEKIT_API_URL: str = "http://localhost:7880"
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "secret"

    # Local filesystem path the LiveKit Egress container writes recordings
    # into. Inside Egress's container this is mounted to /out; on this
    # host it should be the same directory so the path stored in the DB
    # is dereferenceable.
    LIVEKIT_RECORDINGS_DIR: str = "/srv/recordings"

    # Usage Analytics
    ANALYTICS_TRACKING_ENABLED: bool = True   # master kill switch for capture
    ANALYTICS_RETENTION_DAYS: int = 90        # raw usage_events kept this long
    ANALYTICS_FLUSH_SECONDS: int = 5          # buffer → DB flush interval
    ANALYTICS_SNAPSHOT_MINUTES: int = 5       # concurrency snapshot interval
    ANALYTICS_ACTIVE_WINDOW_MINUTES: int = 5  # "active/concurrent" trailing window
    ANALYTICS_VISIT_GAP_MINUTES: int = 30     # gap that splits a feature "visit"
    # Feature labels to hide from the analytics "Feature usage" report. Comma-
    # separated, matched case-insensitively against the labels in feature_map
    # (e.g. "Notifications,Authentication,Usage Analytics").
    ANALYTICS_EXCLUDED_FEATURES: set[str] = set()

    # RAG — semantic search over course materials & library documents.
    # Pipeline: docling-serve (convert → DoclingDocument) → HybridChunker
    # (tokenizer bge-m3) → embed (bge-m3 sidecar) → pgvector → cosine search.
    RAG_ENABLED: bool = True
    # Whether THIS process may run the ingestion scheduler. Even when True, a
    # Postgres advisory lock ensures only ONE worker/process actually sweeps
    # (safe under `uvicorn --workers N`). Set False on web workers if you run a
    # dedicated scheduler process.
    RAG_SCHEDULER_ENABLED: bool = True
    RAG_INGEST_INTERVAL_SECONDS: int = 30 * 60  # scheduler backfill sweep
    # A row stuck in status 'indexing' longer than this (process crashed
    # mid-ingest) is reset to 'pending' by the backfill sweep. Must comfortably
    # exceed one full conversion (DOCLING_TIMEOUT_SECONDS) + embedding.
    RAG_STALE_INDEXING_MINUTES: int = 30
    RAG_SEARCH_TOP_K: int = 8
    RAG_MIN_SCORE: float = 0.0  # drop results below this cosine similarity
    RAG_ARABIC_NORMALIZE: bool = True  # normalise Arabic before embed (chunk & query)
    # Hybrid search: fuse dense (vector) + keyword (Postgres FTS) with Reciprocal
    # Rank Fusion. RAG_RRF_K is the RRF constant; RAG_HYBRID_CANDIDATES is how
    # many rows each branch contributes before fusion.
    RAG_HYBRID_ENABLED: bool = True
    RAG_RRF_K: int = 60
    RAG_HYBRID_CANDIDATES: int = 50
    # Per-client rate limit on the (expensive) RAG search endpoints.
    RAG_SEARCH_RATE_LIMIT: str = "30/minute"
    RAG_ALLOWED_CONTENT_TYPES: set[str] = {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
    }

    # docling-serve — document conversion service.
    # DOCLING_MODE "convert_json": request to_formats=json → DoclingDocument →
    # HybridChunker in-process (keeps page provenance; markdown is lossy).
    # "chunk_endpoint": call the server's /v1/chunk/hybrid endpoint directly.
    DOCLING_BASE_URL: str = "http://localhost:5001"
    DOCLING_API_KEY: str = ""
    DOCLING_TIMEOUT_SECONDS: float = 300.0
    DOCLING_VERIFY_SSL: bool = False
    DOCLING_MODE: str = "convert_json"
    # Submission style to docling-serve:
    #  False (default) — synchronous endpoint (/v1/convert/file): one HTTP call
    #    holds the connection for the whole conversion (up to DOCLING_TIMEOUT).
    #  True — docling-serve's ASYNC task API: submit (/v1/convert/file/async) →
    #    poll (/v1/status/poll/{id}) → fetch (/v1/result/{id}). No long-held
    #    connection, lighter on docling-serve when conversions are slow/queued.
    DOCLING_ASYNC: bool = False
    # Poll interval (seconds) for the async task API; overall wait is capped by
    # DOCLING_TIMEOUT_SECONDS.
    DOCLING_POLL_INTERVAL_SECONDS: float = 2.0
    # In-process chunker (only used when DOCLING_MODE=convert_json):
    #  "hybrid"       — token-aware HybridChunker; needs the bge-m3 tokenizer
    #                   (DOCLING_CHUNK_TOKENIZER). Best quality / token control.
    #  "hierarchical" — structure-only HierarchicalChunker; NO tokenizer, NO
    #                   transformers download. Chunks by heading/section; may emit
    #                   oversized chunks (embedder truncates). Use when you want
    #                   zero ML deps on the app server.
    DOCLING_CHUNKER: str = "hybrid"
    DOCLING_CHUNK_TOKENIZER: str = "BAAI/bge-m3"
    DOCLING_MAX_TOKENS: int = 512
    DOCLING_MERGE_PEERS: bool = True
    # Picture description settings for docling-serve.
    DOCLING_PICTURE_DESC_URL: str = "http://155.121.25.23:5000/v1/chat/completions"
    DOCLING_PICTURE_DESC_API_KEY: str = "sk-FCGLgV9vBCvB5NuNEU8q9g"
    DOCLING_PICTURE_DESC_MODEL: str = "Qwen3.6-35B-A3B"

    # Embedding sidecar (bge-m3, 1024-dim) — HF text-embeddings-inference or
    # Infinity. EMBEDDING_DIM must match the model AND the pgvector column.
    EMBEDDING_BASE_URL: str = "http://localhost:8080"
    EMBEDDING_PATH: str = "/v1/embeddings"  # OpenAI-compatible route on the sidecar
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_MODEL: str = "bge-m3"
    EMBEDDING_DIM: int = 1024
    EMBEDDING_TIMEOUT_SECONDS: float = 60.0
    EMBEDDING_VERIFY_SSL: bool = False
    EMBEDDING_BATCH_SIZE: int = 32
    # "http" = call an external sidecar (default; scalable, no torch in the app).
    # "local" = run bge-m3 in-process via sentence-transformers (fewer services,
    # simpler air-gap; pulls torch, loads ~2.3GB per process — avoid with many
    # uvicorn workers). Install the extra: pip install 'sentence-transformers'.
    EMBEDDING_BACKEND: str = "http"
    EMBEDDING_LOCAL_MODEL: str = "BAAI/bge-m3"  # HF id/path for the local backend
    EMBEDDING_LOCAL_DEVICE: str = "cpu"  # "cpu" | "cuda"
    # Which library backs the local backend:
    #   "sentence-transformers" — dense only (lightest).
    #   "flagembedding"         — official bge-m3 wrapper; dense now, and can emit
    #                             sparse (lexical) vectors later for true hybrid.
    EMBEDDING_LOCAL_ENGINE: str = "sentence-transformers"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        **kwargs: Any,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            _CsvOrJsonDotEnvSource(settings_cls),
            *kwargs.values(),
        )

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_changed(cls, v: str) -> str:
        if v == _DEFAULT_SECRET:
            raise ValueError(
                "SECRET_KEY must be set to a secure random value in .env — "
                "do not use the default in any environment."
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long.")
        return v


settings = Settings()
