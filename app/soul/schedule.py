# app/soul/schedule.py
"""
日程系统：AI解析对话中的时间意图，存入数据库，到点推送提醒
"""
from __future__ import annotations
import logging
import json
from datetime import datetime, timezone, timedelta
from app.services.repository import repo

logger = logging.getLogger(__name__)

SCHEDULE_KEY = "user_schedules"


def get_schedules() -> list[dict]:
    raw = repo.get_setting(SCHEDULE_KEY)
    if isinstance(raw, list):
        return raw
    return []


def save_schedules(schedules: list[dict]):
    repo.set_setting(SCHEDULE_KEY, schedules)


def add_schedule(title: str, remind_at: str, note: str = "") -> dict:
    """
    remind_at: ISO8601字符串，如 2026-04-09T15:00:00+08:00
    """
    schedules = get_schedules()
    item = {
        "id": int(datetime.now(timezone.utc).timestamp() * 1000),
        "title": title,
        "remind_at": remind_at,
        "note": note,
        "done": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    schedules.append(item)
    save_schedules(schedules)
    logger.info(f"[schedule] 新增日程: {title} @ {remind_at}")
    return item


def delete_schedule(schedule_id: int):
    schedules = [s for s in get_schedules() if s["id"] != schedule_id]
    save_schedules(schedules)


def mark_done(schedule_id: int):
    schedules = get_schedules()
    for s in schedules:
        if s["id"] == schedule_id:
            s["done"] = True
    save_schedules(schedules)


def get_due_schedules() -> list[dict]:
    """返回当前应该提醒的日程（时间到了且未完成）"""
    now = datetime.now(timezone.utc)
    due = []
    for s in get_schedules():
        if s.get("done"):
            continue
        try:
            remind_at = datetime.fromisoformat(s["remind_at"])
            if remind_at.tzinfo is None:
                remind_at = remind_at.replace(tzinfo=timezone(timedelta(hours=8)))
            if remind_at <= now:
                due.append(s)
        except Exception:
            continue
    return due


async def extract_schedule_from_chat(user_message: str, model: str) -> dict | None:
    """从用户消息里提取日程意图，返回解析结果或None"""
    keywords = ["提醒", "记得", "别忘", "点钟", "点提醒", "日程", "安排", "明天", "后天", "下周"]
    if not any(k in user_message for k in keywords):
        return None

    try:
        from app.services.llm import llm_service
        now_str = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
        result = llm_service.chat(
            messages=[{"role": "user", "content": f"""当前时间：{now_str}（北京时间）

用户说："{user_message}"

如果这句话包含日程/提醒意图，请提取并输出JSON，格式如下：
{{"title":"事项名称","remind_at":"2026-04-09T15:00:00+08:00","note":"备注"}}

如果没有日程意图，输出：null

只输出JSON或null，不要其他内容。"""}],
            model=model,
            temperature=0.1,
            max_tokens=100,
        )
        text = result.get("text", "").strip()
        if text == "null" or not text:
            return None
        text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception as e:
        logger.error(f"[schedule] 日程解析失败: {e}")
        return None