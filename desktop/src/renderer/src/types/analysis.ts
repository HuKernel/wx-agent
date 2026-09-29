// 类型对齐 /docs/AI_PROMPT.md §6 的 JSON 输出 schema，Phase 3 后端接入时直接复用。

export interface EmotionAnalysis {
  emotion: string
  intensity: string
  hidden_need: string
}

export type ReplyStyle = 'warm' | 'casual' | 'deep'

export interface ReplyOption {
  style: ReplyStyle
  reply: string
}

export interface AnalysisResult {
  emotion_analysis: EmotionAnalysis
  communication_strategy: string
  risk_warning: string
  reply_options: ReplyOption[]
  reason: string
}

export interface ChatMessage {
  id: string
  role: 'them' | 'me'
  text: string
  time: string
}

export interface Conversation {
  id: string
  contactName: string
  relationship: string
  messages: ChatMessage[]
  analysis?: AnalysisResult
}

export const replyStyleLabel: Record<ReplyStyle, string> = {
  warm: '温暖',
  casual: '随意',
  deep: '深入'
}
