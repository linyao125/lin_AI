from __future__ import annotations

from typing import Any

from app.core.config import get_runtime
from app.services.anchor import anchor_service
from app.services.context_builder import context_builder
from app.services.llm import llm_service
from app.services.memory import memory_service
from app.services.repository import repo
from app.services.settings import settings_service
from app.services.utils import compact_text, hash_payload, short_title


class ChatService:
    def ensure_conversation(self, conversation_id: str | None, first_message: str | None = None) -> str:
        runtime = get_runtime()
        if conversation_id and repo.get_conversation(conversation_id):
            return conversation_id
        title = short_title(first_message or "新对话", runtime.yaml.context.title_max_chars)
        return repo.create_conversation(title=title)

    def send_message(self, conversation_id: str | None, content: str) -> dict[str, Any]:
        runtime = get_runtime()
        current = settings_service.get_frontend_settings()

        primary_model = (current.get("primary_model") or runtime.settings.llm_primary_model).strip()
        primary_temperature = float(current.get("primary_temperature", runtime.yaml.cost_control.primary_temperature))
        primary_max_tokens = int(current.get("primary_max_tokens", runtime.yaml.cost_control.primary_max_tokens))
        enable_cache = bool(current.get("enable_cache", runtime.yaml.cost_control.enable_cache))
        auto_summary_enabled = bool(current.get("auto_summary_enabled", runtime.yaml.memory.auto_summary_enabled))

        content = compact_text(content)
        ok, guard_message = anchor_service.quick_guard(content)
        if not ok:
            cid = self.ensure_conversation(conversation_id, content)
            user_msg = repo.insert_message(cid, "user", content)
            assistant_msg = repo.insert_message(cid, "assistant", guard_message or "消息已拦截。", meta={"guarded": True})
            return {
                "conversation_id": cid,
                "user_message": user_msg,
                "assistant_message": assistant_msg,
                "cached": False,
                "context_meta": {"guarded": True},
            }

        cid = self.ensure_conversation(conversation_id, content)
        user_msg = repo.insert_message(cid, "user", content)
        messages, context_meta = context_builder.build(cid, content)

        cache_key = hash_payload([primary_model, str(messages)])
        if enable_cache:
            cached = repo.get_cache(cache_key)
            if cached:
                assistant_msg = repo.insert_message(
                    cid,
                    "assistant",
                    cached["response_text"],
                    token_in=int(cached["token_in"]),
                    token_out=int(cached["token_out"]),
                    cost_estimate=float(cached["cost_estimate"]),
                    meta={"cached": True, "model": primary_model},
                )
                return {
                    "conversation_id": cid,
                    "user_message": user_msg,
                    "assistant_message": assistant_msg,
                    "cached": True,
                    "context_meta": context_meta,
                }

        # 语义路由：判断情感密度，决定模型级别
        actual_model = primary_model
        actual_temperature = primary_temperature
        try:
            import random
            from app.soul.mood_state import mood_state as _ms
            _state = _ms.get()
            _warmth = _state.get("warmth", 0.5)

            # 轻量模型判断情感密度（用summary_model省钱）
            summary_model = (current.get("summary_model") or runtime.settings.llm_summary_model).strip()
            _route_result = llm_service.chat(
                messages=[{"role": "user", "content": f"判断这句话的情感密度：高（深情/重要/情绪强烈）或低（日常/废话/简单问答）。只回答'高'或'低'。\n\n用户说：{content}"}],
                model=summary_model,
                temperature=0.1,
                max_tokens=5,
            )
            _density = _route_result.get("text", "").strip()

            if _density == "低":
                # 低密度：降温，减少token，保持轻量
                actual_temperature = max(0.3, primary_temperature - 0.2)
            else:
                # 高密度：提高温度，增加灵魂感
                actual_temperature = min(1.0, primary_temperature + 0.15)
                # 亲密度高时额外加点随机性
                if _warmth > 0.7:
                    actual_temperature = min(1.0, actual_temperature + random.uniform(0, 0.1))
        except Exception:
            pass

        result = llm_service.chat(
            messages=messages,
            model=actual_model,
            temperature=actual_temperature,
            max_tokens=primary_max_tokens,
        )

        assistant_text = result["text"]

        # 错别字机制：让AI自己出错自己更正，不硬编码
        _typo_correction: str | None = None
        try:
            import random as _r
            from app.soul.mood_state import mood_state as _ms
            import datetime as _dt

            _state = _ms.get()
            _hour = _dt.datetime.now().hour
            _warmth = _state.get("warmth", 0.5)
            _energy = _state.get("energy", 0.8)

            # 触发概率
            _typo_prob = 0.0
            if 22 <= _hour or _hour < 4:
                _typo_prob += 0.15
            if _energy < 0.4:
                _typo_prob += 0.1
            if _warmth > 0.7:
                _typo_prob += 0.08

            if _r.random() < _typo_prob and len(assistant_text) > 20:
                summary_model = (current.get("summary_model") or runtime.settings.llm_summary_model).strip()
                _typo_result = llm_service.chat(
                    messages=[
                        {
                            "role": "user",
                            "content": f"""把下面这句话里随机一个词故意打错（只改一个字，要像手滑），然后第二行写一个自然的更正，像真人发现打错字时的反应。
格式：
[错误版本]
[更正]

原句：{assistant_text[:100]}""",
                        }
                    ],
                    model=summary_model,
                    temperature=0.9,
                    max_tokens=80,
                )
                _typo_raw = _typo_result.get("text", "").strip()
                _lines = [l.strip() for l in _typo_raw.split("\n") if l.strip()]
                if len(_lines) >= 2:
                    _typo_text = _lines[0].replace("[错误版本]", "").strip()
                    _correction = _lines[1].replace("[更正]", "").strip()
                    if _typo_text and _correction:
                        assistant_text = _typo_text
                        _typo_correction = _correction
        except Exception:
            pass

        if runtime.yaml.context.attach_cost_hint:
            assistant_text = assistant_text.rstrip() + f"\n\n[estimated_cost=${result['estimated_cost']:.6f}]"

        assistant_msg = repo.insert_message(
            cid,
            "assistant",
            assistant_text,
            token_in=result["prompt_tokens"],
            token_out=result["completion_tokens"],
            cost_estimate=result["estimated_cost"],
            meta={"cached": False, "model": primary_model},
        )
        if _typo_correction:
            assistant_msg = repo.insert_message(
                cid,
                "assistant",
                _typo_correction,
                meta={"typo_correction": True},
            )

        if enable_cache:
            repo.set_cache(
                cache_key,
                assistant_text,
                result["prompt_tokens"],
                result["completion_tokens"],
                result["estimated_cost"],
                runtime.yaml.context.cache_ttl_seconds,
            )

        if auto_summary_enabled and repo.count_messages(cid) >= runtime.yaml.memory.summary_trigger_message_count:
            recent = repo.list_messages(cid, limit=runtime.yaml.memory.summary_trigger_message_count)
            raw_text = "\n".join(f"{m['role']}: {m['content']}" for m in recent)
            memory_service.maybe_make_summary(cid, raw_text)

        memory_service.maybe_soft_write(user_message=content, ai_reply=assistant_text)

        return {
            "conversation_id": cid,
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "cached": False,
            "context_meta": context_meta,
        }


chat_service = ChatService()