#!/usr/bin/env python3
"""
將 Mem0 OSS server 的 /app/main.py 預設改為 Ollama LLM + Ollama 嵌入（本機開發）。
上游 main.py 固定使用 OpenAI，與 docker-compose 的 MEM0_DEFAULT_* 不一致。
可重複執行：若已含標記且 embedding_model_dims 已對齊則略過。

若曾用舊版 patch 建立 pgvector 表（vector(1536)），需一次性重建 collection：
  DROP TABLE IF EXISTS aiyo_memories_local;  -- 於 APP_DB_NAME（預設 mem0_app）
或刪除 volume mem0_memory_postgres_data 後重啟 mem0-memory-postgres。
"""
from __future__ import annotations

import os
import pathlib

MARKER = "# --- AIYO: Ollama default config injected ---"


def main() -> None:
    path = pathlib.Path("/app/main.py")
    text = path.read_text(encoding="utf-8")
    emb_dims = int(os.environ.get("MEM0_DEFAULT_EMBEDDING_DIMS", "768"))

    if MARKER in text:
        if "embedding_model_dims" in text:
            print("main.py already patched for Ollama", flush=True)
            return
        needle = '"collection_name": POSTGRES_COLLECTION_NAME,'
        if needle in text:
            text = text.replace(
                needle,
                f'{needle}\n "embedding_model_dims": {emb_dims},',
                1,
            )
            path.write_text(text, encoding="utf-8")
            print(
                f"Upgraded /app/main.py: embedding_model_dims={emb_dims} (drop old pgvector table if 1536 mismatch)",
                flush=True,
            )
            return
        raise RuntimeError("patch_main_for_ollama: MARKER present but vector_store config not found")

    start = text.find("DEFAULT_CONFIG = {")
    end = text.find("set_session_factory(SessionLocal)", start)
    if start == -1 or end == -1:
        raise RuntimeError("patch_main_for_ollama: 找不到 DEFAULT_CONFIG 區塊，Mem0 版本可能已變更")

    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
    llm_model = os.environ.get("MEM0_DEFAULT_LLM_MODEL", "qwen3.5:9b")
    emb_model = os.environ.get("MEM0_DEFAULT_EMBEDDER_MODEL", "nomic-embed-text")

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
 "embedding_model_dims": {emb_dims},
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
    print(
        f"Patched /app/main.py: Ollama LLM + embedder, pgvector embedding_model_dims={emb_dims}",
        flush=True,
    )


if __name__ == "__main__":
    main()
