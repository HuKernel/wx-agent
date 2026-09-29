from fastapi import APIRouter, HTTPException

from app.llm import client
from app.llm.schemas import AnalysisResult, AnalyzeRequest

router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/analyze")
def analyze(req: AnalyzeRequest) -> AnalysisResult:
    if not req.messages:
        raise HTTPException(status_code=422, detail="对话消息不能为空")
    try:
        return client.call_llm(req.llm, req.relationship, [m.model_dump() for m in req.messages])
    except client.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
