from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
DB_PATH = ROOT_DIR / "data" / "lin_system.db"


class Database:
    def __init__(self) -> None:
        self.lock = RLock()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def init(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    token_in INTEGER DEFAULT 0,
                    token_out INTEGER DEFAULT 0,
                    cost_estimate REAL DEFAULT 0,
                    meta_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at);
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    namespace TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    weight REAL NOT NULL DEFAULT 0.5,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    tags TEXT DEFAULT '[]',
                    source TEXT NOT NULL DEFAULT 'user_input',
                    last_accessed TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_memories_namespace_kind ON memories (namespace, kind);
                CREATE TABLE IF NOT EXISTS cache_entries (
                    cache_key TEXT PRIMARY KEY,
                    response_text TEXT NOT NULL,
                    token_in INTEGER DEFAULT 0,
                    token_out INTEGER DEFAULT 0,
                    cost_estimate REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS heartbeat_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    sent_at TEXT NOT NULL
                );
                """
            )
            conn.commit()

    def fetch_all(self, query: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self.lock, self.connect() as conn:
            return conn.execute(query, params).fetchall()

    def fetch_one(self, query: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        with self.lock, self.connect() as conn:
            return conn.execute(query, params).fetchone()

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> int:
        with self.lock, self.connect() as conn:
            cur = conn.execute(query, params)
            conn.commit()
            return cur.lastrowid


database = Database()
