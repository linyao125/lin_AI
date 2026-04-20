from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from app.core.config import get_runtime
from app.models.schemas import (
    ChatCreatePayload,
    ChatMessageOut,
    ChatRequest,
    ConversationOut,
    FrontendSettingsOut,
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
from app.services.llm import llm_service
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


@api_router.post("/tts")
async def text_to_speech(request: Request):
    from app.services.tts import tts_service
    from app.services.settings import settings_service
    from fastapi.responses import Response

    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        return {"error": "text is empty"}

    s = settings_service.get_frontend_settings()
    audio_bytes = tts_service.synthesize(
        text=text,
        api_key=s.get("api_key", ""),
        api_base=((s.get("api_base_url") or s.get("api_base") or "").strip() or "https://api.openai.com"),
        voice=s.get("tts_voice", ""),
        tts_api_key=s.get("tts_api_key", ""),
        tts_provider=s.get("tts_provider", "auto"),
        speed=float(s.get("tts_speed", 1.0)),
    )

    if not audio_bytes:
        return {"error": "TTS failed"}

    return Response(content=audio_bytes, media_type="audio/mpeg")


@api_router.get("/runtime", response_model=RuntimeSettingsOut)
def runtime_info():
    return settings_service.get_public_runtime()


@api_router.get("/settings/form", response_model=FrontendSettingsOut)
def get_frontend_settings():
    return {
        "ok": True,
        "data": settings_service.get_frontend_settings()
    }


# ★ 关键：用裸 Request 接收 json，不用 Pydantic model
# 这样不会把未传字段用默认值覆盖数据库里已有的值
@api_router.put("/settings/form")
async def update_frontend_settings(request: Request):
    payload = await request.json()
    data = settings_service.update_frontend_settings(payload)
    return {"ok": True, "data": data}


@api_router.get("/push/pending")
def get_pending_push():
    items = push_service.pop_pending()
    return {"ok": True, "data": items}


@api_router.get("/initiative/check")
async def initiative_check():
    """前端心跳轮询，触发AI主动发言检测"""
    from app.soul.initiative import run_initiative_check

    await run_initiative_check()
    return {"ok": True}


@api_router.get("/schedules/due")
async def due_schedules():
    from app.soul.schedule import get_due_schedules

    return {"due": get_due_schedules()}


@api_router.get("/schedules")
async def list_schedules():
    from app.soul.schedule import get_schedules

    return {"schedules": get_schedules()}


@api_router.post("/schedules")
async def create_schedule(request: Request):
    body = await request.json()
    from app.soul.schedule import add_schedule

    item = add_schedule(
        title=body.get("title", ""),
        remind_at=body.get("remind_at", ""),
        note=body.get("note", ""),
    )
    return {"schedule": item}


@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int):
    from app.soul.schedule import delete_schedule

    delete_schedule(schedule_id)
    return {"ok": True}


@api_router.post("/schedules/{schedule_id}/done")
async def done_schedule(schedule_id: int):
    from app.soul.schedule import mark_done

    mark_done(schedule_id)
    return {"ok": True}


@api_router.get("/news/status")
async def news_status():
    """新闻：上次拉取时间与自动关键词（供前端展示）"""
    auto_kw = repo.get_setting("news_auto_keywords")
    if not isinstance(auto_kw, list):
        auto_kw = []
    return {
        "news_last_run": repo.get_setting("news_last_run"),
        "news_auto_keywords": auto_kw,
    }


@api_router.get("/conversations", response_model=list[ConversationOut])
def list_conversations():
    return repo.list_conversations()


@api_router.post("/conversations", response_model=ConversationOut)
def create_conversation(payload: ChatCreatePayload):
    title = payload.title or "新对话"
    cid = repo.create_conversation(title)
    return repo.get_conversation(cid)


@api_router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, body: dict[str, Any] = Body(...)):
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    repo.rename_conversation(conversation_id, title)
    return {"ok": True}


@api_router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    repo.delete_conversation(conversation_id)
    return {"ok": True}


@api_router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def list_messages(conversation_id: str):
    return repo.list_messages(conversation_id)


@api_router.post("/conversations/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(conversation_id: str, payload: MessageCreatePayload):
    cid = None if conversation_id == "new" else conversation_id
    return await chat_service.send_message(cid, payload.content)


@api_router.post("/conversations/{conversation_id}/messages/stream")
async def conversation_messages_stream(conversation_id: str, payload: MessageCreatePayload):
    from app.services.context_builder import context_builder
    from app.services.utils import compact_text
    from app.services.anchor import anchor_service
    import json as _json

    content = compact_text(payload.content)
    ok, guard_message = anchor_service.quick_guard(content)

    cid = None if conversation_id == "new" else conversation_id
    cid = chat_service.ensure_conversation(cid, content)
    user_msg = repo.insert_message(cid, "user", content)

    if not ok:

        async def _guard():
            meta = {"type": "meta", "conversation_id": cid, "user_message_id": user_msg["id"]}
            yield f"data: {_json.dumps(meta, ensure_ascii=False)}\n\n"
            yield f"data: {_json.dumps({'type':'text','text': guard_message or '消息已拦截'}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(_guard(), media_type="text/event-stream")

    messages, _ctx = context_builder.build(cid, content)
    current = settings_service.get_frontend_settings()
    runtime = get_runtime()
    model = (current.get("primary_model") or runtime.settings.llm_primary_model).strip()
    temperature = float(current.get("primary_temperature", runtime.yaml.cost_control.primary_temperature))
    max_tokens = int(current.get("primary_max_tokens", runtime.yaml.cost_control.primary_max_tokens))

    async def _stream():
        import json as _j

        meta = {"type": "meta", "conversation_id": cid, "user_message_id": user_msg["id"]}
        yield f"data: {_j.dumps(meta, ensure_ascii=False)}\n\n"

        full_text = ""
        for chunk in llm_service.chat_stream(messages=messages, model=model, temperature=temperature, max_tokens=max_tokens):
            if chunk.startswith("data: [DONE]"):
                break
            if chunk.startswith("data: "):
                try:
                    evt = _j.loads(chunk[6:])
                    if evt.get("type") == "text":
                        full_text += evt["text"]
                        yield chunk
                except Exception:
                    continue

        if full_text:
            assistant_msg = repo.insert_message(cid, "assistant", full_text, meta={"streamed": True})
            from app.services.memory import memory_service

            memory_service.maybe_soft_write(user_message=content, ai_reply=full_text)
            done = {"type": "done", "conversation_id": cid, "assistant_message_id": assistant_msg["id"]}
            yield f"data: {_j.dumps(done, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@api_router.post("/chat/stream")
def chat_stream(body: ChatRequest):
    return StreamingResponse(
        llm_service.chat_stream(
            messages=body.messages,
            model=body.model,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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
        image_provider=s.get("image_provider", "dalle"),
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


@api_router.get("/soul/state")
def get_soul_state():
    """前端轮询获取当前情绪向量，用于UI同步"""
    try:
        from app.soul.mood_state import mood_state

        state = mood_state.get()
        return {"ok": True, "state": state}
    except Exception:
        return {"ok": False, "state": {}}


# ── 备考知识库 ────────────────────────────────────────────
@api_router.post("/study/upload")
async def study_upload(request: Request):
    from app.soul.study import import_text
    from app.services.settings import settings_service

    s = settings_service.get_frontend_settings()
    if not s.get("study_enabled", False):
        return {"ok": False, "message": "知识库未开启"}
    form = await request.form()
    file = form.get("file")
    if not file:
        return {"ok": False, "message": "未收到文件"}
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except Exception:
        text = content.decode("gbk", errors="ignore")
    count = import_text(title=file.filename, text=text, source="upload")
    return {"ok": True, "message": f"导入成功，共{count}段", "chunks": count}


@api_router.post("/study/url")
async def study_import_url(request: Request):
    from app.soul.study import import_url
    from app.services.settings import settings_service

    s = settings_service.get_frontend_settings()
    if not s.get("study_enabled", False):
        return {"ok": False, "message": "知识库未开启"}
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        return {"ok": False, "message": "URL不能为空"}
    ok, msg = await import_url(url)
    return {"ok": ok, "message": msg}


@api_router.get("/study/list")
def study_list():
    from app.soul.study import list_study_items

    return {"ok": True, "data": list_study_items()}


@api_router.delete("/study/{title_base}")
def study_delete(title_base: str):
    from app.soul.study import delete_study_item

    delete_study_item(title_base)
    return {"ok": True}


@api_router.post("/study/quiz")
async def study_quiz(request: Request):
    from app.soul.study import generate_quiz
    from app.services.settings import settings_service

    s = settings_service.get_frontend_settings()
    if not s.get("study_enabled", False):
        return {"ok": False, "message": "知识库未开启"}
    body = await request.json()
    questions = await generate_quiz(
        topic=body.get("topic", ""),
        count=int(body.get("count", 5)),
    )
    return {"ok": True, "data": questions}


# ── 数据导出导入 ──────────────────────────────────────────
@api_router.post("/data/import")
async def data_import(request: Request):
    from app.soul.data_transfer import import_data

    form = await request.form()
    file = form.get("file")
    if not file:
        return {"ok": False, "message": "未收到文件"}
    content = await file.read()
    try:
        raw = content.decode("utf-8")
    except Exception:
        raw = content.decode("gbk", errors="ignore")
    ok, msg = import_data(raw)
    return {"ok": ok, "message": msg}


@api_router.post("/email/test")
async def email_test():
    try:
        from app.soul.mcp_tools import _send_email

        result = await _send_email("叮咚测试邮件", "邮件配置成功！叮咚可以给你发邮件了 ✉️")
        if "已发送" in result:
            return {"ok": True}
        return {"ok": False, "error": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@api_router.post("/email/export")
async def email_export(fmt: str = "json"):
    try:
        from app.soul.data_transfer import export_data
        from app.soul.mcp_tools import _send_email

        filename, content = export_data(fmt)
        snippet = content[:3000].decode("utf-8", errors="replace")
        body = f"你的叮咚数据导出文件：{filename}\n\n{snippet}\n\n（如数据较多仅展示前3000字符）"
        result = await _send_email(f"叮咚数据导出 · {filename}", body)
        if "已发送" in result:
            return {"ok": True}
        return {"ok": False, "error": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@api_router.get("/data/export")
async def data_export(fmt: str = "zip"):
    from app.soul.data_transfer import export_data

    filename, content = export_data(fmt)
    if fmt == "zip":
        media_type = "application/zip"
    elif fmt == "txt":
        media_type = "text/plain"
    else:
        media_type = "application/json"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── 朋友圈 ────────────────────────────────────────────────
@api_router.get("/moments")
def list_moments():
    from app.soul.moments import get_moments

    moments = get_moments()
    return {"ok": True, "data": list(reversed(moments))}


@api_router.post("/moments/like/{moment_id}")
def like_moment(moment_id: int):
    from app.soul.moments import like_moment

    m = like_moment(moment_id)
    return {"ok": bool(m), "data": m}


@api_router.post("/moments/collect/{moment_id}")
def collect_moment(moment_id: int):
    from app.soul.moments import collect_moment

    m = collect_moment(moment_id)
    return {"ok": bool(m), "data": m}


@api_router.get("/moments/check")
async def moments_check():
    from app.soul.moments import run_moments_check

    await run_moments_check()
    return {"ok": True}


@api_router.post("/moments/generate")
async def force_generate_moment():
    """强制生成一条动态，用于测试"""
    from app.soul.moments import generate_moment

    m = await generate_moment()
    return {"ok": bool(m), "data": m}


@api_router.post("/moments/like_feedback")
def moments_like_feedback():
    """用户点赞动态，反馈给情绪系统提升warmth"""
    try:
        from app.soul.mood_state import mood_state
        import random

        state = mood_state.get()
        state["warmth"] = min(1.0, state["warmth"] + random.uniform(0.01, 0.03))
        state["_excitement"] = min(1.0, state.get("_excitement", 0.0) + 0.05)
        mood_state._save(state)
        return {"ok": True}
    except Exception:
        return {"ok": False}


# ── 虚拟场景 ──────────────────────────────────────────────
@api_router.get("/scene")
def get_scene():
    from app.soul.scene import get_scene

    return {"ok": True, "data": get_scene()}


@api_router.post("/scene/update")
async def update_scene():
    from app.soul.scene import update_scene

    scene = await update_scene()
    return {"ok": bool(scene), "data": scene}
