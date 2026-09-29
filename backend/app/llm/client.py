import json

import httpx

from .prompts import SYSTEM_PROMPT, build_user_content
from .schemas import AnalysisResult, LLMConfig


class LLMError(RuntimeError):
    """LLM 调用或输出解析失败，消息可直接透给前端。"""


def call_llm(llm: LLMConfig, relationship: str, messages: list[dict]) -> AnalysisResult:
    """调用 OpenAI 兼容的 chat completions 接口并校验 JSON 输出。"""
    body = {
        "model": llm.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_content(relationship, messages)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
    }
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
        content = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
        return AnalysisResult.model_validate(data)
    except (KeyError, IndexError, ValueError) as e:
        raise LLMError(f"模型输出不符合要求格式：{e}") from e
