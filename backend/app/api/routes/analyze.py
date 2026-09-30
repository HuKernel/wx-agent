from fastapi import APIRouter, HTTPException

from app.conversations import store as conv_store
from app.llm import agent, client
from app.llm.schemas import AnalysisResult, AnalyzeRequest
from app.memory import store as memory_store

router = APIRouter(prefix="/api", tags=["analyze"])


def _ensure_summaries(llm, conversation_id: str, messages: list[dict]) -> None:
    """为窗口外未被摘要覆盖的消息补生成摘要段（幂等，可断点续跑）。"""
    older = messages[: -memory_store.CONTEXT_WINDOW]
    covered = memory_store.summary_covered_to(conversation_id)
    pending = [m for m in older if m["id"] is not None and m["id"] > covered]
    for i in range(0, len(pending), memory_store.SUMMARY_SEGMENT_SIZE):
        segment = pending[i : i + memory_store.SUMMARY_SEGMENT_SIZE]
        text = client.summarize_messages(llm, segment)
        memory_store.add_summary_segment(conversation_id, segment[-1]["id"], text)


@router.post("/analyze")
def analyze(req: AnalyzeRequest) -> AnalysisResult:
    # 有 conversation_id 时以数据库为单一事实来源（消息/关系取库内最新）
    if req.conversation_id:
        conv = conv_store.get_conversation(req.conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="对话不存在")
        relationship = conv["relationship"]
        messages: list[dict] = conv["messages"]
    else:
        relationship = req.relationship
        messages = [m.model_dump() for m in req.messages]

    if not messages:
        raise HTTPException(status_code=422, detail="对话消息不能为空")

    window = memory_store.CONTEXT_WINDOW
    if req.conversation_id and len(messages) > window:
        try:
            _ensure_summaries(req.llm, req.conversation_id, messages)
        except client.LLMError:
            pass  # 摘要失败降级：本次仅分析窗口内消息，下次分析继续补

    window_messages = messages[-window:]

    memory_sections = (
        memory_store.build_memory_sections(req.conversation_id) if req.conversation_id else ""
    )

    try:
        result = agent.run_agent(req.llm, relationship, window_messages, memory_sections,
                                 conversation_id=req.conversation_id)
    except client.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if req.conversation_id:
        if result.memory_updates:
            memory_store.save_memory_updates(req.conversation_id, result.memory_updates)
        if not conv_store.save_analysis(req.conversation_id, result):
            raise HTTPException(status_code=404, detail="对话不存在")
    return result
