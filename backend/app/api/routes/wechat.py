"""微信本地库直读（实验功能）：chatlog-keeper 解密 + 增量同步到 Emora 会话。

数据流：Electron 主进程每 10s 调 /sync → read_after 增量读微信库 → 写入已绑定的
会话（server_id 幂等去重）→ 返回需要分析的会话（末条是对方消息）→ 主进程带
LLM 配置调 /api/analyze。除 /extract-key 外全程只读微信数据，不做任何回写。

安全模型：key 由主进程引导提取后经 /set-key 存入 chatlog-keeper 本地缓存；
消息数据不出本机；解除绑定只断映射，不删 Emora 侧数据。
"""

import hashlib
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.conversations import store as conv_store
from app.db import connect, utcnow

router = APIRouter(prefix="/api/wechat", tags=["wechat-direct"])

# 回填与游标参数：绑定导入最近 30 天（尾部最多 500 条，防几千条全量轰炸拖慢
# 首次分析——超出部分的摘要成本不划算）；同步查询带 2s 重叠，配合
# wechat_server_id 唯一索引兜底同秒消息，不漏不重。
BACKFILL_WINDOW_S = 30 * 86400
BACKFILL_LIMIT = 500
SYNC_OVERLAP_S = 2

_master_key_re = re.compile(r"master key: ([0-9a-f]{64})")


def _is_v4_dir(wxid_dir) -> bool:
    """微信 4.x 独有的 db_storage/message 结构；自动探测可能命中 3.x 遗留目录，
    其下虽散落同名 db 但 read_conversation_directory 会失败，须提前识别。"""
    if not wxid_dir:
        return False
    msg_dir = Path(wxid_dir) / "db_storage" / "message"
    return msg_dir.is_dir() and any(msg_dir.glob("message_*.db"))


def _make_reader(data_root: str | None):
    from chatlog_keeper.wechat_db import WeChatDBReader

    reader = WeChatDBReader(data_root=Path(data_root) if data_root else None)
    return reader if reader.initialize() else None


class SetKeyRequest(BaseModel):
    key_hex: str
    data_root: str | None = None


class ExtractKeyRequest(BaseModel):
    data_root: str | None = None


class BindRequest(BaseModel):
    data_root: str | None = None
    chat_id: str
    display_name: str
    relationship: str = "朋友"


class UnbindRequest(BaseModel):
    conversation_id: str


class SyncRequest(BaseModel):
    data_root: str | None = None


def _msg_server_id(m) -> str:
    """幂等键：优先微信 server_id，缺失时回退内容哈希。"""
    if m.server_id:
        return m.server_id
    return "h:" + hashlib.sha256(
        f"{m.timestamp.timestamp()}|{m.sender}|{m.content}".encode()
    ).hexdigest()


# 库里引用消息原文形如 "[引用 wxid_xxx: 被引文本] ↳svrid:123 @2026-09-29 正文"
_quote_re = re.compile(r"\[引用 \S+: ([^\]]*)\] ↳svrid:\d+ @[\d-]+\s*")
_type_placeholder = {3: "[图片]", 34: "[语音]", 43: "[视频]"}


def _clean_content(m) -> str:
    """消息正文清理：表情 md5 简化、引用格式去原始数据、空内容给类型占位。"""
    text = (m.content or "").strip()
    if m.msg_type == 47 or text.startswith("[表情#"):
        return "[表情]"
    text = _quote_re.sub(r"[引用：\1] ", text)
    return text or _type_placeholder.get(m.msg_type, "")


def _is_self(account_id: str, sender: str) -> bool:
    # 与 chatlog-keeper 导出层同判法（前缀匹配）：账号目录名可带 "_5305" 之类
    # 多开后缀，消息表里的 sender 是裸 wxid，直接相等比较会把"我"全判成对方
    return bool(account_id and sender and account_id.startswith(sender))


def _insert_messages(conn, conversation_id: str, account_id: str, msgs: list) -> int:
    """INSERT OR IGNORE 幂等写入，返回新插入条数。"""
    inserted = 0
    for m in msgs:
        content = _clean_content(m)
        if not content:
            continue
        role = "me" if _is_self(account_id, m.sender) else "them"
        created_at = datetime.fromtimestamp(m.timestamp.timestamp()).isoformat()
        cur = conn.execute(
            "INSERT OR IGNORE INTO messages"
            " (conversation_id, role, text, created_at, wechat_server_id)"
            " VALUES (?, ?, ?, ?, ?)",
            (conversation_id, role, content, created_at, _msg_server_id(m)),
        )
        inserted += cur.rowcount
    return inserted


@router.get("/status")
def status(data_root: str | None = None) -> dict:
    reader = _make_reader(data_root)
    if reader is None:
        return {"key_ok": False}
    return {
        "key_ok": True,
        "account_id": reader.account_id,
        "wxid_dir": str(reader.wxid_dir) if reader.wxid_dir else None,
        "dir_valid": _is_v4_dir(reader.wxid_dir),
    }


@router.post("/set-key")
def set_key(req: SetKeyRequest) -> dict:
    from chatlog_keeper import wechat_db

    key = bytes.fromhex(req.key_hex)
    if len(key) != 32:
        raise HTTPException(422, "密钥格式错误（需要 64 位 hex / 32 字节）")
    if not wechat_db.save_cached_wechat_key(key):
        raise HTTPException(500, "密钥缓存写入失败")
    if _make_reader(req.data_root) is None:
        raise HTTPException(422, "密钥已保存，但无法用它解开微信数据库，请确认微信已在本机登录")
    return {"ok": True}


@router.post("/extract-key")
def extract_key(req: ExtractKeyRequest) -> dict:
    """跑 chatlog-keeper 的 PowerShell 调试提取（会自动重启一次微信），拿到 key 存缓存。

    仅需一次；之后 key 长期有效。微信未登录或版本不兼容时抛错给前端引导。
    """
    import chatlog_keeper
    from chatlog_keeper import wechat_db

    ps1 = Path(chatlog_keeper.__file__).parent / "scripts" / "windows_wechat_get_key.ps1"
    if not ps1.exists():
        raise HTTPException(500, "提取脚本缺失（chatlog-keeper 安装不完整）")

    data_root = Path(req.data_root) if req.data_root else wechat_db.find_weixin_data_root()
    if data_root is None:
        raise HTTPException(422, "未找到微信数据目录，请在设置中手动填写 xwechat_files 路径")
    wxid_dirs = wechat_db.find_wxid_dirs(data_root)
    if not wxid_dirs:
        raise HTTPException(422, "数据目录下没有微信账号（wxid_*）目录，请确认路径")
    dbs = [d for d in wechat_db.find_msg_databases(wxid_dirs[0]) if d.name.startswith("message_")]
    if not dbs:
        raise HTTPException(422, "未找到消息数据库（message_*.db），请确认微信已登录过")

    try:
        proc = subprocess.run(
            [
                "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", str(ps1), "-DbPath", str(dbs[0]),
            ],
            capture_output=True, text=True, timeout=620,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "提取超时：请确认微信已在本机登录（需登录态），然后重试")
    match = _master_key_re.search(proc.stdout)
    if not match:
        detail = (proc.stdout + proc.stderr).strip()[-300:] or "未知错误"
        raise HTTPException(500, f"密钥提取失败：{detail}")
    key = bytes.fromhex(match.group(1))
    if not wechat_db.save_cached_wechat_key(key):
        raise HTTPException(500, "密钥缓存写入失败")
    return {"ok": True, "account_id": wechat_db.wechat_account_id_for_database(dbs[0])}


@router.get("/conversations")
def conversations(data_root: str | None = None, limit: int = 50) -> list[dict]:
    """最近活跃的私聊列表（按消息量排序），供绑定 UI 勾选。"""
    reader = _make_reader(data_root)
    if reader is None:
        raise HTTPException(409, "还没有可用密钥，请先提取")
    directory = reader.read_conversation_directory()
    if directory is None:
        detected = reader.wxid_dir or "（未探测到任何微信目录）"
        raise HTTPException(
            422,
            f"自动探测到的目录不是有效的微信 4.x 数据目录：{detected}。"
            "请在上方「微信数据目录」填写 xwechat_files 所在路径"
            "（例如 D:\\wenjian\\xwechat_files），保存后重试。",
        )
    direct = [c for c in directory if c.get("conversation_type") == "direct"]
    direct.sort(key=lambda c: -(c.get("message_count") or 0))
    result = []
    for c in direct[:limit]:
        # label 形如 "备注：xx · 昵称：yy"，取第一个可用段做显示名
        label = re.sub(r"^(备注|昵称)：", "", c.get("label") or "").split(" · ")[0].strip()
        result.append({
            "chat_id": c["conversation_id"],
            "display_name": label or c["conversation_id"],
            "message_count": c.get("message_count") or 0,
        })
    return result


@router.post("/bind")
def bind(req: BindRequest) -> dict:
    """把微信会话绑定到（新建的）Emora 会话，并回填最近消息建立上下文。"""
    with connect() as conn:
        existing = conn.execute(
            "SELECT id FROM conversations WHERE wechat_chat_id = ?", (req.chat_id,)
        ).fetchone()
    if existing:
        return {"conversation_id": existing["id"], "already_bound": True}

    reader = _make_reader(req.data_root)
    if reader is None:
        raise HTTPException(409, "还没有可用密钥，请先提取")
    if not _is_v4_dir(reader.wxid_dir):
        # 目录无效时不允许绑定：否则建出一个永远同步不到消息的空会话
        detected = reader.wxid_dir or "（未探测到任何微信目录）"
        raise HTTPException(
            422,
            f"自动探测到的目录不是有效的微信 4.x 数据目录：{detected}。"
            "请在设置中填写 xwechat_files 所在路径后重试。",
        )

    conv = conv_store.create_conversation(req.display_name, req.relationship)
    now = time.time()
    msgs = reader.read_after(now - BACKFILL_WINDOW_S, req.chat_id) or []
    with connect() as conn:
        _insert_messages(conn, conv["id"], str(reader.account_id or ""), msgs[-BACKFILL_LIMIT:])
        conn.execute(
            "UPDATE conversations SET wechat_chat_id = ?, wechat_cursor = ?, updated_at = ?"
            " WHERE id = ?",
            (req.chat_id, now, utcnow(), conv["id"]),
        )
    return {"conversation_id": conv["id"], "already_bound": False,
            "backfilled": min(len(msgs), BACKFILL_LIMIT)}


@router.post("/unbind")
def unbind(req: UnbindRequest) -> dict:
    with connect() as conn:
        cur = conn.execute(
            "UPDATE conversations SET wechat_chat_id = NULL WHERE id = ?",
            (req.conversation_id,),
        )
    return {"ok": cur.rowcount > 0}


@router.post("/sync")
def sync(req: SyncRequest) -> dict:
    """增量同步所有已绑定会话；返回发生变化的会话及是否需要触发分析。"""
    with connect() as conn:
        bound = conn.execute(
            "SELECT id, wechat_chat_id, wechat_cursor FROM conversations"
            " WHERE wechat_chat_id IS NOT NULL"
        ).fetchall()
    if not bound:
        return {"updated": []}

    reader = _make_reader(req.data_root)
    if reader is None:
        raise HTTPException(409, "密钥不可用（微信重新登录后可能需要重新提取）")
    account_id = str(reader.account_id or "")

    updated = []
    with connect() as conn:
        for row in bound:
            msgs = reader.read_after(max(row["wechat_cursor"] - SYNC_OVERLAP_S, 0),
                                     row["wechat_chat_id"]) or []
            if not msgs:
                continue
            inserted = _insert_messages(conn, row["id"], account_id, msgs)
            if not inserted:
                continue
            last_ts = msgs[-1].timestamp.timestamp()
            conn.execute(
                "UPDATE conversations SET wechat_cursor = MAX(wechat_cursor, ?),"
                " updated_at = ? WHERE id = ?",
                (last_ts, utcnow(), row["id"]),
            )
            last_role = "me" if _is_self(account_id, msgs[-1].sender) else "them"
            updated.append({
                "conversation_id": row["id"],
                "new_count": inserted,
                "need_analysis": last_role == "them",
            })
    return {"updated": updated}
