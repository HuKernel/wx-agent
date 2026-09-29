// 类型对齐 /docs/AI_PROMPT.md §6 的 JSON 输出 schema，Phase 3 后端接入时直接复用。

export interface EmotionAnalysis {
  emotion: string
  intensity: string
  hidden_need: string
}

export type ReplyStyle = 'warm' | 'casual' | 'deep' | 'flirty'

export interface ReplyOption {
  style: ReplyStyle
  reply: string
  /** 预判对方收到后的反应（可能为空，旧数据兼容） */
  expected_reaction?: string
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
  deep: '深入',
  flirty: '撩'
}

// ---- 后端 API 数据结构（snake_case 与后端一致）----

export interface ApiMessage {
  id: number
  role: 'them' | 'me'
  text: string
  created_at: string
}

export interface ApiConversationSummary {
  id: string
  contact_name: string
  relationship: string
  last_text: string | null
  message_count: number
  latest_analysis: AnalysisResult | null
  updated_at: string
}

export interface ApiConversationDetail extends ApiConversationSummary {
  messages: ApiMessage[]
}
