from __future__ import annotations

import json
import os
import time
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
        _settings = settings_service.get_frontend_settings()
        _proxy = _settings.get("proxy_url") or os.environ.get("HTTP_PROXY") or ""
        _client_kwargs = {"timeout": 120}
        if _proxy:
            _client_kwargs["proxy"] = _proxy
        last_err = None
        for attempt in range(3):  # 最多重试3次
            try:
                with httpx.Client(**_client_kwargs) as client:
                    resp = client.post(self._endpoint(), headers=self._headers(), json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                break  # 成功就跳出
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_err = e
                wait = (attempt + 1) * 2  # 2秒、4秒、6秒
                time.sleep(wait)
                continue
        else:
            raise last_err
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

    async def chat_stream(self, messages: list[dict[str, str]], model: str, temperature: float, max_tokens: int):
        """流式生成，yield文本片段"""
        api_key = self._api_key()
        if not api_key:
            raise RuntimeError("API Key 为空，请先在设置页填写")
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", self._endpoint(), headers=self._headers(), json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            yield text
                    except Exception:
                        continue


llm_service = LLMService()
