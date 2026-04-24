from __future__ import annotations

import json
import os
import time
from typing import Any, Generator

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
        last_err = None
        for attempt in range(3):  # 最多重试3次
            try:
                with httpx.Client(**self._client_kwargs()) as client:
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

    def _client_kwargs(self) -> dict:
        _settings = settings_service.get_frontend_settings()
        _proxy = _settings.get("proxy_url") or os.environ.get("LINAI_PROXY") or ""
        kwargs = {"timeout": httpx.Timeout(120.0, connect=10.0)}
        if _proxy:
            kwargs["proxy"] = _proxy
        return kwargs

    def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> Generator[str, None, None]:
        """
        流式调用 OpenRouter，逐 token yield SSE 格式字符串。
        调用方用 FastAPI StreamingResponse 包裹即可。
        """
        api_key = self._api_key()
        if not api_key:
            yield 'data: {"error": "API Key 为空，请先在设置页填写"}\n\n'
            return

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        try:
            with httpx.Client(**self._client_kwargs()) as client:
                with client.stream(
                    "POST",
                    self._endpoint(),
                    headers=self._headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        if not line or line == "data: [DONE]":
                            continue
                        if line.startswith("data: "):
                            raw = line[6:]
                            try:
                                chunk = json.loads(raw)
                                delta = chunk["choices"][0]["delta"].get("content", "")
                                if delta:
                                    yield f"data: {json.dumps({'type': 'text', 'text': delta}, ensure_ascii=False)}\n\n"
                            except (KeyError, json.JSONDecodeError):
                                continue
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            yield f'data: {{"error": "连接失败: {e}"}}\n\n'
        finally:
            yield "data: [DONE]\n\n"


llm_service = LLMService()
