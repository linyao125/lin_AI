from __future__ import annotations

from collections import Counter
from typing import Any
import re

from app.core.config import get_runtime
from app.services.repository import repo
from app.services.utils import compact_text


def _tokens(text: str) -> list[str]:
    return re.findall(r"[\w\u4e00-\u9fff]+", text.lower())


class MemoryService:
    def seed_core_memories_if_needed(self) -> None:
        runtime = get_runtime()
        cfg = runtime.yaml.memory
        if not cfg.auto_seed_core_memory:
            return
        for item in cfg.core_memories:
            repo.upsert_memory(
                namespace=cfg.namespace,
                kind="core",
                title=item.title,
                content=item.content,
                weight=item.weight,
                pinned=item.pinned,
                tags=item.tags,
            )

    def retrieve(self, user_message: str) -> list[dict[str, Any]]:
        runtime = get_runtime()
        cfg = runtime.yaml
        all_items = repo.list_memories(cfg.memory.namespace)
        if not all_items:
            return []
        query_terms = Counter(_tokens(user_message))
        scored = []
        for item in all_items:
            text = f"{item['title']} {item['content']} {' '.join(item['tags'])}"
            terms = Counter(_tokens(text))
            overlap = sum((query_terms & terms).values())
            base = float(item["weight"])
            pinned_bonus = 1.5 if item["pinned"] else 0.0
            kind_bonus = 1.0 if item["kind"] == "core" else 0.0
            score = overlap * 2.0 + base + pinned_bonus + kind_bonus
            scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)
        chosen = [item for score, item in scored[: cfg.context.max_memories] if score > 0.3]
        total_chars = 0
        trimmed = []
        for item in chosen:
            piece = compact_text(item["content"])
            if total_chars + len(piece) > cfg.context.max_memory_chars:
                break
            total_chars += len(piece)
            trimmed.append(item)
            repo.mark_memory_accessed(item["id"])
        return trimmed

    def build_memory_block(self, user_message: str) -> tuple[str, list[dict[str, Any]]]:
        items = self.retrieve(user_message)
        if not items:
            return "", []
        lines = ["[Relevant Memory]"]
        for item in items:
            lines.append(f"- ({item['kind']}) {item['title']}: {compact_text(item['content'])}")
        return "\n".join(lines), items

    def maybe_soft_write(self, user_message: str, ai_reply: str) -> bool:
        """软写入：检测用户消息是否值得写入L2记忆"""
        # 触发条件1：用户主动描述自己的偏好或经历
        preference_patterns = [
            r"我(喜欢|讨厌|害怕|希望|想要|不想|觉得|认为|习惯)",
            r"我(的|是|有|在|去过|做过|学过)",
            r"(我最|我很|我特别|我比较)",
        ]
        # 触发条件2：强情绪信号
        emotion_patterns = [
            r"(好难过|好开心|好害怕|好烦|好累|哭了|笑死|崩溃|感动)",
            r"(真的很|非常|特别|超级)(难过|开心|害怕|烦|累|感动)",
        ]

        combined = user_message + ai_reply

        for pattern in preference_patterns + emotion_patterns:
            if re.search(pattern, combined):
                runtime = get_runtime()
                cfg = runtime.yaml.memory
                title = user_message[:30].strip()
                content = f"用户说：{user_message[:200]}"
                repo.upsert_memory(
                    namespace=cfg.namespace,
                    kind="user_info",
                    title=title,
                    content=content,
                    weight=cfg.default_weight_dynamic,
                    pinned=False,
                    tags=["soft_write"],
                    source="ai_suggest",
                )
                return True
        return False

    def maybe_make_summary(self, conversation_id: str, raw_text: str) -> bool:
        runtime = get_runtime()
        cfg = runtime.yaml.memory
        toggles = repo.get_setting("runtime_toggles") or {}
        if toggles.get("auto_summary_enabled", True) is False:
            return False
        if not cfg.auto_summary_enabled:
            return False
        if len(raw_text) < cfg.summary_min_chars:
            return False
        title = f"summary:{conversation_id}"
        repo.upsert_memory(
            namespace=cfg.namespace,
            kind="summary",
            title=title,
            content=raw_text[: cfg.summary_target_chars],
            weight=cfg.default_weight_dynamic,
            pinned=False,
            tags=["summary", conversation_id],
        )
        return True


memory_service = MemoryService()
