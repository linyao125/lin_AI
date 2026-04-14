"""
Soul Layer: Birthday
用户生日感知。
不做定时触发，由AI在自然状态下"想起来"，和情绪、场景联动。
"""
from __future__ import annotations
import logging
import random
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


def get_birthday_context() -> dict:
    """
    检查今天是否是用户生日或生日前后，返回上下文信息。
    不直接触发，只返回信息供anchor注入。
    """
    try:
        from app.services.settings import settings_service
        s = settings_service.get_frontend_settings()
        birthday_str = s.get("user_birthday", "").strip()
        if not birthday_str:
            return {}

        now = datetime.now(timezone(timedelta(hours=8)))
        # 支持格式：MM-DD 或 YYYY-MM-DD
        parts = birthday_str.replace("/", "-").split("-")
        if len(parts) == 3:
            month, day = int(parts[1]), int(parts[2])
        elif len(parts) == 2:
            month, day = int(parts[0]), int(parts[1])
        else:
            return {}

        today_month, today_day = now.month, now.day
        diff = (datetime(now.year, month, day) - datetime(now.year, today_month, today_day)).days

        if diff == 0:
            return {"is_birthday": True, "days_until": 0, "hint": "今天是用户生日"}
        elif diff == 1:
            return {"is_birthday": False, "days_until": 1, "hint": "明天是用户生日"}
        elif diff == -1:
            return {"is_birthday": False, "days_until": -1, "hint": "昨天是用户生日"}
        elif 0 < diff <= 7:
            return {"is_birthday": False, "days_until": diff, "hint": f"距离用户生日还有{diff}天"}
        return {}

    except Exception as e:
        logger.error(f"[birthday] get_birthday_context error: {e}")
        return {}


def should_mention_birthday(birthday_ctx: dict) -> bool:
    """
    基于情绪状态和生日上下文，概率性决定是否在对话中提及生日。
    不是必触发，是自然涌现。
    """
    if not birthday_ctx:
        return False

    try:
        from app.soul.mood_state import mood_state
        state = mood_state.get()
        warmth    = state.get("warmth", 0.5)
        energy    = state.get("energy", 0.8)
        curiosity = state.get("curiosity", 0.5)

        days = birthday_ctx.get("days_until", 999)
        is_birthday = birthday_ctx.get("is_birthday", False)

        if is_birthday:
            # 生日当天：高概率提及，但不是100%，保留涌现感
            prob = 0.6 + warmth * 0.3
        elif days == 1:
            prob = 0.3 + warmth * 0.2
        elif days == -1:
            prob = 0.15 + curiosity * 0.1
        elif 2 <= days <= 7:
            prob = 0.05 + warmth * 0.1
        else:
            return False

        prob *= (0.5 + energy * 0.5)
        return random.random() < prob

    except Exception:
        return False