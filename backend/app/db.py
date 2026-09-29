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

CREATE TABLE IF NOT EXISTS memories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    scope           TEXT NOT NULL CHECK(scope IN ('global','conversation')),
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK(kind IN ('style','relationship','summary')),
    content         TEXT NOT NULL,
    covered_to      INTEGER,
    source_type     TEXT NOT NULL DEFAULT 'inferred',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_style ON memories(conversation_id) WHERE kind = 'style';
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_relationship ON memories(conversation_id) WHERE kind = 'relationship';
CREATE INDEX IF NOT EXISTS idx_memory_conversation ON memories(conversation_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        # 微信直读（第 23 次）加列；PRAGMA 判断保证旧库平滑迁移
        cols = {r[1] for r in conn.execute("PRAGMA table_info(conversations)")}
        if "wechat_chat_id" not in cols:
            conn.execute("ALTER TABLE conversations ADD COLUMN wechat_chat_id TEXT")
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_wechat"
                " ON conversations(wechat_chat_id) WHERE wechat_chat_id IS NOT NULL"
            )
        if "wechat_cursor" not in cols:
            conn.execute("ALTER TABLE conversations ADD COLUMN wechat_cursor REAL NOT NULL DEFAULT 0")
        mcols = {r[1] for r in conn.execute("PRAGMA table_info(messages)")}
        if "wechat_server_id" not in mcols:
            conn.execute("ALTER TABLE messages ADD COLUMN wechat_server_id TEXT")
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_wechat_sid"
                " ON messages(wechat_server_id) WHERE wechat_server_id IS NOT NULL"
            )


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()
