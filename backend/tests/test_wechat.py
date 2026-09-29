"""微信直读路由测试：全部 mock chatlog-keeper，不碰真实微信库。"""
import time
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class FakeMessage:
    def __init__(self, ts: float, sender: str, content: str, server_id: str = ""):
        self.timestamp = datetime.fromtimestamp(ts)
        self.sender = sender
        self.content = content
        self.server_id = server_id


class FakeReader:
    """按 (chat_id, since_ts) 返回固定消息集，模拟 read_after。"""

    account_id = "wxid_me"
    wxid_dir = Path("D:/fake")

    def __init__(self, store=None, data_root=None, account_id=None):
        self._store = store or {}
        self.initialized = True

    def initialize(self):
        return True

    def read_after(self, since_ts, chat_name=None, until_ts=None):
        msgs = [m for m in self._store.get(chat_name, []) if m.timestamp.timestamp() > since_ts]
        return sorted(msgs, key=lambda m: m.timestamp.timestamp())


@pytest.fixture()
def reader_store():
    return {}


@pytest.fixture()
def client(tmp_path, monkeypatch, reader_store):
    monkeypatch.setenv("EMORA_DATABASE_PATH", str(tmp_path / "test.db"))
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "database_path", str(tmp_path / "test.db"))
    from app.db import init_db

    init_db()
    from app.main import app

    def make_fake_reader(data_root=None, account_id=None):
        return FakeReader(reader_store)

    monkeypatch.setattr("app.api.routes.wechat._make_reader", make_fake_reader)
    # FakeReader 的假 wxid_dir 下没有 db_storage 结构，绕过 4.x 目录有效性检查
    monkeypatch.setattr("app.api.routes.wechat._is_v4_dir", lambda wxid_dir: True)
    with TestClient(app) as c:
        yield c


def _now():
    return time.time()


def test_status_without_key(client):
    # _make_reader 被 mock 成总是成功；此处直接验证端点形状
    r = client.get("/api/wechat/status")
    assert r.status_code == 200
    assert r.json()["key_ok"] is True


def test_bind_backfills_and_is_idempotent(client, reader_store):
    now = _now()
    reader_store["wxid_a"] = [
        FakeMessage(now - 100, "wxid_a", "你吃了吗", server_id="1"),
        FakeMessage(now - 50, "wxid_me", "吃了", server_id="2"),
        FakeMessage(now - 10, "wxid_a", "吃的啥", server_id="3"),
    ]
    r1 = client.post("/api/wechat/bind", json={
        "chat_id": "wxid_a", "display_name": "小明", "relationship": "暧昧对象",
    }).json()
    assert r1["already_bound"] is False and r1["backfilled"] == 3
    cid = r1["conversation_id"]

    # 重复绑定同一 chat_id 返回同一会话，不再新建
    r2 = client.post("/api/wechat/bind", json={
        "chat_id": "wxid_a", "display_name": "小明",
    }).json()
    assert r2["already_bound"] is True and r2["conversation_id"] == cid

    msgs = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert len(msgs) == 3
    assert msgs[0]["role"] == "them" and msgs[1]["role"] == "me"
    # 消息时间保留微信原始时间（不是导入时刻）
    assert msgs[0]["created_at"].startswith(datetime.fromtimestamp(now - 100).strftime("%Y-%m-%d"))


def test_sync_incremental_dedup_and_analysis_flag(client, reader_store):
    now = _now()
    reader_store["wxid_b"] = [FakeMessage(now - 100, "wxid_b", "早", server_id="10")]
    cid = client.post("/api/wechat/bind", json={
        "chat_id": "wxid_b", "display_name": "小红",
    }).json()["conversation_id"]

    # 第一次 sync：无新消息（回填已把游标设到 bind 时刻）
    r = client.post("/api/wechat/sync", json={}).json()
    assert r["updated"] == []

    # 对方来了新消息 → need_analysis=True
    reader_store["wxid_b"].append(FakeMessage(now + 1, "wxid_b", "在吗", server_id="11"))
    r = client.post("/api/wechat/sync", json={}).json()
    assert len(r["updated"]) == 1
    u = r["updated"][0]
    assert u["conversation_id"] == cid and u["need_analysis"] is True and u["new_count"] == 1

    # 再 sync：server_id 幂等，不重复插入也不重复上报
    r = client.post("/api/wechat/sync", json={}).json()
    assert r["updated"] == []
    msgs = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert len(msgs) == 2

    # 我方发的消息 → 不触发分析
    reader_store["wxid_b"].append(FakeMessage(now + 2, "wxid_me", "在", server_id="12"))
    r = client.post("/api/wechat/sync", json={}).json()
    assert r["updated"][0]["need_analysis"] is False


def test_unbind_keeps_conversation(client, reader_store):
    now = _now()
    reader_store["wxid_c"] = [FakeMessage(now - 10, "wxid_c", "嗨", server_id="20")]
    cid = client.post("/api/wechat/bind", json={
        "chat_id": "wxid_c", "display_name": "小刚",
    }).json()["conversation_id"]

    assert client.post("/api/wechat/unbind", json={"conversation_id": cid}).json()["ok"] is True
    # 解绑后 sync 不再拉取，会话和消息保留
    reader_store["wxid_c"].append(FakeMessage(now + 1, "wxid_c", "还在吗", server_id="21"))
    assert client.post("/api/wechat/sync", json={}).json()["updated"] == []
    msgs = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert len(msgs) == 1
