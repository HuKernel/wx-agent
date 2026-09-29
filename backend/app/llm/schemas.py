from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """用户在桌面端配置的模型信息，随请求传入（后端无状态，不落盘）。"""

    base_url: str = Field(examples=["https://api.openai.com/v1"])
    api_key: str
    model: str


class ChatMsg(BaseModel):
    role: str = Field(pattern="^(them|me)$")
    text: str


class AnalyzeRequest(BaseModel):
    llm: LLMConfig
    relationship: str
    messages: list[ChatMsg]
    """提供时分析结果会持久化到该对话"""
    conversation_id: str | None = None


class EmotionAnalysis(BaseModel):
    emotion: str
    intensity: str
    hidden_need: str


class ReplyOption(BaseModel):
    style: str = Field(pattern="^(warm|casual|deep)$")
    reply: str


class AnalysisResult(BaseModel):
    """对齐 /docs/AI_PROMPT.md §6 与前端 desktop types/analysis.ts。"""

    emotion_analysis: EmotionAnalysis
    communication_strategy: str
    risk_warning: str
    reply_options: list[ReplyOption]
    reason: str
