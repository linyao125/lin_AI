from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.database import database
from app.services.utils import safe_json_loads, utc_now_iso


class Repository:
    def create_conversation(self, title: str) -> str:
        cid = str(uuid.uuid4())
        now = utc_now_iso()
        database.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (cid, title, now, now),
        )
        return cid

    def list_conversations(self) -> list[dict[str, Any]]:
        rows = database.fetch_all(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE archived=0 ORDER BY updated_at DESC"
        )
        return [dict(r) for r in rows]

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        row = database.fetch_one(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id=?", (conversation_id,)
        )
        return dict(row) if row else None

    def touch_conversation(self, conversation_id: str) -> None:
        database.execute(
            "UPDATE conversations SET updated_at=? WHERE id=?", (utc_now_iso(), conversation_id)
        )

    def insert_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        token_in: int = 0,
        token_out: int = 0,
        cost_estimate: float = 0.0,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = meta or {}
        now = utc_now_iso()
        msg_id = database.execute(
            """
            INSERT INTO messages (conversation_id, role, content, created_at, token_in, token_out, cost_estimate, meta_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (conversation_id, role, content, now, token_in, token_out, cost_estimate, json.dumps(meta, ensure_ascii=False)),
        )
        self.touch_conversation(conversation_id)
        return {
            "id": msg_id,
            "role": role,
            "content": content,
            "created_at": now,
            "token_in": token_in,
            "token_out": token_out,
            "cost_estimate": cost_estimate,
            "meta": meta,
        }

    def list_messages(self, conversation_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM messages WHERE conversation_id=? ORDER BY id ASC"
        params: tuple[Any, ...] = (conversation_id,)
        if limit:
            query = "SELECT * FROM (SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?) ORDER BY id ASC"
            params = (conversation_id, limit)
        rows = database.fetch_all(query, params)
        items = []
        for r in rows:
            item = dict(r)
            item["meta"] = safe_json_loads(item.pop("meta_json"), {})
            items.append(item)
        return items

    def count_messages(self, conversation_id: str) -> int:
        row = database.fetch_one("SELECT COUNT(*) AS c FROM messages WHERE conversation_id=?", (conversation_id,))
        return int(row["c"]) if row else 0

    def get_last_message_time(self, conversation_id: str) -> str | None:
        row = database.fetch_one(
            "SELECT created_at FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1", (conversation_id,)
        )
        return row["created_at"] if row else None

    def upsert_memory(
        self,
        namespace: str,
        kind: str,
        title: str,
        content: str,
        weight: float,
        pinned: bool,
        tags: list[str],
        source: str = "user_input",
    ) -> int:
        existing = database.fetch_one(
            "SELECT id FROM memories WHERE namespace=? AND kind=? AND title=?", (namespace, kind, title)
        )
        now = utc_now_iso()
        if existing:
            database.execute(
                "UPDATE memories SET content=?, weight=?, pinned=?, tags=?, updated_at=? WHERE id=?",
                (content, weight, int(pinned), json.dumps(tags, ensure_ascii=False), now, existing["id"]),
            )
            return int(existing["id"])
        return database.execute(
            """
            INSERT INTO memories (namespace, kind, title, content, weight, pinned, tags, source, last_accessed, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (namespace, kind, title, content, weight, int(pinned), json.dumps(tags, ensure_ascii=False), source, now, now, now),
        )

    def list_memories(self, namespace: str, kind: str | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        if kind:
            rows = database.fetch_all(
                "SELECT * FROM memories WHERE namespace=? AND kind=? ORDER BY pinned DESC, weight DESC, updated_at DESC",
                (namespace, kind),
            )
        else:
            rows = database.fetch_all(
                "SELECT * FROM memories WHERE namespace=? ORDER BY pinned DESC, weight DESC, updated_at DESC",
                (namespace,),
            )
        items = []
        for r in rows:
            item = dict(r)
            item["tags"] = safe_json_loads(item["tags"], [])
            item["pinned"] = bool(item["pinned"])
            items.append(item)
        if limit is not None:
            items = items[:limit]
        return items

    def mark_memory_accessed(self, memory_id: int) -> None:
        database.execute("UPDATE memories SET last_accessed=? WHERE id=?", (utc_now_iso(), memory_id))

    def delete_memory(self, memory_id: int) -> None:
        database.execute("DELETE FROM memories WHERE id = ?", (memory_id,))

    def update_memory(self, memory_id: int, content: str) -> None:
        database.execute(
            "UPDATE memories SET content = ?, updated_at = ? WHERE id = ?",
            (content, utc_now_iso(), memory_id),
        )

    def get_cache(self, cache_key: str) -> dict[str, Any] | None:
        row = database.fetch_one(
            "SELECT * FROM cache_entries WHERE cache_key=? AND expires_at>?", (cache_key, utc_now_iso())
        )
        return dict(row) if row else None

    def set_cache(self, cache_key: str, response_text: str, token_in: int, token_out: int, cost_estimate: float, ttl_seconds: int) -> None:
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=ttl_seconds)).isoformat()
        database.execute(
            "REPLACE INTO cache_entries (cache_key, response_text, token_in, token_out, cost_estimate, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cache_key, response_text, token_in, token_out, cost_estimate, now.isoformat(), expires_at),
        )

    def get_setting(self, key: str) -> Any | None:
        row = database.fetch_one("SELECT value FROM settings WHERE key=?", (key,))
        return safe_json_loads(row["value"], None) if row else None

    def set_setting(self, key: str, value: Any) -> None:
        database.execute(
            "REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
            (key, json.dumps(value, ensure_ascii=False), utc_now_iso()),
        )

    def add_heartbeat_log(self, conversation_id: str, reason: str) -> None:
        database.execute(
            "INSERT INTO heartbeat_log (conversation_id, reason, sent_at) VALUES (?, ?, ?)",
            (conversation_id, reason, utc_now_iso()),
        )

    def get_last_heartbeat(self, conversation_id: str) -> dict[str, Any] | None:
        row = database.fetch_one(
            "SELECT * FROM heartbeat_log WHERE conversation_id=? ORDER BY id DESC LIMIT 1", (conversation_id,)
        )
        return dict(row) if row else None

    def get_usage_totals(self) -> dict[str, Any]:
        row = database.fetch_one(
            "SELECT COUNT(*) AS messages, COALESCE(SUM(token_in),0) AS token_in, COALESCE(SUM(token_out),0) AS token_out, COALESCE(SUM(cost_estimate),0) AS cost FROM messages"
        )
        return dict(row) if row else {"messages": 0, "token_in": 0, "token_out": 0, "cost": 0.0}


repo = Repository()
