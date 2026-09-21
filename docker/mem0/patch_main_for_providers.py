#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib

MARKER = "# --- AIYO: provider-aware default config injected ---"
LLM_PROVIDER_SENTINEL = 'BUNDLED_LLM_PROVIDERS = ('
EMBEDDER_PROVIDER_SENTINEL = 'BUNDLED_EMBEDDER_PROVIDERS = ('


def append_provider(text: str, sentinel: str, provider: str) -> str:
    if not provider:
        return text
    needle = f'"{provider}"'
    if needle in text:
        return text
    index = text.find(sentinel)
    if index == -1:
        return text
    line_end = text.find("\n", index)
    current = text[index:line_end]
    if current.rstrip().endswith(")"):
        updated = current.rstrip()[:-1] + f', "{provider}")'
        return text[:index] + updated + text[line_end:]
    return text


def build_llm_config(provider: str, model: str, base_url: str) -> str:
    if provider == "ollama":
        return f"""    "llm": {{
        "provider": "ollama",
        "config": {{
            "model": {model!r},
            "ollama_base_url": {base_url!r},
            "temperature": 0.2,
        }},
    }},"""
    return f"""    "llm": {{
        "provider": {provider!r},
        "config": {{
            "model": {model!r},
            "temperature": 0.2,
        }},
    }},"""


def build_embedder_config(provider: str, model: str, dims: int, base_url: str) -> str:
    if provider == "ollama":
        return f"""    "embedder": {{
        "provider": "ollama",
        "config": {{
            "model": {model!r},
            "ollama_base_url": {base_url!r},
            "embedding_dims": {dims},
        }},
    }},"""
    if provider == "huggingface":
        return f"""    "embedder": {{
        "provider": "huggingface",
        "config": {{
            "model": {model!r},
            "embedding_dims": {dims},
        }},
    }},"""
    return f"""    "embedder": {{
        "provider": {provider!r},
        "config": {{
            "model": {model!r},
            "embedding_dims": {dims},
        }},
    }},"""


def build_ollama_client_adapter() -> str:
    """Patch only Mem0's Ollama client binding, leaving the vendored SDK untouched."""
    return '''
# Mem0 extraction expects JSON content, not a reasoning-only completion.
def _install_aiyo_mem0_ollama_client():
    import mem0.llms.ollama as adapter
    if getattr(adapter.Client, "_aiyo_mem0_bounded", False):
        return

    class AiyoMem0OllamaClient(adapter.Client):
        _aiyo_mem0_bounded = True

        def __init__(self, *args, **kwargs):
            try:
                timeout = float(os.environ.get("MEM0_OLLAMA_TIMEOUT_SECONDS", "90"))
                if not 1 <= timeout <= 120:
                    timeout = 90
            except ValueError:
                timeout = 90
            kwargs["timeout"] = timeout
            super().__init__(*args, **kwargs)

        def chat(self, *args, **kwargs):
            kwargs.setdefault("think", os.environ.get("MEM0_OLLAMA_THINK", "false").strip().lower() in ("1", "true", "yes", "on"))
            return super().chat(*args, **kwargs)

    adapter.Client = AiyoMem0OllamaClient

_install_aiyo_mem0_ollama_client()

'''


def main() -> None:
    path = pathlib.Path("/app/main.py")
    text = path.read_text(encoding="utf-8")

    llm_provider = os.environ.get("MEM0_DEFAULT_LLM_PROVIDER", "ollama").strip() or "ollama"
    llm_model = os.environ.get("MEM0_DEFAULT_LLM_MODEL", "qwen3.5:9b").strip() or "qwen3.5:9b"
    llm_base_url = os.environ.get("MEM0_DEFAULT_LLM_BASE_URL", os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")).rstrip("/")
    embedder_provider = os.environ.get("MEM0_DEFAULT_EMBEDDER_PROVIDER", "huggingface").strip() or "huggingface"
    embedder_model = os.environ.get("MEM0_DEFAULT_EMBEDDER_MODEL", "sentence-transformers/multi-qa-MiniLM-L6-cos-v1").strip() or "sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
    embedding_dims = int(os.environ.get("MEM0_DEFAULT_EMBEDDING_DIMS", "384"))

    start = text.find("DEFAULT_CONFIG = {")
    end = text.find("set_session_factory(SessionLocal)", start)
    if start == -1 or end == -1:
        raise RuntimeError("patch_main_for_providers: could not locate DEFAULT_CONFIG block")
    # Replace the whole prior generated block on repeated container starts.
    marker_start = text.find(MARKER)
    if 0 <= marker_start < start:
        start = marker_start

    block = f"""{MARKER}
VECTOR_DB_NAME = os.environ.get("APP_DB_NAME", POSTGRES_DB)
DEFAULT_CONFIG = {{
    "version": "v1.1",
    "vector_store": {{
        "provider": "pgvector",
        "config": {{
            "host": POSTGRES_HOST,
            "port": int(POSTGRES_PORT),
            "dbname": VECTOR_DB_NAME,
            "user": POSTGRES_USER,
            "password": POSTGRES_PASSWORD,
            "collection_name": POSTGRES_COLLECTION_NAME,
            "embedding_model_dims": {embedding_dims},
        }},
    }},
{build_llm_config(llm_provider, llm_model, llm_base_url)}
{build_embedder_config(embedder_provider, embedder_model, embedding_dims, llm_base_url)}
    "history_db_path": HISTORY_DB_PATH,
}}

{build_ollama_client_adapter() if llm_provider == "ollama" else ""}
"""

    updated = text[:start] + block + text[end:]
    updated = append_provider(updated, LLM_PROVIDER_SENTINEL, llm_provider)
    updated = append_provider(updated, EMBEDDER_PROVIDER_SENTINEL, embedder_provider)
    path.write_text(updated, encoding="utf-8")
    print(
        f"Patched /app/main.py with llm={llm_provider}:{llm_model} embedder={embedder_provider}:{embedder_model}",
        flush=True,
    )


if __name__ == "__main__":
    main()
