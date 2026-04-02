from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.config import get_runtime
from app.models.schemas import (
    ChatCreatePayload,
    ChatMessageOut,
    ConversationOut,
    FrontendSettingsOut,
    FrontendSettingsPayload,
    LoginPayload,
    MemoryOut,
    MessageCreatePayload,
    RuntimeSettingsOut,
    RuntimeTogglePayload,
    SendMessageResponse,
)
from app.services.chat import chat_service
from app.services.proxy import apply_subscription
from app.services.repository import repo
from app.services.settings import settings_service

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


@api_router.get("/memories", response_model=list[MemoryOut])
def list_memories():
    runtime = get_runtime()
    return repo.list_memories(runtime.yaml.memory.namespace)


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
