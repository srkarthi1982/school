"""In-process chunking of a DoclingDocument. Produces chunks carrying heading
context and the source page number (from docling provenance).

Two chunkers, selected by ``settings.DOCLING_CHUNKER``:

* ``hybrid`` (default) � token-aware ``HybridChunker`` using the bge-m3
  *tokenizer* (small, ~20 MB; never the embedding weights) to respect
  ``DOCLING_MAX_TOKENS``. Best quality / token control.
* ``hierarchical`` � ``HierarchicalChunker``, splits purely by document
  structure. Needs **no tokenizer and no transformers download** � pick this to
  keep zero ML deps on the app server. Trade-off: no token-length control, so a
  very large section can produce an oversized chunk (the embedder truncates it).

The chunker is built lazily and cached (the hybrid tokenizer downloads once).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)

_chunker = None


@dataclass
class Chunk:
    text: str          # raw chunk text (for display)
    embed_text: str    # heading-contextualised text (what we embed)
    page_no: int | None
    headings: list[str]
    chunk_index: int


def _get_hierarchical_chunker():
    """Structure-only chunker � no tokenizer, no transformers."""
    from docling_core.transforms.chunker.hierarchical_chunker import (
        HierarchicalChunker,
    )

    chunker = HierarchicalChunker()
    logger.info("HierarchicalChunker ready (no tokenizer)")
    return chunker

def _get_chunker():
    global _chunker
    if _chunker is not None:
        return _chunker

    if settings.DOCLING_CHUNKER.lower() == "hierarchical":
        _chunker = _get_hierarchical_chunker()
        return _chunker

    from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
    from transformers import AutoTokenizer

    hf_tokenizer = AutoTokenizer.from_pretrained(settings.DOCLING_CHUNK_TOKENIZER)
    try:
        # Newer docling-core wraps HF tokenizers in its own adapter.
        from docling_core.transforms.chunker.tokenizer.huggingface import (
            HuggingFaceTokenizer,
        )

        tok = HuggingFaceTokenizer(
            tokenizer=hf_tokenizer, max_tokens=settings.DOCLING_MAX_TOKENS
        )
        _chunker = HybridChunker(
            tokenizer=tok, merge_peers=settings.DOCLING_MERGE_PEERS
        )
    except Exception:
        # Older docling-core accepts the HF tokenizer + max_tokens directly.
        _chunker = HybridChunker(
            tokenizer=hf_tokenizer,
            max_tokens=settings.DOCLING_MAX_TOKENS,
            merge_peers=settings.DOCLING_MERGE_PEERS,
        )
    logger.info("HybridChunker ready (tokenizer=%s)", settings.DOCLING_CHUNK_TOKENIZER)
    return _chunker


def _page_of(meta) -> int | None:
    for item in getattr(meta, "doc_items", None) or []:
        for prov in getattr(item, "prov", None) or []:
            page = getattr(prov, "page_no", None)
            if page is not None:
                return int(page)
    return None


def chunk_docling_json(doc_json: dict) -> list[Chunk]:
    """Reconstruct a DoclingDocument from its JSON and chunk it."""
    from docling_core.types.doc import DoclingDocument

    doc = DoclingDocument.model_validate(doc_json)
    chunker = _get_chunker()

    chunks: list[Chunk] = []
    for i, ch in enumerate(chunker.chunk(dl_doc=doc)):
        raw = ch.text or ""
        if not raw.strip():
            continue
        try:
            embed_text = chunker.contextualize(chunk=ch)
        except Exception:
            embed_text = raw
        headings = list(getattr(ch.meta, "headings", None) or [])
        chunks.append(
            Chunk(
                text=raw,
                embed_text=embed_text or raw,
                page_no=_page_of(ch.meta),
                headings=headings,
                chunk_index=i,
            )
        )
    return chunks
