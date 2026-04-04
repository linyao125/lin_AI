"""
Soul Layer: Push System
主动推送管理，存储和下发AI主动产生的消息。
"""
import json
import logging
from datetime import datetime, timezone

from app.services.repository import repo

logger = logging.getLogger(__name__)


class PushService:

    def add_push(self, content: str, kind: str = "thought"):
        """心跳/梦境层调用，存入待推送队列"""
        key = f"pending_push_{kind}_{datetime.now(timezone.utc).timestamp()}"
        repo.set_setting(
            key,
            {
                "content": content,
                "kind": kind,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        logger.info(f"[push] 新增推送: {content[:30]}")

    def pop_pending(self) -> list[dict]:
        """取出所有待推送消息并删除"""
        try:
            rows = repo.list_settings_by_key_like("pending_push_%")
            result = []
            for row in rows:
                try:
                    data = json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
                    result.append(data)
                    repo.delete_setting(row["key"])
                except Exception:
                    pass
            return result
        except Exception as e:
            logger.error(f"[push] pop_pending失败: {e}")
            return []


push_service = PushService()
