"""_repair_json：模型输出裸引号修复（真实故障：risk_warning 引用错误示范原句带未转义引号）。"""
import json

from app.llm.agent import _repair_json


def test_valid_json_untouched():
    s = '{"a": "b", "c": ["d"]}'
    assert _repair_json(s) == s


def test_bare_quote_inside_value():
    # 第 5 行典型故障：值内引用原话带裸引号
    broken = '{"risk_warning": "千万别说"多喝热水"，那是敷衍"}'
    fixed = _repair_json(broken)
    assert json.loads(fixed)["risk_warning"] == '千万别说"多喝热水"，那是敷衍'


def test_multiline_reply_with_quotes():
    broken = '''{
  "emotion_analysis": {"emotion": "委屈", "intensity": "6/10", "hidden_need": "「被当回事」"},
  "communication_strategy": "先接情绪",
  "risk_warning": "别说"你想多了"，她会更委屈",
  "reason": "要的是重视"
}'''
    d = json.loads(_repair_json(broken))
    assert d["risk_warning"] == '别说"你想多了"，她会更委屈'
    assert d["emotion_analysis"]["hidden_need"] == "「被当回事」"


def test_escaped_quotes_preserved():
    s = '{"a": "already \\"escaped\\" ok"}'
    assert json.loads(_repair_json(s))["a"] == 'already "escaped" ok'
