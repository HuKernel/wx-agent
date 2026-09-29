import type { AnalysisResult, ChatMessage } from './analysis'

export interface EmoraSettings {
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyTail: string | null
  wechatName: string
  clipboardWatch: boolean
}

export interface WechatImportPayload {
  contactName: string
  messages: { role: 'them' | 'me'; text: string }[]
}

export interface EmoraApi {
  getBackendUrl(): Promise<string>
  getSettings(): Promise<EmoraSettings>
  saveSettings(input: {
    baseUrl: string
    model: string
    apiKey?: string
    wechatName?: string
    clipboardWatch?: boolean
  }): Promise<void>
  analyze(payload: {
    conversationId: string
    relationship: string
    messages: Pick<ChatMessage, 'role' | 'text'>[]
  }): Promise<AnalysisResult>
  readClipboardForImport(): Promise<{ parsed: WechatImportPayload | null; raw: string }>
  onWechatImport(callback: (payload: WechatImportPayload) => void): () => void
}

declare global {
  interface Window {
    emora: EmoraApi
  }
}
