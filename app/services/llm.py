from __future__ import annotations

import os
from typing import Any

import httpx

from app.core.config import get_runtime
from app.services.costs import cost_service
from app.services.settings import settings_service


class LLMService:
    def _headers(self) -> dict[str, str]:
        runtime = get_runtime()
        return {
            "Authorization": f"Bearer {self._api_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": runtime.settings.or_site_url,
            "X-Title": runtime.settings.or_app_name,
        }

    def _api_base(self) -> str:
        current = settings_service.get_frontend_settings()
        return (current.get("api_base_url") or "").strip() or get_runtime().settings.llm_base_url

    def _api_key(self) -> str:
        current = settings_service.get_frontend_settings()
        return (current.get("api_key") or "").strip() or get_runtime().settings.llm_api_key

    def _endpoint(self) -> str:
        return self._api_base().rstrip("/") + "/chat/completions"

    def chat(self, messages: list[dict[str, str]], model: str, temperature: float, max_tokens: int) -> dict[str, Any]:
        api_key = self._api_key()
        if not api_key:
            raise RuntimeError("API Key 为空，请先在设置页填写")
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        _proxy = os.environ.get("HTTP_PROXY") or "http://127.0.0.1:7890"
        with httpx.Client(timeout=120, proxy=_proxy) as client:
            resp = client.post(self._endpoint(), headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        estimated_cost = cost_service.estimate(prompt_tokens, completion_tokens)
        return {
            "text": content,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "estimated_cost": estimated_cost,
            "raw": data,
        }


llm_service = LLMService()
