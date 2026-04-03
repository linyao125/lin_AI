from __future__ import annotations

from typing import Any

from app.core.config import get_runtime
from app.services.anchor import anchor_service
from app.services.memory import memory_service
from app.services.repository import repo


class ContextBuilder:
    def build(self, conversation_id: str, user_message: str) -> tuple[list[dict[str, str]], dict[str, Any]]:
        runtime = get_runtime()
        cfg = runtime.yaml
        all_recent = repo.list_messages(conversation_id, limit=cfg.context.max_recent_messages)
        system_prompt = anchor_service.build_system_prompt()
        # 按token预算从最新往前截断（4字符≈1token）
        budget = cfg.context.context_token_budget
        used = len(system_prompt) // 4
        recent = []
        for msg in reversed(all_recent):
            cost = len(msg.get("content", "")) // 4
            if used + cost > budget:
                break
            used += cost
            recent.insert(0, msg)
        memory_block, memory_items = memory_service.build_memory_block(user_message)
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        if memory_block:
            messages.append({"role": "system", "content": memory_block})
        for item in recent:
            if item["role"] in {"user", "assistant", "system"}:
                messages.append({"role": item["role"], "content": item["content"]})
        messages.append({"role": "user", "content": user_message})
        meta = {
            "recent_message_count": len(recent),
            "memory_count": len(memory_items),
            "memory_titles": [m["title"] for m in memory_items],
        }
        return messages, meta


context_builder = ContextBuilder()
