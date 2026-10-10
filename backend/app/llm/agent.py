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
- search_knowledge(query)：检索沟通表达知识库（61 本热门书的书摘）——需要具体话术方法或理论支撑时用，query 用场景关键词

判断原则：
- **先核对场景时间线**：结合「已知背景」对照最近消息——他们现在在哪、在干什么、为什么会聊这个？如果窗口本身说不清缘由（比如晚上在路上、突然情绪变化、提到"上次/那个事"），必须 fetch_earlier_messages 把中间那段拉出来看，别让主分析师猜错场景；拉回的关键原文要摘录进简报（分析师只看得到窗口 20 条原文，你摘录的原文等于替他动态扩窗）
- 常规闲聊、场景清楚且上下文自足 → 不要调用任何工具，直接回复 CONTEXT_READY
- 对话提到旧事/旧约/人物而你缺背景 → fetch_earlier_messages 或 search_memory
- 需要关系全局判断（阶段、模式）→ get_contact_profile
- 涉及沟通难点（怎么开口/拒绝/安慰/化解尴尬/提意见）→ search_knowledge 查话术方法，把书摘要点带进侦察摘要供主分析师参考
- **关系冲突/摊牌场景（表白被拒、翻脸、以"删了/算了"要挟、吵架冷战）→ 必须 search_knowledge**（拒绝的艺术、给台阶、化解冲突是书单强项；真实事故：摊牌时刻回复还在问吃饭，侦察员没检索）
- **方法型场景也值得查**——夸人、道歉、说服、邀约、破冰、收尾话题、暖场，凡是"怎么回才好"有章法的场面，查一次给主分析师当弹药；关键词描述场景（如"夸人不空洞""邀约 给台阶"），不中可换词再试一次
- 最多补充两轮材料就要收手。回复 CONTEXT_READY 时给三段式「侦察简报」：
  ①「意图与场景」（≤80 字）：**意图只锚定对方最新一条（或最新一组同语气消息）**——对方在玩梗/调侃/互怼时，意图就是玩闹本身（接梗、被逗、斗嘴），**不是此前未完成的正事**；未落地的正事只记一句背景，不得上升为主线。结合前文给一句证据 + 何时何地正在发生什么。**段落末尾必须单独一行输出机器可读标签：`意图标签：<纯玩闹|求安慰|试探|邀约|拉扯|宣泄|求认可|催答复|危机>`（分析师程序会按它注入本轮硬约束，写错标签等于误导下游）**
  ②「盲点提醒」：用户可能没注意到的东西——对方一直在等的那句明确答复、上次没接住的话茬、这句话里藏的坑或情绪转折点（没有就写"无"）。盲点只提醒，不指令
  ③「关键前文摘录 / 方法弹药」：若 fetch_earlier_messages 拉回的更早对话里有理解本轮的关键原文（约定、冲突、重要转折），**摘录原文要点（≤300 字）**别压缩成概括——分析师需要一手细节；书摘方法骨架要点（≤150 字，注明出处书名）也放这段。窗口 20 条够用时此段只留方法弹药或写"无"。"""


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

    @tool
    def search_knowledge(query: str) -> str:
        """检索沟通表达知识库（《如何提高沟通，表达能力》书单 61 本的书摘条目）。

        当分析需要具体话术方法或理论支撑时用，如：怎么提意见不得罪人、如何幽默
        化解尴尬、拒绝的艺术、安慰人的正确姿势。query 用场景关键词（如"幽默
        化解尴尬""提意见 拒绝"），可换关键词多试一两次。
        """
        from app.knowledge import store

        return store.format_hits(store.search(query, k=3))

    return [fetch_earlier_messages, search_memory, get_contact_profile, search_knowledge]


def load_context(state: AgentState) -> dict:
    return {"explore_notes": ""}


def _explore(llm_config: dict, state: AgentState) -> str:
    """工具循环：模型自主决定调工具，直到给出 CONTEXT_READY 或达到轮数上限。"""
    chat = ChatOpenAI(
        base_url=llm_config["base_url"], api_key=llm_config["api_key"],
        model=llm_config["model"], temperature=0.3, timeout=60,
    )
    tools = {t.name: t for t in _make_tools(state.get("conversation_id"), len(state["window_messages"]))}
    chat = chat.bind_tools(list(tools.values()))
    # 记忆（画像+摘要）必须喂给侦察员：否则场景核对无从做起——真实事故：
    # 打台球邀约在窗口外，探索没拿记忆没拉历史，把"打完球回家"误判成"下班"
    system = EXPLORE_SYSTEM
    if state.get("memory_sections"):
        system += "\n\n## 已知背景（长期记忆）\n" + state["memory_sections"]
    from datetime import datetime as _dt

    now = _dt.now()
    now_label = now.strftime("%Y-%m-%d %H:%M")

    def _line(m: dict) -> str:
        speaker = "对方" if m["role"] == "them" else "我"
        ts = m.get("created_at")
        try:
            t = _dt.fromisoformat(ts) if ts else None
        except ValueError:
            t = None
        if not t:
            label = "?"
        elif t.date() == now.date():
            label = t.strftime("%H:%M")
        elif t.year == now.year:
            label = t.strftime("%m-%d %H:%M")
        else:
            label = t.strftime("%Y-%m-%d %H:%M")
        return f"{speaker}（{label}）：{m['text']}"

    msgs = [
        SystemMessage(content=system),
        HumanMessage(content=f"当前时间：{now_label}\n对话最近消息（窗口，含时间戳）：\n"
                     + "\n".join(_line(m) for m in state["window_messages"][-20:])),
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


def _repair_json(content: str) -> str:
    """修模型 JSON 里常见的未转义引号：字符串值内的裸 " 前补 \\。

    判定"结构引号"：闭合侧要求下一个非空白字符是 } ] : , 或行尾；
    开启侧要求前一个非空白字符是 { [ : , 。不满足即视为内容引号。
    修不好原样返回，由上层报错（错误里带原始输出便于诊断）。
    """
    out = []
    in_str = False
    i = 0
    n = len(content)
    while i < n:
        ch = content[i]
        if ch == "\\" and in_str and i + 1 < n:
            out.append(ch)
            out.append(content[i + 1])
            i += 2
            continue
        if ch == '"':
            if not in_str:
                prev = next((c for c in reversed(out) if not c.isspace()), "")
                if prev in "{[:" or prev == ",":
                    in_str = True
                else:
                    out.append("\\")  # 不该出现引号的位置：转义兜底
                    out.append(ch)
                    i += 1
                    continue
            else:
                nxt = next((c for c in content[i + 1:] if not c.isspace()), "")
                if nxt in "}]:" or nxt == "," or not nxt:
                    in_str = False
                else:
                    out.append("\\")  # 字符串中间的裸引号 → 转义
                    out.append(ch)
                    i += 1
                    continue
        out.append(ch)
        i += 1
    return "".join(out)


_INTENT_LABEL_RE = None  # 延迟编译（re 在模块顶部导入可能未就绪）


def _intent_hard_rules(notes: str) -> str:
    """按侦察员的意图标签注入本轮硬约束（动态指令强于静态提示词）。

    真实事故复盘：玩闹语境下静态提示词三层加码都拗不过模型"推进正事"的
    执念（四条回复全挂待办）；但侦察员的意图判断三轮全对——把它的判断
    变成程序可读标签，按标签动态注入位置约束，压住分析师的偏好。
    """
    import re

    m = re.search(r"意图标签[:：]\s*(\S+)", notes or "")
    label = m.group(1) if m else ""
    if label == "纯玩闹":
        return (
            "\n\n## 本轮硬约束（来自侦察员意图标签：纯玩闹）\n"
            "warm/casual/flirty 三条回复**零正事**——待办、日子、钱、约定、安排、"
            "八字类词一个都不许出现，把梗接活、斗回去；只允许 deep 在接完梗后"
            "轻轻挂一句正事就撤。四条全挂正事 = 直接违规，重写。"
        )
    if label == "危机":
        return (
            "\n\n## 本轮硬约束（来自侦察员意图标签：危机）\n"
            "warm/deep 主推把关系说清楚+留台阶；warm/casual 禁一切玩笑和岔话梗；"
            "flirty 按兵不动（expected_reaction 写明）。"
        )
    return ""


def analyze(state: AgentState) -> dict:
    system = SYSTEM_PROMPT
    if state.get("memory_sections"):
        system += "\n\n## 已知背景（长期记忆，分析时参考，回复风格尽量贴合画像）\n" + state["memory_sections"]
    user = build_user_content(state["relationship"], state["window_messages"])
    if state.get("explore_notes"):
        user += "\n\n## 侦察员补充的背景（分析时可参考）\n" + state["explore_notes"]
    user += _intent_hard_rules(state.get("explore_notes") or "")

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
    except (ValueError, json.JSONDecodeError):
        pass
    # json_object 模式下模型仍会偶发在字符串值里写裸引号（中文语境常见，
    # 如 risk_warning 里引用错误示范原句）——先修复再重试一次，仍失败才报错
    try:
        return {"result": AnalysisResult.model_validate(json.loads(_repair_json(content)))}
    except (ValueError, json.JSONDecodeError) as e:
        raise LLMError(f"模型输出不符合要求格式：{e}\n原始输出前 200 字：{content[:200]}") from e


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
