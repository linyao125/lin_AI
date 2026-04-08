# app/soul/news.py
"""
新闻感知层：定时拉取 + AI提取兴趣词 + push_service推送
"""
from __future__ import annotations
import logging
import httpx
from datetime import datetime, timezone
from app.services.repository import repo
from app.soul.mood_state import mood_state

logger = logging.getLogger(__name__)

NEWSAPI_URL = "https://newsapi.org/v2/everything"


def _get_keywords(settings: dict) -> list[str]:
    """合并手动关键词 + AI自动提取的兴趣词"""
    manual = settings.get("news_keywords", "")
    manual_list = [k.strip() for k in manual.split(",") if k.strip()]

    auto_list = []
    try:
        auto_raw = repo.get_setting("news_auto_keywords") or []
        if isinstance(auto_raw, list):
            auto_list = auto_raw
    except Exception:
        pass

    merged = list(dict.fromkeys(manual_list + auto_list))
    return merged[:5] or ["AI", "科技", "生活"]


async def extract_keywords_from_chat(messages: list[dict], model: str, api_key: str, api_base: str):
    """从最近对话里提取用户兴趣关键词，存入数据库"""
    if not messages:
        return
    try:
        dialogue = "\n".join(
            m["content"] for m in messages[-20:]
            if m.get("role") == "user"
        )
        from app.services.llm import llm_service
        result = llm_service.chat(
            messages=[{"role": "user", "content": f"""根据以下用户对话，提取3-5个用户感兴趣的新闻关键词。
只输出关键词，用英文逗号分隔，不要解释，不要标点以外的符号。
例如：AI,股市,气候变化,体育

对话内容：
{dialogue}"""}],
            model=model,
            temperature=0.3,
            max_tokens=50,
        )
        text = result.get("text", "").strip()
        keywords = [k.strip() for k in text.split(",") if k.strip()][:5]
        if keywords:
            repo.set_setting("news_auto_keywords", keywords)
            logger.info(f"[news] 自动关键词更新: {keywords}")
    except Exception as e:
        logger.error(f"[news] 关键词提取失败: {e}")


async def run_news_cycle():
    """拉取新闻并推送"""
    try:
        from app.services.settings import settings_service
        from app.soul.push import push_service

        s = settings_service.get_frontend_settings()
        news_api_key = s.get("news_api_key", "").strip()
        if not news_api_key:
            return

        keywords = _get_keywords(s)
        query = " OR ".join(keywords)

        resp = httpx.get(
            NEWSAPI_URL,
            params={
                "q": query,
                "language": "zh",
                "sortBy": "publishedAt",
                "pageSize": 3,
                "apiKey": news_api_key,
            },
            timeout=15,
        )
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
        if not articles:
            # 中文没结果降级英文
            resp = httpx.get(
                NEWSAPI_URL,
                params={
                    "q": query,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": 3,
                    "apiKey": news_api_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            articles = resp.json().get("articles", [])

        for article in articles[:2]:
            title = article.get("title", "").strip()
            url = article.get("url", "")
            if not title:
                continue
            push_text = f"📰 {title}\n{url}"
            push_service.add_push(push_text, kind="news")
            logger.info(f"[news] 推送新闻: {title}")

        repo.set_setting("news_last_run", datetime.now(timezone.utc).isoformat())

    except Exception as e:
        logger.error(f"[news] 新闻拉取失败: {e}")