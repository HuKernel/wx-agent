import type {
  ApiConversationDetail,
  ApiConversationSummary,
  ApiMessage
} from '../types/analysis'

// 对话数据直连本地后端（无敏感信息）；模型配置/密钥走 IPC（window.emora）。
const BASE = 'http://127.0.0.1:8000/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...init
    })
  } catch {
    throw new Error('无法连接后端服务，请确认 backend 已启动（uvicorn app.main:app）')
  }
  if (!resp.ok) {
    let detail = `请求失败（${resp.status}）`
    try {
      const data = (await resp.json()) as { detail?: string }
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // 保留默认错误信息
    }
    throw new Error(detail)
  }
  return resp.status === 204 ? (undefined as T) : ((await resp.json()) as T)
}

export const api = {
  listConversations: (): Promise<ApiConversationSummary[]> => request('/conversations'),

  getConversation: (id: string): Promise<ApiConversationDetail> =>
    request(`/conversations/${id}`),

  createConversation: (body: {
    contact_name: string
    relationship: string
  }): Promise<{ id: string }> =>
    request('/conversations', { method: 'POST', body: JSON.stringify(body) }),

  deleteConversation: (id: string): Promise<void> =>
    request(`/conversations/${id}`, { method: 'DELETE' }),

  addMessage: (
    conversationId: string,
    body: { role: 'them' | 'me'; text: string }
  ): Promise<ApiMessage> =>
    request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  deleteMessage: (conversationId: string, messageId: number): Promise<void> =>
    request(`/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' })
}

/** ISO 时间 → 本地 HH:MM */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
