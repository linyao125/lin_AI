"""
Soul Layer: Study Knowledge Base
备考知识库。支持文件上传、URL导入、问答/考试模式。
"""
from __future__ import annotations
import logging
import re
import json
from datetime import datetime, timezone
from app.services.repository import repo

logger = logging.getLogger(__name__)
STUDY_NS = "study"


def _clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text[:8000]  # 单条限8000字


def _chunk(text: str, size: int = 500) -> list[str]:
    """按段落切块，避免单条过长"""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks, buf = [], ""
    for p in paragraphs:
        if len(buf) + len(p) > size:
            if buf:
                chunks.append(buf.strip())
            buf = p
        else:
            buf = (buf + "\n\n" + p).strip()
    if buf:
        chunks.append(buf.strip())
    return chunks or [text[:size]]


def import_text(title: str, text: str, source: str = "upload") -> int:
    """导入纯文本到知识库，按块切分存储，返回写入条数"""
    text = _clean_text(text)
    chunks = _chunk(text)
    for i, chunk in enumerate(chunks):
        repo.upsert_memory(
            namespace=STUDY_NS,
            kind="study",
            title=f"{title}#{i+1}" if len(chunks) > 1 else title,
            content=chunk,
            weight=1.0,
            pinned=False,
            tags=["study", source],
            source=source,
        )
    return len(chunks)


async def import_url(url: str) -> tuple[bool, str]:
    """抓取URL内容并导入知识库"""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            html = resp.text

        # 简单清洗HTML
        text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
        text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"&[a-z]+;", " ", text)
        text = _clean_text(text)

        if len(text) < 50:
            return False, "页面内容太少，无法导入"

        # 用URL域名作为标题
        from urllib.parse import urlparse
        domain = urlparse(url).netloc
        title = f"{domain}_{datetime.now().strftime('%m%d%H%M')}"
        count = import_text(title, text, source=url)
        return True, f"导入成功，共{count}段"

    except Exception as e:
        logger.error(f"[study] import_url error: {e}")
        return False, str(e)


def list_study_items() -> list[dict]:
    items = repo.list_memories(STUDY_NS)
    # 按title分组，只返回每组第一条作为摘要
    seen, result = set(), []
    for item in items:
        base_title = item["title"].split("#")[0]
        if base_title not in seen:
            seen.add(base_title)
            result.append({
                "id": item["id"],
                "title": base_title,
                "source": item.get("source", ""),
                "updated_at": item.get("updated_at", ""),
                "chunks": sum(1 for i in items if i["title"].split("#")[0] == base_title),
            })
    return result


def delete_study_item(title_base: str):
    """删除同一来源的所有块"""
    items = repo.list_memories(STUDY_NS)
    for item in items:
        if item["title"].split("#")[0] == title_base:
            repo.delete_memory(item["id"])


def retrieve_study(query: str, top_k: int = 5) -> list[dict]:
    """检索知识库，返回最相关的块"""
    import re as _re
    from collections import Counter
    import math
    from datetime import datetime, timezone

    def tokens(t):
        return _re.findall(r"[\w\u4e00-\u9fff]+", t.lower())

    items = repo.list_memories(STUDY_NS)
    if not items:
        return []

    query_terms = Counter(tokens(query))
    now = datetime.now(timezone.utc)
    scored = []
    for item in items:
        text = f"{item['title']} {item['content']}"
        overlap = sum((query_terms & Counter(tokens(text))).values())
        if overlap == 0:
            continue
        try:
            updated = datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00"))
            decay = math.exp(-(now - updated).days / 60)
        except Exception:
            decay = 1.0
        scored.append((overlap + decay * 0.3, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


async def generate_quiz(topic: str = "", count: int = 5) -> list[dict]:
    """基于知识库生成题目"""
    try:
        from app.services.llm import llm_service
        from app.services.settings import settings_service
        from app.core.config import get_runtime

        runtime = get_runtime()
        current = settings_service.get_frontend_settings()
        primary_model = (current.get("primary_model") or runtime.settings.llm_primary_model).strip()

        query = topic or "综合"
        chunks = retrieve_study(query, top_k=8)
        if not chunks:
            return []

        context = "\n\n".join(c["content"] for c in chunks)[:3000]

        prompt = f"""根据以下知识内容，生成{count}道测试题（单选题）。

知识内容：
{context}

输出JSON数组，每题格式：
{{"q":"题目","options":["A.xxx","B.xxx","C.xxx","D.xxx"],"answer":"A","explain":"简短解析"}}

只输出JSON数组，不加其他内容。"""

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=primary_model,
            temperature=0.5,
            max_tokens=2000,
        )
        text = result.get("text", "").strip()
        text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)

    except Exception as e:
        logger.error(f"[study] generate_quiz error: {e}")
        return []