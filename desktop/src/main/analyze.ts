import { getBackendUrl } from './backend'
import { getLLMConfig } from './settings'

export interface AnalyzePayload {
  conversationId: string
  relationship: string
  messages: { role: 'them' | 'me'; text: string }[]
}

export async function analyzeConversation(payload: AnalyzePayload): Promise<unknown> {
  const llm = getLLMConfig()
  if (!llm) {
    throw new Error('请先在「设置」中配置 AI 模型（Base URL / API Key / 模型）')
  }

  let resp: Response
  try {
    resp = await fetch(`${getBackendUrl()}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        llm: { base_url: llm.baseUrl, api_key: llm.apiKey, model: llm.model },
        relationship: payload.relationship,
        messages: payload.messages,
        conversation_id: payload.conversationId
      })
    })
  } catch {
    throw new Error('无法连接后端服务，请确认 backend 已启动（uvicorn app.main:app）')
  }

  const data = (await resp.json()) as { detail?: string }
  if (!resp.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : `后端返回错误 ${resp.status}`)
  }
  return data
}
