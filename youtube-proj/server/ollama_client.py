"""呼叫本機 Ollama HTTP API（不依賴 .env 檔，僅讀 os.environ）。"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx


def _ollama_client(timeout_sec: float) -> httpx.AsyncClient:
    """本機 Ollama；預設 trust_env=True 會套用 HTTP_PROXY，常把對 127.0.0.1 的請求導向代理而 ConnectError。"""
    return httpx.AsyncClient(timeout=timeout_sec, trust_env=False)


def ollama_base_url() -> str:
    """OLLAMA_HOST 是「客戶端要連的 URL」，不是 Ollama 設定裡的 listen 綁定位址。

    常見混淆：伺服器監聽 **0.0.0.0:11434** 代表「在所有網卡上接受連線」，但用 HTTP 發請求時**不能**連到
    destination `0.0.0.0`（並非合法的本機連線目的位址）；必須用 **127.0.0.1**／**localhost** 或實際 LAN IP。
    若環境變數誤設為 `http://0.0.0.0:11434`，此處會改為 `http://127.0.0.1:11434`。
    """
    raw = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").strip()
    if not raw:
        raw = "http://127.0.0.1:11434"
    if not raw.startswith(("http://", "https://")):
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    host_lc = (parsed.hostname or "").lower()
    # [::]「監聽所有 IPv6」的誤拷貝同上，客戶端改走 IPv4 loopback。
    if host_lc in ("0.0.0.0", "::"):
        auth = ""
        if parsed.username is not None:
            auth = (
                f"{parsed.username}:{parsed.password}@"
                if parsed.password is not None
                else f"{parsed.username}@"
            )
        h, p = "127.0.0.1", parsed.port
        netloc = f"{auth}{h}:{p}" if p is not None else f"{auth}{h}"
        raw = urlunparse(parsed._replace(netloc=netloc))
    return raw.rstrip("/")


async def ollama_list_models(timeout_sec: float = 15.0) -> list[dict[str, Any]]:
    """對應 Ollama GET /api/tags。"""
    url = f"{ollama_base_url()}/api/tags"
    async with _ollama_client(timeout_sec) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    return list(data.get("models") or [])


async def ollama_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    timeout_sec: float = 600.0,
    json_mode: bool = True,
    options: dict[str, Any] | None = None,
) -> str:
    """POST /api/chat，回傳 assistant 文字內容（json_mode 時仍為字串）。"""
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    if json_mode:
        payload["format"] = "json"
    if options:
        payload["options"] = options

    url = f"{ollama_base_url()}/api/chat"
    async with _ollama_client(timeout_sec) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    msg = data.get("message") or {}
    content = msg.get("content") or ""
    return content if isinstance(content, str) else str(content)
