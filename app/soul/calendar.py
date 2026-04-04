"""
Soul Layer: Calendar
节假日感知，每天缓存一次，注入system prompt。
"""
import logging
from datetime import date

import httpx

from app.services.repository import repo

logger = logging.getLogger(__name__)

HOLIDAY_API = "https://holiday.ailcc.com/api/holiday/date/{date}"


def get_today_holiday() -> dict:
    """获取今天的节假日信息，带缓存"""
    today = date.today().isoformat()
    cache_key = f"holiday_cache_{today}"

    # 先查缓存
    cached = repo.get_setting(cache_key)
    if cached:
        return cached

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(HOLIDAY_API.format(date=today))
            resp.raise_for_status()
            data = resp.json()

        result = {
            "date": today,
            "is_holiday": data.get("code") == 0
            and data.get("holiday", {})
            .get(today.replace("-", "")[4:], {})
            .get("holiday", False),
            "name": "",
            "days_to_next": None,
        }

        # 提取节日名
        holiday_data = data.get("holiday", {})
        for _k, v in holiday_data.items():
            if v.get("date") == today:
                result["name"] = v.get("name", "")
                break

        repo.set_setting(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"[calendar] 获取节假日失败: {e}")
        return {"date": today, "is_holiday": False, "name": "", "days_to_next": None}


def get_upcoming_holidays() -> list:
    """获取未来7天的节假日"""
    cache_key = f"upcoming_holidays_{date.today().isoformat()}"
    cached = repo.get_setting(cache_key)
    if cached:
        return cached

    try:
        year = date.today().year
        with httpx.Client(timeout=10) as client:
            resp = client.get(f"https://holiday.ailcc.com/api/holiday/year/{year}")
            resp.raise_for_status()
            data = resp.json()

        today = date.today()
        upcoming = []
        holiday_data = data.get("holiday", {})
        for _k, v in holiday_data.items():
            try:
                d = date.fromisoformat(v.get("date", ""))
                diff = (d - today).days
                if 0 < diff <= 7:
                    upcoming.append({"name": v.get("name", ""), "date": v.get("date"), "days": diff})
            except Exception:
                pass

        upcoming.sort(key=lambda x: x["days"])
        repo.set_setting(cache_key, upcoming)
        return upcoming

    except Exception as e:
        logger.error(f"[calendar] 获取即将到来节假日失败: {e}")
        return []
