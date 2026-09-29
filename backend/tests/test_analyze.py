import json

import pytest
from fastapi.testclient import TestClient
from httpx import HTTPError

from app.main import app
from app.llm import client

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
    monkeypatch.setattr(client, "call_llm", lambda *a, **k: client.AnalysisResult.model_validate(VALID_RESULT))
    resp = client_api.post("/api/analyze", json=_req())
    assert resp.status_code == 200
    assert resp.json()["emotion_analysis"]["emotion"] == "挫败"


def test_analyze_llm_error_maps_to_502(monkeypatch: pytest.MonkeyPatch):
    def boom(*a, **k):
        raise client.LLMError("模型服务返回 401")

    monkeypatch.setattr(client, "call_llm", boom)
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


def test_call_llm_parses_valid_json(monkeypatch: pytest.MonkeyPatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": json.dumps(VALID_RESULT, ensure_ascii=False)}}]}

    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResp())
    result = client.call_llm(
        client.LLMConfig(base_url="http://x/v1", api_key="k", model="m"),
        "好友",
        [{"role": "them", "text": "好烦"}],
    )
    assert result.reason == "对方需要被理解"


def test_call_llm_rejects_bad_schema(monkeypatch: pytest.MonkeyPatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": '{"unexpected": 1}'}}]}

    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: FakeResp())
    with pytest.raises(client.LLMError):
        client.call_llm(
            client.LLMConfig(base_url="http://x/v1", api_key="k", model="m"),
            "好友",
            [{"role": "them", "text": "好烦"}],
        )


def test_call_llm_wraps_network_error(monkeypatch: pytest.MonkeyPatch):
    def boom(*a, **k):
        raise HTTPError("connect failed")

    monkeypatch.setattr(client.httpx, "post", boom)
    with pytest.raises(client.LLMError):
        client.call_llm(
            client.LLMConfig(base_url="http://x/v1", api_key="k", model="m"),
            "好友",
            [{"role": "them", "text": "好烦"}],
        )
