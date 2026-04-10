"""
Soul Layer: Data Transfer
数据导出与导入。支持对话记录、记忆、设置的JSON/txt格式迁移。
"""
from __future__ import annotations
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def export_data(fmt: str = "json") -> tuple[str, str]:
    """
    导出全部数据，返回(文件名, 内容字符串)
    fmt: 'json' 或 'txt'
    """
    from app.services.repository import repo
    from app.services.settings import settings_service

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 收集数据
    conversations = repo.list_conversations()
    all_messages = {}
    for conv in conversations:
        msgs = repo.list_messages(conv["id"])
        all_messages[conv["id"]] = msgs

    memories = repo.list_memories("default", limit=500)
    settings = settings_service.get_frontend_settings()

    # 敏感字段脱敏
    sensitive = ["api_key", "tts_api_key", "image_api_key", "smtp_pass",
                 "newsapi_key", "vpn_subscription"]
    safe_settings = {k: ("***" if k in sensitive and v else v)
                     for k, v in settings.items()}

    payload = {
        "export_time": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "conversations": conversations,
        "messages": all_messages,
        "memories": memories,
        "settings": safe_settings,
    }

    if fmt == "txt":
        lines = [f"LIN_AI 数据导出 · {now_str}", "=" * 40, ""]
        lines.append(f"对话数：{len(conversations)}  记忆数：{len(memories)}")
        lines.append("")

        for conv in conversations:
            lines.append(f"【对话】{conv.get('title','')}  ({conv['id']})")
            for msg in all_messages.get(conv["id"], []):
                role = "我" if msg["role"] == "user" else "AI"
                lines.append(f"  {role}: {msg['content'][:200]}")
            lines.append("")

        lines.append("=" * 40)
        lines.append("【记忆】")
        for m in memories:
            lines.append(f"  [{m.get('kind','')}] {m.get('title','')}: {m.get('content','')[:100]}")

        content = "\n".join(lines)
        return f"lin_ai_export_{now_str}.txt", content
    else:
        content = json.dumps(payload, ensure_ascii=False, indent=2)
        return f"lin_ai_export_{now_str}.json", content


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