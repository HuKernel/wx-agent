import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.llm import agent, client

client_api = TestClient(app)

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


def _req() -> dict:
    return {
        "llm": {"base_url": "http://x/v1", "api_key": "sk-test", "model": "test"},
        "relationship": "好友",
        "messages": [{"role": "them", "text": "好烦啊"}, {"role": "me", "text": "怎么了"}],
    }


def test_analyze_ok(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(agent, "run_agent", lambda *a, **k: agent.AnalysisResult.model_validate(VALID_RESULT))
    resp = client_api.post("/api/analyze", json=_req())
    assert resp.status_code == 200
    assert resp.json()["emotion_analysis"]["emotion"] == "挫败"


def test_analyze_llm_error_maps_to_502(monkeypatch: pytest.MonkeyPatch):
    def boom(*a, **k):
        raise client.LLMError("模型服务返回 401")

    monkeypatch.setattr(agent, "run_agent", boom)
    resp = client_api.post("/api/analyze", json=_req())
    assert resp.status_code == 502
    assert "401" in resp.json()["detail"]


def test_analyze_empty_messages_rejected():
    body = _req()
    body["messages"] = []
    resp = client_api.post("/api/analyze", json=body)
    assert resp.status_code == 422


def test_analyze_invalid_role_rejected():
    body = _req()
    body["messages"] = [{"role": "other", "text": "x"}]
    resp = client_api.post("/api/analyze", json=body)
    assert resp.status_code == 422


def test_analyze_node_parses_valid_json(monkeypatch: pytest.MonkeyPatch):
    """analyze 节点：JSON 输出 → AnalysisResult（复刻旧 call_llm 契约）。"""
    class FakeMsg:
        class content:  # noqa: N805
            pass

        def __init__(self):
            self.message = type("m", (), {"content": json.dumps(VALID_RESULT, ensure_ascii=False)})()

    class FakeChoices(list):
        def __init__(self):
            super().__init__([FakeMsg()])

    class FakeResp:
        choices = FakeChoices()

    import app.llm.agent as ag

    monkeypatch.setattr("openai.OpenAI", lambda **k: type("c", (), {
        "chat": type("s", (), {"completions": type("p", (), {"create": staticmethod(lambda **k: FakeResp())})})
    })())
    state = {
        "relationship": "好友", "window_messages": [{"role": "them", "text": "好烦"}],
        "memory_sections": "", "explore_notes": "",
        "llm_config": {"base_url": "x", "api_key": "k", "model": "m"},
    }
    out = ag.analyze(state)
    assert out["result"].reason == "对方需要被理解"


def test_explore_degrades_on_failure(monkeypatch: pytest.MonkeyPatch):
    """explore 节点任何异常都降级为空补充，不阻塞主分析。"""
    import app.llm.agent as ag

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(ag, "_explore", boom)
    state = {"llm_config": {}, "conversation_id": None, "window_messages": []}
    assert ag.explore(state) == {"explore_notes": ""}
