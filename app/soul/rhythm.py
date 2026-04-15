"""
Soul Layer: Rhythm
用户作息感知 + 天气感知，为ContextWeaver提供环境上下文。
不硬编码行为，只提供数据，让AI自己决定如何响应。
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from app.services.repository import repo


def infer_user_rhythm(hour: int) -> str:
    """
    根据历史消息小时分布，推导当前时刻用户可能的状态。
    无数据时降级到通用描述。
    """
    dist = repo.get_user_message_hour_distribution()
    if not dist or sum(dist.values()) < 20:
        # 数据不足，用中性描述
        return f"现在是{hour}点。"

    total = sum(dist.values())
    # 找活跃时段（消息量前40%的小时）
    threshold = total / len(dist) * 0.6
    active_hours = {h for h, c in dist.items() if c >= threshold}

    # 推导起床时间：活跃小时里最早的
    morning_active = sorted([h for h in active_hours if 5 <= h <= 11])
    wake_hour = morning_active[0] if morning_active else 7

    # 推导睡觉时间：活跃小时里最晚的
    night_active = sorted([h for h in active_hours if 20 <= h <= 27], reverse=True)  # 27=3am
    sleep_hour = (night_active[0] % 24) if night_active else 23

    # 推导午休：11-14点是否有活跃低谷
    midday = [dist.get(h, 0) for h in range(11, 15)]
    has_lunch_break = len(midday) > 0 and min(midday) < threshold * 0.5

    # 根据当前小时和作息规律生成描述
    current_activity = _guess_activity(hour, wake_hour, sleep_hour, has_lunch_break, active_hours)
    return f"现在是{hour}点。根据用户的习惯，{current_activity}"


def _guess_activity(hour: int, wake: int, sleep: int, has_lunch: bool, active: set) -> str:
    if hour < wake - 1:
        return "用户通常还在睡觉。"
    if hour == wake or hour == wake + 1:
        return "用户通常刚起床不久。"
    if has_lunch and 11 <= hour <= 13:
        return "用户可能在吃饭或午休。"
    if hour in active:
        if 9 <= hour <= 17:
            return "用户通常这个时间比较活跃，可能在工作或学习。"
        if 18 <= hour <= 21:
            return "用户通常这个时间在线，可能在放松或娱乐。"
        return "用户通常这个时间活跃。"
    if hour >= sleep or hour < wake - 2:
        return "用户通常这个时间已经休息了。"
    return "用户活跃度一般。"


async def fetch_weather_by_ip() -> str | None:
    """用ip-api.com定位城市，再用wttr.in拉天气，结果缓存6小时"""
    import httpx
    try:
        # 先查缓存
        cached = repo.get_setting("weather_cache")
        if isinstance(cached, dict):
            cached_at = cached.get("cached_at", "")
            if cached_at:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(cached_at)
                if (datetime.now(timezone.utc) - dt).total_seconds() < 21600:
                    return cached.get("text")

        # IP定位城市
        city = repo.get_setting("user_city")
        if not city:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get("http://ip-api.com/json/?fields=city,country,status&lang=zh-CN")
                data = resp.json()
                if data.get("status") == "success":
                    city = data.get("city", "")
                    repo.set_setting("user_city", city)

        if not city:
            return None

        # 拉天气
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://wttr.in/{city}",
                params={"format": "j1"},
                headers={"User-Agent": "curl/7.0"},
            )
            data = resp.json()
        current = data["current_condition"][0]
        temp = current["temp_C"]
        feels = current["FeelsLikeC"]
        desc = current["weatherDesc"][0]["value"]
        humidity = current["humidity"]
        text = f"{city}，{desc}，{temp}°C（体感{feels}°C），湿度{humidity}%"

        # 缓存
        repo.set_setting("weather_cache", {
            "text": text,
            "cached_at": datetime.now(timezone.utc).isoformat(),
        })
        return text
    except Exception:
        return None


def get_weather_cached() -> str | None:
    """同步读取天气缓存，供anchor.py使用"""
    cached = repo.get_setting("weather_cache")
    if isinstance(cached, dict):
        return cached.get("text")
    return None