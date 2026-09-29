import json
import uuid

from app.db import connect, utcnow
from app.llm.schemas import AnalysisResult


def _touch(conn, conversation_id: str) -> None:
    conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (utcnow(), conversation_id))


def list_conversations() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT c.*, (
                SELECT text FROM messages m
                WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1
            ) AS last_text,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
            FROM conversations c ORDER BY c.updated_at DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def get_conversation(conversation_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        if row is None:
            return None
        result = dict(row)
        if result.get("latest_analysis"):
            result["latest_analysis"] = json.loads(result["latest_analysis"])
        msgs = conn.execute(
            "SELECT id, role, text, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
        result["messages"] = [dict(m) for m in msgs]
        return result


def create_conversation(contact_name: str, relationship: str) -> dict:
    cid = uuid.uuid4().hex
    now = utcnow()
    with connect() as conn:
        conn.execute(
            "INSERT INTO conversations (id, contact_name, relationship, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (cid, contact_name, relationship, now, now),
        )
    return {"id": cid, "contact_name": contact_name, "relationship": relationship}


def delete_conversation(conversation_id: str) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        return cur.rowcount > 0


def add_message(conversation_id: str, role: str, text: str) -> dict:
    now = utcnow()
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO messages (conversation_id, role, text, created_at) VALUES (?, ?, ?, ?)",
            (conversation_id, role, text, now),
        )
        _touch(conn, conversation_id)
        return {"id": cur.lastrowid, "role": role, "text": text, "created_at": now}


def delete_message(conversation_id: str, message_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM messages WHERE id = ? AND conversation_id = ?",
            (message_id, conversation_id),
        )
        deleted = cur.rowcount > 0
        if deleted:
            _touch(conn, conversation_id)
        return deleted


def save_analysis(conversation_id: str, result: AnalysisResult) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "UPDATE conversations SET latest_analysis = ?, updated_at = ? WHERE id = ?",
            (result.model_dump_json(), utcnow(), conversation_id),
        )
        return cur.rowcount > 0
