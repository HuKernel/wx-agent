import sqlite3
from datetime import datetime, timezone

from app.core.config import settings

# ponytail: 标准库 sqlite3 + 裸 SQL，两三张表不引 ORM；Phase 5 记忆系统如需复杂查询再评估。

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    contact_name  TEXT NOT NULL,
    relationship  TEXT NOT NULL DEFAULT '朋友',
    latest_analysis TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('them','me')),
    text            TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()
