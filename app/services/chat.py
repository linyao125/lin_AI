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

        result = llm_service.chat(
            messages=messages,
            model=primary_model,
            temperature=primary_temperature,
            max_tokens=primary_max_tokens,
        )

        assistant_text = result["text"]
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

        return {
            "conversation_id": cid,
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "cached": False,
            "context_meta": context_meta,
        }


chat_service = ChatService()