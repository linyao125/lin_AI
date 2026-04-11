"""
Soul Layer: Calendar
节假日感知，本地静态数据，无网络依赖。
"""
import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# 2026年中国法定节假日静态表
HOLIDAYS_2026 = {
    "2026-01-01": "元旦",
    "2026-01-28": "春节",
    "2026-01-29": "春节",
    "2026-01-30": "春节",
    "2026-01-31": "春节",
    "2026-02-01": "春节",
    "2026-02-02": "春节",
    "2026-02-03": "春节",
    "2026-04-05": "清明节",
    "2026-04-06": "清明节",
    "2026-04-07": "清明节",
    "2026-05-01": "劳动节",
    "2026-05-02": "劳动节",
    "2026-05-03": "劳动节",
    "2026-05-04": "劳动节",
    "2026-05-05": "劳动节",
    "2026-06-19": "端午节",
    "2026-06-20": "端午节",
    "2026-06-21": "端午节",
    "2026-10-01": "国庆节",
    "2026-10-02": "国庆节",
    "2026-10-03": "国庆节",
    "2026-10-04": "国庆节",
    "2026-10-05": "国庆节",
    "2026-10-06": "国庆节",
    "2026-10-07": "国庆节",
    "2026-10-08": "中秋节",
}


def get_today_holiday() -> dict:
    today = date.today().isoformat()
    name = HOLIDAYS_2026.get(today, "")
    return {
        "date": today,
        "is_holiday": bool(name),
        "name": name,
        "days_to_next": None,
    }


def get_upcoming_holidays() -> list:
    today = date.today()
    seen, upcoming = set(), []
    for i in range(1, 30):
        d = today + timedelta(days=i)
        ds = d.isoformat()
        name = HOLIDAYS_2026.get(ds, "")
        if name and name not in seen:
            seen.add(name)
            upcoming.append({"name": name, "date": ds, "days": i})
        if len(upcoming) >= 3:
            break
    return upcoming