"""记忆存储与检索。

模型（对应 /docs/ARCHITECTURE.md §5 三类记忆）：
- style        全局唯一画像（用户沟通风格），LLM 每次分析输出更新版，覆盖式 upsert
- relationship 每联系人一条画像（关系记忆），同覆盖式 upsert
- summary      每联系人追加式分段摘要，固定 covered_to 边界、从原文一次生成、永不重摘要

Forget 直接物理删除：DB 是注入的唯一来源，无缓存层，不存在回流路径。
"""

from app.db import connect, utcnow
from app.llm.schemas import MemoryUpdates

# 进入 prompt 的各段预算（条数）；单用户量小，超出取最新
MAX_STYLE = 1
MAX_RELATIONSHIP = 1
MAX_SUMMARY_SEGMENTS = 10
# 最近窗口：窗口内消息原文进 prompt，窗口外靠摘要段
CONTEXT_WINDOW = 20
# 每个摘要段覆盖的最大消息数
SUMMARY_SEGMENT_SIZE = 20


def _upsert_profile(kind: str, conversation_id: str | None, content: str) -> None:
    scope = "global" if conversation_id is None else "conversation"
    now = utcnow()
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM memories WHERE kind = ? AND conversation_id IS ?",
            (kind, conversation_id),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE memories SET content = ?, updated_at = ? WHERE id = ?", (content, now, row["id"])
            )
        else:
            conn.execute(
                "INSERT INTO memories (scope, conversation_id, kind, content, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (scope, conversation_id, kind, content, now, now),
            )


def save_memory_updates(conversation_id: str, updates: MemoryUpdates) -> None:
    if updates.style_profile:
        _upsert_profile("style", None, updates.style_profile)
    if updates.relationship_profile:
        _upsert_profile("relationship", conversation_id, updates.relationship_profile)


def add_summary_segment(conversation_id: str, covered_to: int, content: str) -> None:
    now = utcnow()
    with connect() as conn:
        conn.execute(
            "INSERT INTO memories (scope, conversation_id, kind, content, covered_to, created_at, updated_at)"
            " VALUES ('conversation', ?, 'summary', ?, ?, ?, ?)",
            (conversation_id, content, covered_to, now, now),
        )


def summary_covered_to(conversation_id: str) -> int:
    """已有摘要段覆盖到的最大消息 id（无段返回 0）。"""
    with connect() as conn:
        row = conn.execute(
            "SELECT MAX(covered_to) AS m FROM memories"
            " WHERE kind = 'summary' AND conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        return row["m"] or 0


def build_memory_sections(conversation_id: str) -> str:
    """组装注入 system prompt 的「已知背景」段；无记忆返回空串。"""
    with connect() as conn:
        style = conn.execute(
            "SELECT content FROM memories WHERE kind = 'style' AND conversation_id IS NULL"
        ).fetchone()
        rel = conn.execute(
            "SELECT content FROM memories WHERE kind = 'relationship' AND conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        summaries = conn.execute(
            "SELECT content FROM memories WHERE kind = 'summary' AND conversation_id = ?"
            " ORDER BY covered_to DESC LIMIT ?",
            (conversation_id, MAX_SUMMARY_SEGMENTS),
        ).fetchall()

    sections: list[str] = []
    if style:
        sections.append("## 用户沟通风格画像\n" + style["content"])
    if rel:
        sections.append("## 与该联系人的关系记忆\n" + rel["content"])
    if summaries:
        ordered = list(reversed([r["content"] for r in summaries]))
        sections.append("## 此前对话摘要（较早→较晚）\n" + "\n".join(ordered))
    return "\n\n".join(sections)


def list_memories() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT m.id, m.kind, m.scope, m.content, m.created_at, m.updated_at,
                   c.contact_name
            FROM memories m LEFT JOIN conversations c ON c.id = m.conversation_id
            ORDER BY m.kind, m.updated_at DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def delete_memory(memory_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        return cur.rowcount > 0
