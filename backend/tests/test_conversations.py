from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db import init_db
from app.llm import client
from app.main import app


@pytest.fixture(autouse=True)
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    init_db()
    yield


api = TestClient(app)


def _create(name: str = "小林", rel: str = "好友") -> str:
    resp = api.post("/api/conversations", json={"contact_name": name, "relationship": rel})
    assert resp.status_code == 201
    return resp.json()["id"]


def _analyze_req(cid: str) -> dict:
    return {
        "llm": {"base_url": "http://x/v1", "api_key": "sk-test", "model": "test"},
        "relationship": "好友",
        "messages": [{"role": "them", "text": "好烦啊"}],
        "conversation_id": cid,
    }


def test_create_and_list():
    cid = _create()
    resp = api.get("/api/conversations")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["id"] == cid
    assert items[0]["contact_name"] == "小林"
    assert items[0]["last_text"] is None


def test_detail_404():
    assert api.get("/api/conversations/nope").status_code == 404


def test_add_message_and_detail():
    cid = _create()
    resp = api.post(f"/api/conversations/{cid}/messages", json={"role": "them", "text": "好烦啊"})
    assert resp.status_code == 201
    mid = resp.json()["id"]

    detail = api.get(f"/api/conversations/{cid}").json()
    assert len(detail["messages"]) == 1
    assert detail["messages"][0]["text"] == "好烦啊"

    assert api.delete(f"/api/conversations/{cid}/messages/{mid}").status_code == 204
    assert len(api.get(f"/api/conversations/{cid}").json()["messages"]) == 0


def test_add_message_to_missing_conversation():
    resp = api.post(
        "/api/conversations/nope/messages", json={"role": "them", "text": "x"}
    )
    assert resp.status_code == 404


def test_analyze_persists_latest(monkeypatch: pytest.MonkeyPatch):
    from tests.test_analyze import VALID_RESULT

    monkeypatch.setattr(
        client, "call_llm", lambda *a, **k: client.AnalysisResult.model_validate(VALID_RESULT)
    )
    cid = _create()
    api.post(f"/api/conversations/{cid}/messages", json={"role": "them", "text": "好烦啊"})
    resp = api.post("/api/analyze", json=_analyze_req(cid))
    assert resp.status_code == 200

    detail = api.get(f"/api/conversations/{cid}").json()
    assert detail["latest_analysis"]["reason"] == "对方需要被理解"


def test_delete_conversation():
    cid = _create()
    assert api.delete(f"/api/conversations/{cid}").status_code == 204
    assert api.get("/api/conversations").json() == []
    assert api.delete(f"/api/conversations/{cid}").status_code == 404


def test_create_validation():
    assert api.post(
        "/api/conversations", json={"contact_name": "", "relationship": "x"}
    ).status_code == 422
    # extra 字段被忽略（pydantic 默认），正常创建
    assert api.post(
        "/api/conversations", json={"contact_name": "a", "relationship": "r", "extra": 1}
    ).status_code == 201
