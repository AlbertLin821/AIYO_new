#!/usr/bin/env python3
"""
將 Mem0 OSS server 的 /app/main.py 預設改為 Ollama LLM + Ollama 嵌入（本機開發）。
上游 main.py 固定使用 OpenAI，與 docker-compose 的 MEM0_DEFAULT_* 不一致。
可重複執行：若已含標記則略過。
"""
from __future__ import annotations

import os
import pathlib

MARKER = "# --- AIYO: Ollama default config injected ---"


def main() -> None:
    path = pathlib.Path("/app/main.py")
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print("main.py already patched for Ollama", flush=True)
        return

    start = text.find("DEFAULT_CONFIG = {")
    end = text.find("set_session_factory(SessionLocal)", start)
    if start == -1 or end == -1:
        raise RuntimeError("patch_main_for_ollama: 找不到 DEFAULT_CONFIG 區塊，Mem0 版本可能已變更")

    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    llm_model = os.environ.get("MEM0_DEFAULT_LLM_MODEL", "qwen3.5:9b")
    emb_model = os.environ.get("MEM0_DEFAULT_EMBEDDER_MODEL", "nomic-embed-text")
    emb_dims = int(os.environ.get("MEM0_DEFAULT_EMBEDDING_DIMS", "768"))

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
 }},
 }},
 "llm": {{
 "provider": "ollama",
 "config": {{
 "model": {llm_model!r},
 "ollama_base_url": {ollama_url!r},
 "temperature": 0.2,
 }},
 }},
 "embedder": {{
 "provider": "ollama",
 "config": {{
 "model": {emb_model!r},
 "ollama_base_url": {ollama_url!r},
 "embedding_dims": {emb_dims},
 }},
 }},
 "history_db_path": HISTORY_DB_PATH,
}}

"""
    new_text = text[:start] + block + text[end:]
    new_text = new_text.replace(
        'BUNDLED_LLM_PROVIDERS = ("openai", "anthropic", "gemini")',
        'BUNDLED_LLM_PROVIDERS = ("openai", "anthropic", "gemini", "ollama")',
    )
    new_text = new_text.replace(
        'BUNDLED_EMBEDDER_PROVIDERS = ("openai", "gemini")',
        'BUNDLED_EMBEDDER_PROVIDERS = ("openai", "gemini", "ollama")',
    )

    path.write_text(new_text, encoding="utf-8")
    print("Patched /app/main.py: Ollama LLM + embedder, pgvector dbname=APP_DB_NAME", flush=True)


if __name__ == "__main__":
    main()
