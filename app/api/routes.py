from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from app.core.config import get_runtime
from app.models.schemas import (
    ChatCreatePayload,
    ChatMessageOut,
    ConversationOut,
    FrontendSettingsOut,
    FrontendSettingsPayload,
    LoginPayload,
    MemoryCreatePayload,
    MemoryOut,
    MessageCreatePayload,
    RuntimeSettingsOut,
    RuntimeTogglePayload,
    SendMessageResponse,
)
from app.services.avatar import avatar_service as _avatar_service
from app.services.chat import chat_service
from app.services.proxy import apply_subscription
from app.services.repository import repo
from app.services.settings import settings_service
from app.soul.push import push_service

api_router = APIRouter()


@api_router.get("/health")
def health():
    runtime = get_runtime()
    return {
        "ok": True,
        "app": runtime.yaml.app.name,
        "model": runtime.settings.llm_primary_model,
    }


@api_router.post("/auth/login")
def login(payload: LoginPayload):
    return {"ok": True}


@api_router.post("/proxy/apply")
async def proxy_apply(request: Request):
    body = await request.json()
    url = body.get("subscription_url", "")
    result = apply_subscription(url)
    return result


@api_router.get("/runtime", response_model=RuntimeSettingsOut)
def runtime_info():
    return settings_service.get_public_runtime()


@api_router.get("/settings/form", response_model=FrontendSettingsOut)
def get_frontend_settings():
    return {
        "ok": True,
        "data": settings_service.get_frontend_settings()
    }


@api_router.put("/settings/form", response_model=FrontendSettingsOut)
def update_frontend_settings(payload: FrontendSettingsPayload):
    data = settings_service.update_frontend_settings(payload.model_dump())
    return {
        "ok": True,
        "data": data
    }


@api_router.get("/push/pending")
def get_pending_push():
    items = push_service.pop_pending()
    return {"ok": True, "data": items}


@api_router.get("/conversations", response_model=list[ConversationOut])
def list_conversations():
    return repo.list_conversations()


@api_router.post("/conversations", response_model=ConversationOut)
def create_conversation(payload: ChatCreatePayload):
    title = payload.title or "新对话"
    cid = repo.create_conversation(title)
    return repo.get_conversation(cid)


@api_router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def list_messages(conversation_id: str):
    return repo.list_messages(conversation_id)


@api_router.post("/conversations/{conversation_id}/messages", response_model=SendMessageResponse)
def send_message(conversation_id: str, payload: MessageCreatePayload):
    cid = None if conversation_id == "new" else conversation_id
    return chat_service.send_message(cid, payload.content)


@api_router.post("/conversations/{conversation_id}/messages/ollama", response_model=SendMessageResponse)
def save_ollama_message(conversation_id: str, payload: dict[str, Any] = Body(...)):
    cid = conversation_id if conversation_id != "new" else None
    cid = chat_service.ensure_conversation(cid, payload.get("user_content", ""))
    user_msg = repo.insert_message(cid, "user", payload.get("user_content", ""))
    assistant_msg = repo.insert_message(cid, "assistant", payload.get("assistant_content", ""), meta={"ollama": True})
    return {
        "conversation_id": cid,
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "cached": False,
        "context_meta": {},
    }


@api_router.get("/memories", response_model=list[MemoryOut])
def list_memories():
    runtime = get_runtime()
    return repo.list_memories(runtime.yaml.memory.namespace)


@api_router.post("/memories")
def create_memory(payload: MemoryCreatePayload):
    runtime = get_runtime()
    cfg = runtime.yaml.memory
    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="title and content required")
    repo.upsert_memory(
        namespace=cfg.namespace,
        kind=payload.kind.strip() or "user_info",
        title=title,
        content=content,
        weight=cfg.default_weight_dynamic,
        pinned=False,
        tags=["manual"],
        source=payload.source.strip() or "user_manual",
    )
    return {"ok": True}


@api_router.delete("/memories/{memory_id}")
def delete_memory(memory_id: int):
    repo.delete_memory(memory_id)
    return {"ok": True}


@api_router.put("/memories/{memory_id}")
def update_memory(memory_id: int, body: dict[str, Any]):
    repo.update_memory(memory_id, body.get("content", ""))
    return {"ok": True}


@api_router.get("/settings/toggles")
def get_toggles():
    return settings_service.get_toggles()


@api_router.put("/settings/toggles")
def update_toggles(payload: RuntimeTogglePayload):
    return settings_service.update_toggles(payload.model_dump())


@api_router.get("/usage")
def usage():
    return repo.get_usage_totals()


@api_router.post("/avatar/generate")
def manual_generate_avatar():
    """手动触发头像生成（用户在设置里点按钮）"""
    s = settings_service.get_frontend_settings()

    api_key = s.get("image_api_key") or s.get("api_key", "")
    api_base = s.get("image_api_base", "https://api.openai.com")
    persona_hint = s.get("persona_core", "")
    display_name = s.get("display_name", "叮咚")

    if not api_key:
        return {"success": False, "message": "未配置图片API Key"}

    path = _avatar_service.generate_avatar(
        api_key=api_key,
        api_base=api_base,
        persona_hint=persona_hint,
        display_name=display_name,
    )
    if path:
        return {"success": True, "path": path, "ts": int(time.time())}
    return {"success": False, "message": "生成失败，请检查API Key"}


@api_router.get("/avatar/current-ts")
def get_avatar_ts():
    """返回当前头像的时间戳，前端轮询用"""
    p = Path(__file__).resolve().parents[1] / "static" / "ai-avatar.png"
    ts = int(p.stat().st_mtime) if p.exists() else 0
    return {"ts": ts}
