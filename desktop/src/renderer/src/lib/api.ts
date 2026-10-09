import type {
  ApiConversationDetail,
  ApiConversationSummary,
  ApiMessage
} from '../types/analysis'

// 对话数据直连本地后端（无敏感信息）；模型配置/密钥走 IPC（window.emora）。
// 后端地址由主进程决定（sidecar 随机端口 / dev 固定 8000），经 IPC 获取后缓存。
let cachedBase: string | null = null

async function base(): Promise<string> {
  if (cachedBase) return cachedBase
  const url =
    typeof window.emora !== 'undefined'
      ? await window.emora.getBackendUrl()
      : 'http://127.0.0.1:8000' // 浏览器冒烟 fallback
  cachedBase = `${url}/api`
  return cachedBase
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch((await base()) + path, {
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
    request(`/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' }),

  listMemories: (): Promise<ApiMemory[]> => request('/memories'),

  deleteMemory: (memoryId: number): Promise<void> =>
    request(`/memories/${memoryId}`, { method: 'DELETE' }),

  // ── 微信本地库直读（实验功能）──
  wechatStatus: (dataRoot: string): Promise<ApiWechatStatus> =>
    request(`/wechat/status?data_root=${encodeURIComponent(dataRoot || '')}`),

  wechatExtractKey: (dataRoot: string): Promise<{ ok: boolean }> =>
    request('/wechat/extract-key', {
      method: 'POST',
      body: JSON.stringify({ data_root: dataRoot || null })
    }),

  wechatConversations: (dataRoot: string, limit = 50): Promise<ApiWechatConversation[]> =>
    request(
      `/wechat/conversations?data_root=${encodeURIComponent(dataRoot || '')}&limit=${limit}`
    ),

  wechatBind: (body: {
    data_root: string | null
    chat_id: string
    display_name: string
    relationship: string
  }): Promise<{ conversation_id: string; already_bound: boolean; backfilled: number }> =>
    request('/wechat/bind', { method: 'POST', body: JSON.stringify(body) }),

  wechatUnbind: (conversationId: string): Promise<{ ok: boolean }> =>
    request('/wechat/unbind', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId })
    })
}

export interface ApiWechatStatus {
  key_ok: boolean
  account_id?: string
  wxid_dir?: string | null
  dir_valid?: boolean
}

export interface ApiWechatConversation {
  chat_id: string
  display_name: string
  message_count: number
}

export interface ApiMemory {
  id: number
  kind: 'style' | 'relationship' | 'summary'
  scope: 'global' | 'conversation'
  content: string
  contact_name: string | null
  created_at: string
  updated_at: string
}

export const memoryKindLabel: Record<ApiMemory['kind'], string> = {
  style: '沟通风格',
  relationship: '关系记忆',
  summary: '对话摘要'
}

/** ISO 时间 → 本地 HH:MM */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
