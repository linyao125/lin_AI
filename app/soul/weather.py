"""
Soul Layer: Weather
天气感知，基于用户经纬度查询，注入system prompt。
完全免费，无需API Key。
"""
import logging
from datetime import date

import httpx

from app.services.repository import repo
from app.services.settings import settings_service

logger = logging.getLogger(__name__)

WEATHER_API = "https://api.open-meteo.com/v1/forecast"

WMO_CODES = {
    0: "晴天",
    1: "基本晴朗",
    2: "部分多云",
    3: "阴天",
    45: "有雾",
    48: "冻雾",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "中阵雨",
    82: "强阵雨",
    95: "雷暴",
    99: "强雷暴",
}


def get_weather() -> dict | None:
    """获取今天天气，带缓存"""
    current = settings_service.get_frontend_settings()
    lat = current.get("user_lat", "")
    lon = current.get("user_lon", "")
    if not lat or not lon:
        return None

    cache_key = f"weather_cache_{date.today().isoformat()}"
    cached = repo.get_setting(cache_key)
    if cached:
        return cached

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                WEATHER_API,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weathercode,windspeed_10m,relativehumidity_2m",
                    "timezone": "auto",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        current_weather = data.get("current", {})
        code = current_weather.get("weathercode", 0)
        temp = current_weather.get("temperature_2m")
        humidity = current_weather.get("relativehumidity_2m")
        wind = current_weather.get("windspeed_10m")

        result = {
            "temp": temp,
            "description": WMO_CODES.get(code, "未知"),
            "humidity": humidity,
            "wind": wind,
            "code": code,
        }

        repo.set_setting(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"[weather] 获取天气失败: {e}")
        return None
