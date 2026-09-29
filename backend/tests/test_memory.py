import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db import init_db
from app.llm import client
from app.llm.schemas import AnalysisResult
from app.main import app
from app.memory import store as memory_store

VALID_RESULT = {
    "emotion_analysis": {"emotion": "挫败", "intensity": "高", "hidden_need": "情绪认同"},
    "communication_strategy": "先承接情绪",
    "risk_warning": "避免直接给建议",
    "reply_options": [
        {"style": "warm", "reply": "a"},
        {"style": "casual", "reply": "b"},
        {"style": "deep", "reply": "c"},
    ],
    "reason": "对方需要被理解",
}


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "test.db"))
    init_db()
    yield


api = TestClient(app)


def _llm_cfg() -> dict:
    return {"base_url": "http://x/v1", "api_key": "sk-test", "model": "test"}


def _conversation(name: str = "小林") -> str:
    resp = api.post("/api/conversations", json={"contact_name": name, "relationship": "好友"})
    return resp.json()["id"]


def _add(cid: str, text: str, role: str = "them") -> None:
    api.post(f"/api/conversations/{cid}/messages", json={"role": role, "text": text})


def _analyze(cid: str) -> dict:
    resp = api.post("/api/analyze", json={"llm": _llm_cfg(), "conversation_id": cid})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _result_with(updates: dict) -> AnalysisResult:
    return AnalysisResult.model_validate({**VALID_RESULT, "memory_updates": updates})


def test_analyze_writes_profiles(monkeypatch: pytest.MonkeyPatch):
    captured: dict = {}

    def fake(llm, relationship, messages, memory_sections=""):
        captured["memory"] = memory_sections
        return _result_with(
            {"style_profile": "语气偏温柔，爱用短句", "relationship_profile": "近期工作压力大"}
        )

    monkeypatch.setattr(client, "call_llm", fake)

    cid = _conversation()
    _add(cid, "好烦啊")
    _analyze(cid)

    memories = {m["kind"]: m for m in api.get("/api/memories").json()}
    assert memories["style"]["content"] == "语气偏温柔，爱用短句"
    assert memories["relationship"]["content"] == "近期工作压力大"
    assert captured["memory"] == ""  # 首次分析无记忆注入


def test_memory_injected_and_isolated(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        client,
        "call_llm",
        lambda *a, **k: _result_with(
            {"style_profile": "风格A", "relationship_profile": "小林的工作烦恼"}
        ),
    )
    cid_a = _conversation("小林")
    _add(cid_a, "好烦啊")
    _analyze(cid_a)

    monkeypatch.setattr(client, "call_llm", lambda *a, **k: AnalysisResult.model_validate(VALID_RESULT))
    cid_b = _conversation("陈姐")
    _add(cid_b, "会议几点")
    _analyze(cid_b)

    sections_a = memory_store.build_memory_sections(cid_a)
    sections_b = memory_store.build_memory_sections(cid_b)

    assert "小林的工作烦恼" in sections_a
    assert "小林的工作烦恼" not in sections_b  # 会话隔离：A 的关系记忆不进 B
    assert "风格A" in sections_a and "风格A" in sections_b  # 全局风格两边可见


def test_summary_generated_for_long_conversation(monkeypatch: pytest.MonkeyPatch):
    captured: dict = {}

    def fake(llm, relationship, messages, memory_sections=""):
        captured["n"] = len(messages)
        captured["first"] = messages[0]["text"]
        return AnalysisResult.model_validate(VALID_RESULT)

    monkeypatch.setattr(client, "call_llm", fake)
    monkeypatch.setattr(client, "summarize_messages", lambda llm, msgs: f"摘要{len(msgs)}条")

    cid = _conversation()
    for i in range(25):
        _add(cid, f"消息{i}")
    _analyze(cid)

    summaries = [m for m in api.get("/api/memories").json() if m["kind"] == "summary"]
    assert len(summaries) == 1
    assert summaries[0]["content"] == "摘要5条"  # 窗口外 5 条
    assert captured["n"] == memory_store.CONTEXT_WINDOW  # LLM 只收窗口内消息
    assert captured["first"] == "消息5"

    # 二次分析：摘要已覆盖不重复生成；摘要段注入 system prompt
    monkeypatch.setattr(
        client, "summarize_messages", lambda *a, **k: pytest.fail("不应重复摘要")
    )

    def fake2(llm, relationship, messages, memory_sections=""):
        captured["memory"] = memory_sections
        return AnalysisResult.model_validate(VALID_RESULT)

    monkeypatch.setattr(client, "call_llm", fake2)
    _analyze(cid)
    assert "摘要5条" in captured["memory"]


def test_summary_failure_degrades(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        client,
        "summarize_messages",
        lambda *a, **k: (_ for _ in ()).throw(client.LLMError("摘要服务挂了")),
    )
    monkeypatch.setattr(client, "call_llm", lambda *a, **k: AnalysisResult.model_validate(VALID_RESULT))

    cid = _conversation()
    for i in range(25):
        _add(cid, f"消息{i}")
    resp = api.post("/api/analyze", json={"llm": _llm_cfg(), "conversation_id": cid})
    assert resp.status_code == 200  # 摘要失败不阻塞分析


def test_forget_removes_from_context(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        client, "call_llm", lambda *a, **k: _result_with({"style_profile": "旧风格"})
    )
    cid = _conversation()
    _add(cid, "hi")
    _analyze(cid)

    style = next(m for m in api.get("/api/memories").json() if m["kind"] == "style")
    assert api.delete(f"/api/memories/{style['id']}").status_code == 204

    assert "旧风格" not in memory_store.build_memory_sections(cid)
    assert api.delete(f"/api/memories/{style['id']}").status_code == 404


def test_no_memory_updates_no_write(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(client, "call_llm", lambda *a, **k: AnalysisResult.model_validate(VALID_RESULT))
    cid = _conversation()
    _add(cid, "hi")
    _analyze(cid)
    assert api.get("/api/memories").json() == []
