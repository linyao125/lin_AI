from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import random
import re
from typing import Iterable


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compact_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def short_title(text: str, limit: int = 24) -> str:
    text = compact_text(text)
    return text[:limit] or "新对话"


def hash_payload(items: Iterable[str]) -> str:
    joined = "||".join(compact_text(x) for x in items)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def safe_json_loads(raw: str, default):
    try:
        return json.loads(raw)
    except Exception:
        return default


def pick_template(items: list[str]) -> str:
    if not items:
        return "我还在。"
    return random.choice(items)
