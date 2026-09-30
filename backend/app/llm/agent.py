"""LangGraph 智能体版对话分析：explore（多工具 ReAct）→ analyze（v6 结构化输出）。

图结构（StateGraph）：
    load_context（确定性）→ explore（LLM 自主调用工具补充上下文，≤4 轮）
    → analyze（v6 提示词 + 全部上下文，JSON 结构化输出 AnalysisResult）

explore 可用工具（LangChain @tool）：
    fetch_earlier_messages：拉窗口之前的更早消息（需 conversation_id）
    search_memory：关键词检索该会话的记忆（关系记忆+摘要段）
    get_contact_profile：对方完整关系画像

explore 失败自动降级：跳过探索结果直接进 analyze（等价于旧单次调用行为），
分析主链路不因探索而挂。
"""

import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.db import connect
from app.llm.client import LLMError
from app.llm.prompts import SYSTEM_PROMPT, build_user_content
from app.llm.schemas import AnalysisResult, LLMConfig

MAX_EXPLORE_ROUNDS = 4

EXPLORE_SYSTEM = """你是情感分析任务的「上下文侦察员」。主分析师即将分析一段对话并给出回复建议，你负责在分析前判断：现有材料够不够，不够就调用工具补齐。

可用工具：
- fetch_earlier_messages(count)：对话更早的历史消息（当最近消息引用了之前的事而你不知道时用）
- search_memory(keyword)：检索关于这位联系人的长期记忆（关系记忆/此前对话摘要）
- get_contact_profile()：与该联系人的完整关系画像

判断原则：
- 常规闲聊、上下文自足 → 不要调用任何工具，直接回复 CONTEXT_READY
- 对话提到旧事/旧约/人物而你缺背景 → fetch_earlier_messages 或 search_memory
- 需要关系全局判断（阶段、模式）→ get_contact_profile
- 最多补充一轮材料就要收手。回复 CONTEXT_READY 时，用一段不超过 80 字的「侦察摘要」说明：这段对话的背景要点、对方最近的状态，以及你是否补到了新信息（工具返回的原文要点）。"""


class AgentState(TypedDict, total=False):
    relationship: str
    window_messages: list[dict]
    memory_sections: str
    conversation_id: str | None
    explore_notes: str
    llm_config: dict
    result: AnalysisResult


def _make_tools(conversation_id: str | None, window_len: int):
    """工具闭包：窗口长度决定 fetch_earlier 的偏移；无 conversation_id 时降级提示。"""

    @tool
    def fetch_earlier_messages(count: int = 20) -> str:
        """获取本次分析窗口之前的更早历史消息（参数 count 为条数，默认 20，最大 60）。"""
        if not conversation_id:
            return "当前为无会话的一次性分析，无法获取更早消息。"
        count = max(1, min(int(count), 60))
        with connect() as conn:
            rows = conn.execute(
                "SELECT role, text, created_at FROM messages WHERE conversation_id = ?"
                " ORDER BY id DESC LIMIT ? OFFSET ?",
                (conversation_id, count, window_len),
            ).fetchall()
        if not rows:
            return "没有更早的消息了。"
        lines = [f"{('对方' if r['role'] == 'them' else '我')}：{r['text']}" for r in reversed(rows)]
        return "\n".join(lines)

    @tool
    def search_memory(keyword: str) -> str:
        """按关键词检索该联系人的长期记忆（关系记忆与此前对话摘要中的相关内容）。"""
        if not conversation_id:
            return "当前无会话上下文，没有可检索的记忆。"
        with connect() as conn:
            rows = conn.execute(
                "SELECT kind, content FROM memories WHERE conversation_id = ? AND content LIKE ?"
                " ORDER BY updated_at DESC LIMIT 8",
                (conversation_id, f"%{keyword}%"),
            ).fetchall()
        if not rows:
            return f"记忆中没有与「{keyword}」相关的内容。"
        return "\n".join(f"[{r['kind']}] {r['content']}" for r in rows)

    @tool
    def get_contact_profile() -> str:
        """获取与该联系人的完整关系画像（关系阶段、相处模式、近期重要事件）。"""
        if not conversation_id:
            return "当前无会话上下文，没有关系画像。"
        with connect() as conn:
            row = conn.execute(
                "SELECT content FROM memories WHERE kind = 'relationship' AND conversation_id = ?",
                (conversation_id,),
            ).fetchone()
        return row["content"] if row else "还没有这位联系人的关系画像。"

    return [fetch_earlier_messages, search_memory, get_contact_profile]


def load_context(state: AgentState) -> dict:
    return {"explore_notes": ""}


def _explore(llm_config: dict, state: AgentState) -> str:
    """工具循环：模型自主决定调工具，直到给出 CONTEXT_READY 或达到轮数上限。"""
    chat = ChatOpenAI(
        base_url=llm_config["base_url"], api_key=llm_config["api_key"],
        model=llm_config["model"], temperature=0.3, timeout=60,
    )
    tools = {t.name: t for t in _make_tools(state["conversation_id"], len(state["window_messages"]))}
    chat = chat.bind_tools(list(tools.values()))
    msgs = [
        SystemMessage(content=EXPLORE_SYSTEM),
        HumanMessage(content="对话最近消息（窗口）：\n" + "\n".join(
            f"{('对方' if m['role'] == 'them' else '我')}：{m['text']}" for m in state["window_messages"][-10:]
        )),
    ]
    for _ in range(MAX_EXPLORE_ROUNDS):
        ai: AIMessage = chat.invoke(msgs)
        msgs.append(ai)
        if not ai.tool_calls:
            return ai.content
        for call in ai.tool_calls:
            result = tools[call["name"]].invoke(call["args"])
            msgs.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
    return (msgs[-1].content if isinstance(msgs[-1], AIMessage) else "") or "CONTEXT_READY"


def explore(state: AgentState) -> dict:
    try:
        notes = _explore(state["llm_config"], state)
        ready = "CONTEXT_READY" in notes or not notes
        summary = notes.replace("CONTEXT_READY", "").strip()
        return {"explore_notes": summary if ready else notes}
    except Exception:
        # 探索是增强项：任何失败都降级为无补充（analyze 仍可完整执行）
        return {"explore_notes": ""}


def analyze(state: AgentState) -> dict:
    system = SYSTEM_PROMPT
    if state.get("memory_sections"):
        system += "\n\n## 已知背景（长期记忆，分析时参考，回复风格尽量贴合画像）\n" + state["memory_sections"]
    user = build_user_content(state["relationship"], state["window_messages"])
    if state.get("explore_notes"):
        user += "\n\n## 侦察员补充的背景（分析时可参考）\n" + state["explore_notes"]

    from openai import OpenAI

    cfg = state["llm_config"]
    client = OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"])
    try:
        resp = client.chat.completions.create(
            model=cfg["model"], temperature=0.9, response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        content = resp.choices[0].message.content
    except Exception as e:
        raise LLMError(f"模型调用失败：{e}") from e
    try:
        return {"result": AnalysisResult.model_validate(json.loads(content))}
    except (ValueError, json.JSONDecodeError) as e:
        raise LLMError(f"模型输出不符合要求格式：{e}") from e


def run_agent(
    llm: LLMConfig,
    relationship: str,
    messages: list[dict],
    memory_sections: str = "",
    conversation_id: str | None = None,
) -> AnalysisResult:
    """构建并执行 LangGraph 分析图；对路由层保持与旧 call_llm 相同的契约。"""
    builder = StateGraph(AgentState)
    builder.add_node("load_context", load_context)
    builder.add_node("explore", explore)
    builder.add_node("analyze", analyze)
    builder.add_edge(START, "load_context")
    builder.add_edge("load_context", "explore")
    builder.add_edge("explore", "analyze")
    builder.add_edge("analyze", END)

    graph = builder.compile()
    final = graph.invoke({
        "relationship": relationship,
        "window_messages": messages,
        "memory_sections": memory_sections,
        "conversation_id": conversation_id,
        "llm_config": {"base_url": llm.base_url, "api_key": llm.api_key, "model": llm.model},
    })
    return final["result"]
