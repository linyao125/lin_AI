"""
Soul Layer: Data Transfer
数据导出与导入。支持 zip（GPT 标准）/ JSON / txt 格式迁移。
"""
from __future__ import annotations
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def export_data(fmt: str = "json") -> tuple[str, bytes]:
    """
    导出全部数据，返回(文件名, bytes内容)
    fmt: 'zip'（GPT标准）或 'json' 或 'txt'
    """
    import io
    import zipfile

    from app.services.repository import repo
    from app.services.settings import settings_service

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    now_iso = datetime.now(timezone.utc).isoformat()

    conversations = repo.list_conversations()
    all_messages = {}
    for conv in conversations:
        msgs = repo.list_messages(conv["id"])
        if msgs:
            all_messages[conv["id"]] = msgs

    memories = repo.list_memories("default", limit=500)
    settings = settings_service.get_frontend_settings()

    sensitive = ["api_key", "tts_api_key", "image_api_key", "smtp_pass",
                 "newsapi_key", "vpn_subscription"]
    safe_settings = {k: ("***" if k in sensitive and v else v)
                     for k, v in settings.items()}

    if fmt == "zip":
        # GPT标准格式
        manifest = {
            "version": "1.0",
            "export_time": now_iso,
            "files": ["conversations.json", "user.json", "memories.json"]
        }

        # conversations.json - GPT格式
        convs_out = []
        for conv in conversations:
            msgs = all_messages.get(conv["id"], [])
            if not msgs:
                continue
            convs_out.append({
                "id": conv["id"],
                "title": conv.get("title", ""),
                "create_time": conv.get("created_at", ""),
                "update_time": conv.get("updated_at", conv.get("created_at", "")),
                "messages": [
                    {
                        "id": msg.get("id", ""),
                        "author": {"role": msg["role"]},
                        "create_time": msg.get("created_at", ""),
                        "content": {"content_type": "text", "parts": [msg["content"]]},
                        "model": msg.get("meta", {}).get("model", "") if isinstance(msg.get("meta"), dict) else "",
                    }
                    for msg in msgs
                ]
            })

        user_info = {
            "display_name": safe_settings.get("user_display_name", ""),
            "birthday": safe_settings.get("user_birthday", ""),
            "export_time": now_iso,
        }

        memories_out = [
            {
                "kind": m.get("kind", ""),
                "title": m.get("title", ""),
                "content": m.get("content", ""),
                "weight": m.get("weight", 0),
                "pinned": m.get("pinned", False),
                "tags": m.get("tags", []),
            }
            for m in memories
        ]

        # 打包ZIP
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("export_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            zf.writestr("conversations.json", json.dumps(convs_out, ensure_ascii=False, indent=2))
            zf.writestr("user.json", json.dumps(user_info, ensure_ascii=False, indent=2))
            zf.writestr("memories.json", json.dumps(memories_out, ensure_ascii=False, indent=2))
        buf.seek(0)
        return f"lin_ai_export_{now_str}.zip", buf.read()

    elif fmt == "txt":
        lines = [f"LIN_AI 数据导出 · {now_str}", "=" * 40, ""]
        lines.append(f"对话数：{len(conversations)}  记忆数：{len(memories)}")
        lines.append("")
        for conv in conversations:
            msgs = all_messages.get(conv["id"], [])
            if not msgs:
                continue
            lines.append(f"【对话】{conv.get('title','')}  ({conv['id']})")
            for msg in msgs:
                role = "我" if msg["role"] == "user" else "AI"
                lines.append(f"  {role}: {msg['content'][:200]}")
            lines.append("")
        lines.append("=" * 40)
        lines.append("【记忆】")
        for m in memories:
            lines.append(f"  [{m.get('kind','')}] {m.get('title','')}: {m.get('content','')[:100]}")
        content = "\n".join(lines)
        return f"lin_ai_export_{now_str}.txt", content.encode("utf-8")

    else:
        payload = {
            "export_time": now_iso,
            "version": "1.0",
            "conversations": [c for c in conversations if c["id"] in all_messages],
            "messages": all_messages,
            "memories": memories,
            "settings": safe_settings,
        }
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        return f"lin_ai_export_{now_str}.json", content.encode("utf-8")


def import_data(raw: str) -> tuple[bool, str]:
    """
    导入JSON格式数据，返回(成功, 消息)
    只导入记忆和设置，不覆盖对话记录（避免重复）
    """
    try:
        from app.services.repository import repo
        from app.services.settings import settings_service
        from app.core.config import get_runtime

        payload = json.loads(raw)
        version = payload.get("version", "1.0")
        runtime = get_runtime()
        cfg = runtime.yaml.memory

        imported_memories = 0
        for m in payload.get("memories", []):
            if m.get("kind") == "core":
                continue  # 跳过core，避免覆盖系统设定
            try:
                repo.upsert_memory(
                    namespace=m.get("namespace", cfg.namespace),
                    kind=m.get("kind", "user_info"),
                    title=m.get("title", ""),
                    content=m.get("content", ""),
                    weight=float(m.get("weight", cfg.default_weight_dynamic)),
                    pinned=bool(m.get("pinned", False)),
                    tags=m.get("tags", []),
                    source=m.get("source", "import"),
                )
                imported_memories += 1
            except Exception:
                continue

        # 导入设置（跳过敏感字段，用户需手动填）
        sensitive = ["api_key", "tts_api_key", "image_api_key", "smtp_pass",
                     "newsapi_key", "vpn_subscription"]
        imported_settings = {
            k: v for k, v in payload.get("settings", {}).items()
            if k not in sensitive and v != "***"
        }
        if imported_settings:
            settings_service.update_frontend_settings(imported_settings)

        return True, f"导入完成：{imported_memories}条记忆，设置已同步（敏感字段需手动填写）"

    except json.JSONDecodeError:
        return False, "文件格式错误，请上传有效的JSON文件"
    except Exception as e:
        logger.error(f"[data_transfer] import error: {e}")
        return False, f"导入失败：{e}"