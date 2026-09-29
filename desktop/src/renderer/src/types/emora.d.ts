import type { AnalysisResult, ChatMessage } from './analysis'

export interface EmoraSettings {
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyTail: string | null
}

export interface EmoraApi {
  getBackendUrl(): Promise<string>
  getSettings(): Promise<EmoraSettings>
  saveSettings(input: { baseUrl: string; model: string; apiKey?: string }): Promise<void>
  analyze(payload: {
    conversationId: string
    relationship: string
    messages: Pick<ChatMessage, 'role' | 'text'>[]
  }): Promise<AnalysisResult>
}

declare global {
  interface Window {
    emora: EmoraApi
  }
}
