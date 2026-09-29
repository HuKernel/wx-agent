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
    """无 conversation_id 时才需要 relationship / messages"""
    relationship: str = ""
    messages: list[ChatMsg] = []
    conversation_id: str | None = None


class EmotionAnalysis(BaseModel):
    emotion: str
    intensity: str
    hidden_need: str


class ReplyOption(BaseModel):
    style: str = Field(pattern="^(warm|casual|deep)$")
    reply: str


class MemoryUpdates(BaseModel):
    style_profile: str | None = None
    relationship_profile: str | None = None


class AnalysisResult(BaseModel):
    """对齐 /docs/AI_PROMPT.md §6 与前端 desktop types/analysis.ts。"""

    emotion_analysis: EmotionAnalysis
    communication_strategy: str
    risk_warning: str
    reply_options: list[ReplyOption]
    reason: str
    memory_updates: MemoryUpdates | None = None
