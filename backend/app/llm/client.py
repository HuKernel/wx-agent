import json

import httpx

from .prompts import SUMMARY_PROMPT
from .schemas import LLMConfig


class LLMError(RuntimeError):
    """LLM 调用或输出解析失败，消息可直接透给前端。"""


def _chat(llm: LLMConfig, messages: list[dict], json_output: bool = True, temperature: float = 0.9) -> str:
    body: dict = {"model": llm.model, "messages": messages, "temperature": temperature}
    if json_output:
        body["response_format"] = {"type": "json_object"}
    url = llm.base_url.rstrip("/") + "/chat/completions"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {llm.api_key}"},
            json=body,
            timeout=60,
        )
    except httpx.HTTPError as e:
        raise LLMError(f"无法连接模型服务：{e}") from e
    if resp.status_code != 200:
        raise LLMError(f"模型服务返回 {resp.status_code}：{resp.text[:200]}")
    try:
        return resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise LLMError(f"模型响应格式异常：{e}") from e


def summarize_messages(llm: LLMConfig, messages: list[dict]) -> str:
    """把一段消息压缩为摘要文本（纯文本输出）。消息带时间戳，摘要才有时间线。"""
    from datetime import datetime

    def _line(m: dict) -> str:
        speaker = "对方" if m["role"] == "them" else "我"
        try:
            t = datetime.fromisoformat(m.get("created_at") or "")
            return f"{speaker}（{t.strftime('%m-%d %H:%M')}）：{m['text']}"
        except ValueError:
            return f"{speaker}：{m['text']}"

    lines = ["对话消息："] + [_line(m) for m in messages]
    messages_payload = [
        {"role": "system", "content": SUMMARY_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    # 摘要要稳定忠实，用低温度
    text = _chat(llm, messages_payload, json_output=False, temperature=0.3)
    if not text or not text.strip():
        raise LLMError("模型返回了空摘要")
    return text.strip()
