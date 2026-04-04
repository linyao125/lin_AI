from __future__ import annotations

import math
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

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

        # pinned记忆永远保底注入
        pinned = [item for item in all_items if item["pinned"]]
        dynamic = [item for item in all_items if not item["pinned"]]

        # 动态记忆按关键词+时间衰减评分
        now = datetime.now(timezone.utc)
        scored = []
        for item in dynamic:
            text = f"{item['title']} {item['content']} {' '.join(item['tags'])}"
            terms = Counter(_tokens(text))
            overlap = sum((query_terms & terms).values())
            base = float(item["weight"])
            kind_bonus = 1.0 if item["kind"] == "core" else 0.0
            # 时间衰减：越新权重越高，30天后衰减到0.5
            try:
                updated = datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00"))
                days_old = (now - updated).days
                time_decay = math.exp(-days_old / 30)
            except Exception:
                time_decay = 1.0
            score = overlap * 2.0 + base + kind_bonus + time_decay * 0.5
            if score > 0.3:
                scored.append((score, item))
        scored.sort(key=lambda x: x[0], reverse=True)

        # 动态记忆槽位 = max_memories - pinned数量
        dynamic_slots = max(0, cfg.context.max_memories - len(pinned))
        chosen_dynamic = [item for _, item in scored[:dynamic_slots]]

        # 合并：pinned在前，动态在后
        chosen = pinned + chosen_dynamic

        # 字符预算截断
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
                import random
                from app.soul.mood_state import mood_state as _ms
                _state = _ms.get()
                _warmth = _state.get("warmth", 0.5)
                _curiosity = _state.get("curiosity", 0.5)
                # 概率门：亲密度越高越倾向于记录，好奇心加权
                _write_prob = 0.4 + _warmth * 0.3 + _curiosity * 0.2
                if random.random() > _write_prob:
                    return False  # 这次不记，保持不可预测
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
