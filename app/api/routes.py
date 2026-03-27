from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_runtime
from app.core.security import require_token
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
    current_token = "123456"
    if payload.token != current_token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"ok": True}


@api_router.get("/runtime", response_model=RuntimeSettingsOut)
def runtime_info(token: str = Depends(require_token)):
    return settings_service.get_public_runtime()


@api_router.get("/settings/form", response_model=FrontendSettingsOut)
def get_frontend_settings(token: str = Depends(require_token)):
    return {
        "ok": True,
        "data": settings_service.get_frontend_settings()
    }


@api_router.put("/settings/form", response_model=FrontendSettingsOut)
def update_frontend_settings(payload: FrontendSettingsPayload, token: str = Depends(require_token)):
    data = settings_service.update_frontend_settings(payload.model_dump())
    return {
        "ok": True,
        "data": data
    }


@api_router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(token: str = Depends(require_token)):
    return repo.list_conversations()


@api_router.post("/conversations", response_model=ConversationOut)
def create_conversation(payload: ChatCreatePayload, token: str = Depends(require_token)):
    title = payload.title or "新对话"
    cid = repo.create_conversation(title)
    return repo.get_conversation(cid)


@api_router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def list_messages(conversation_id: str, token: str = Depends(require_token)):
    return repo.list_messages(conversation_id)


@api_router.post("/conversations/{conversation_id}/messages", response_model=SendMessageResponse)
def send_message(conversation_id: str, payload: MessageCreatePayload, token: str = Depends(require_token)):
    cid = None if conversation_id == "new" else conversation_id
    return chat_service.send_message(cid, payload.content)


@api_router.get("/memories", response_model=list[MemoryOut])
def list_memories(token: str = Depends(require_token)):
    runtime = get_runtime()
    return repo.list_memories(runtime.yaml.memory.namespace)


@api_router.get("/settings/toggles")
def get_toggles(token: str = Depends(require_token)):
    return settings_service.get_toggles()


@api_router.put("/settings/toggles")
def update_toggles(payload: RuntimeTogglePayload, token: str = Depends(require_token)):
    return settings_service.update_toggles(payload.model_dump())


@api_router.get("/usage")
def usage(token: str = Depends(require_token)):
    return repo.get_usage_totals()