"""
Soul Layer: MCP Tools
AI可自主调用的工具集。无需用户注册的工具内置实现，
需要配置的工具读取settings。
"""
from __future__ import annotations
import logging
import json
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


# ── 工具注册表 ────────────────────────────────────────────
TOOLS = {
    "web_search": {
        "description": "搜索互联网获取实时信息",
        "params": ["query"],
    },
    "web_fetch": {
        "description": "抓取网页或链接的文本内容",
        "params": ["url"],
    },
    "weather": {
        "description": "查询某地的天气",
        "params": ["city"],
    },
    "holiday": {
        "description": "查询节假日信息",
        "params": ["date"],
    },
    "send_email": {
        "description": "以AI身份发送邮件给用户",
        "params": ["subject", "body"],
    },
}


def get_tools_prompt() -> str:
    """生成注入System Prompt的工具说明"""
    lines = ["[MCP Tools] 你可以调用以下工具获取实时信息或执行操作。"]
    lines.append("调用格式：在回复中单独一行写 <tool>工具名|参数值</tool>")
    lines.append("调用后等待结果再继续回复。可用工具：")
    for name, info in TOOLS.items():
        params = "、".join(info["params"])
        lines.append(f"- {name}({params})：{info['description']}")
    lines.append("只在真正需要实时信息时调用，不要滥用。")
    return "\n".join(lines)


async def execute_tool(tool_name: str, params: list[str]) -> str:
    """执行工具调用，返回结果字符串"""
    try:
        if tool_name == "web_search":
            return await _web_search(params[0] if params else "")
        elif tool_name == "web_fetch":
            return await _web_fetch(params[0] if params else "")
        elif tool_name == "weather":
            return await _weather(params[0] if params else "")
        elif tool_name == "holiday":
            return await _holiday(params[0] if params else "")
        elif tool_name == "send_email":
            subject = params[0] if len(params) > 0 else ""
            body = params[1] if len(params) > 1 else ""
            return await _send_email(subject, body)
        else:
            return f"未知工具：{tool_name}"
    except Exception as e:
        logger.error(f"[mcp] execute_tool error: {e}")
        return f"工具调用失败：{e}"


async def _web_search(query: str) -> str:
    try:
        import httpx
        # 用DuckDuckGo即时答案API，无需注册
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()
        
        results = []
        if data.get("AbstractText"):
            results.append(data["AbstractText"][:300])
        for r in data.get("RelatedTopics", [])[:3]:
            if isinstance(r, dict) and r.get("Text"):
                results.append(r["Text"][:150])
        
        return "\n".join(results) if results else "未找到相关结果"
    except Exception as e:
        return f"搜索失败：{e}"


async def _web_fetch(url: str) -> str:
    try:
        import httpx
        import re
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            html = resp.text
        # 简单清洗
        text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
        text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:1000]
    except Exception as e:
        return f"抓取失败：{e}"


async def _weather(city: str) -> str:
    try:
        import httpx
        # wttr.in 免费天气API，无需注册
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
        return f"{city}天气：{desc}，{temp}°C（体感{feels}°C），湿度{humidity}%"
    except Exception as e:
        return f"天气查询失败：{e}"


async def _holiday(date_str: str) -> str:
    try:
        import httpx
        # 用现有calendar模块
        from app.soul.calendar import get_today_holiday, get_upcoming_holidays
        today = get_today_holiday()
        upcoming = get_upcoming_holidays()
        result = []
        if today.get("is_holiday"):
            result.append(f"今天是{today.get('name','假日')}")
        if upcoming:
            for h in upcoming[:3]:
                result.append(f"{h['name']}还有{h['days']}天")
        return "\n".join(result) if result else "近期无节假日"
    except Exception as e:
        return f"节假日查询失败：{e}"


async def _send_email(subject: str, body: str) -> str:
    try:
        from app.services.settings import settings_service
        s = settings_service.get_frontend_settings()
        smtp_host = s.get("smtp_host", "")
        smtp_port = int(s.get("smtp_port", 465))
        smtp_user = s.get("smtp_user", "")
        smtp_pass = s.get("smtp_pass", "")
        to_email  = s.get("user_email", "")

        if not all([smtp_host, smtp_user, smtp_pass, to_email]):
            return "邮件未配置，请在设置里填写SMTP信息"

        import smtplib
        from email.mime.text import MIMEText
        from app.core.config import get_runtime
        display_name = (s.get("display_name") or get_runtime().yaml.assistant.display_name).strip()

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"]    = f"{display_name} <{smtp_user}>"
        msg["To"]      = to_email

        with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        return f"邮件已发送至{to_email}"
    except Exception as e:
        return f"发送失败：{e}"