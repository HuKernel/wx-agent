import { useCallback, useEffect, useState } from 'react'
import { ClipboardPaste, Loader2, Send, Sparkles } from 'lucide-react'
import ConversationList from '../components/conversation/ConversationList'
import MessageBubble from '../components/conversation/MessageBubble'
import EmotionPanel from '../components/conversation/EmotionPanel'
import { api } from '../lib/api'
import type {
  ApiConversationDetail,
  ApiConversationSummary,
  AnalysisResult
} from '../types/analysis'

type DraftRole = 'them' | 'me'

/**
 * 增量追加：incoming 头部与 existing 尾部有重叠则只取新增部分。
 * 已知限制：incoming 是 existing 中间子序列时不去重（少见，靠 hover 删消息兜底）。
 */
function diffTail(
  existing: { role: string; text: string }[],
  incoming: { role: 'them' | 'me'; text: string }[]
): { role: 'them' | 'me'; text: string }[] {
  for (let k = Math.min(incoming.length, existing.length); k > 0; k--) {
    const tail = existing.slice(-k)
    if (tail.every((e, i) => e.role === incoming[i].role && e.text === incoming[i].text)) {
      return incoming.slice(k)
    }
  }
  return incoming
}

export default function ConversationView(): React.JSX.Element {
  const [summaries, setSummaries] = useState<ApiConversationSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiConversationDetail | null>(null)

  const [draft, setDraft] = useState('')
  const [draftRole, setDraftRole] = useState<DraftRole>('them')
  const [sending, setSending] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshList = useCallback(async (autoSelect = true): Promise<void> => {
    setListLoading(true)
    setListError(null)
    try {
      const items = await api.listConversations()
      setSummaries(items)
      if (autoSelect) {
        setActiveId((prev) => (prev && items.some((c) => c.id === prev) ? prev : (items[0]?.id ?? null)))
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : '加载对话列表失败')
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    setError(null)
    try {
      setDetail(await api.getConversation(id))
    } catch (e) {
      setDetail(null)
      setError(e instanceof Error ? e.message : '加载对话失败')
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    if (activeId) void loadDetail(activeId)
    else setDetail(null)
  }, [activeId, loadDetail])

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || !activeId || sending) return
    setSending(true)
    try {
      await api.addMessage(activeId, { role: draftRole, text })
      setDraft('')
      await loadDetail(activeId)
      await refreshList(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  const deleteMessage = async (messageId: number): Promise<void> => {
    if (!activeId) return
    try {
      await api.deleteMessage(activeId, messageId)
      await loadDetail(activeId)
      await refreshList(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const analyze = async (): Promise<void> => {
    if (!detail || analyzing) return
    setAnalyzing(true)
    setError(null)
    try {
      const result = (await window.emora.analyze({
        conversationId: detail.id,
        relationship: detail.relationship,
        messages: detail.messages.map((m) => ({ role: m.role, text: m.text }))
      })) as AnalysisResult
      setDetail({ ...detail, latest_analysis: result })
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败，请稍后重试')
    } finally {
      setAnalyzing(false)
    }
  }

  /** 微信导入核心：匹配/新建会话 → 增量追加 → 自动分析（最后一条是对方消息时）。 */
  const importMessages = useCallback(
    async (contactName: string, incoming: { role: 'them' | 'me'; text: string }[]): Promise<void> => {
      if (!incoming.length) return
      const list = await api.listConversations()
      let conv = list.find((c) => c.contact_name === contactName)
      if (!conv) {
        const created = await api.createConversation({
          contact_name: contactName,
          relationship: '朋友'
        })
        conv = { id: created.id } as ApiConversationSummary
      }

      let current = await api.getConversation(conv.id)
      const newMsgs = diffTail(current.messages, incoming)
      for (const m of newMsgs) {
        await api.addMessage(conv.id, m)
      }
      if (!newMsgs.length) return

      setActiveId(conv.id)
      current = await api.getConversation(conv.id)
      setDetail(current)
      await refreshList(false)

      if (newMsgs[newMsgs.length - 1].role === 'them') {
        setAnalyzing(true)
        setError(null)
        try {
          const result = (await window.emora.analyze({
            conversationId: conv.id,
            relationship: current.relationship,
            messages: current.messages.map((m) => ({ role: m.role, text: m.text }))
          })) as AnalysisResult
          setDetail({ ...current, latest_analysis: result })
        } catch (e) {
          setError(e instanceof Error ? e.message : '自动分析失败，可手动点击「AI 分析」重试')
        } finally {
          setAnalyzing(false)
        }
      }
    },
    [refreshList]
  )

  // 微信多选复制 → 剪贴板桥自动导入
  useEffect(() => {
    if (typeof window.emora === 'undefined') return
    return window.emora.onWechatImport((payload) => {
      void importMessages(payload.contactName, payload.messages)
    })
  }, [importMessages])

  /** 手动粘贴导入：有合并格式走解析；纯文本作为对方消息加入当前会话。 */
  const manualImport = async (): Promise<void> => {
    if (typeof window.emora === 'undefined' || !detail) return
    try {
      const { parsed, raw } = await window.emora.readClipboardForImport()
      if (parsed) {
        await importMessages(parsed.contactName, parsed.messages)
      } else if (raw.trim()) {
        await api.addMessage(detail.id, { role: 'them', text: raw.trim() })
        await loadDetail(detail.id)
        await refreshList(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败')
    }
  }

  const analysis = detail?.latest_analysis ?? null

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={summaries}
        activeId={activeId}
        loading={listLoading}
        onSelect={setActiveId}
        onChanged={() => void refreshList()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {listError ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-destructive">
            {listError}
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {activeId ? '加载中…' : '选择或新建一个对话开始'}
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
              <div>
                <h1 className="font-semibold">{detail.contact_name}</h1>
                <p className="text-xs text-muted-foreground">{detail.relationship}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={manualImport}
                  aria-label="粘贴导入微信消息"
                  title="粘贴导入：微信多选复制或单条复制后点此导入"
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                >
                  <ClipboardPaste className="h-4 w-4" aria-hidden />
                  粘贴导入
                </button>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={analyzing || detail.messages.length === 0}
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-60"
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  {analyzing ? '分析中…' : 'AI 分析'}
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {detail.messages.map((m) => (
                <MessageBubble key={m.id} message={m} onDelete={deleteMessage} />
              ))}
            </div>

            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <div className="flex shrink-0 flex-col gap-0.5 self-stretch justify-center">
                  {(['them', 'me'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setDraftRole(role)}
                      aria-pressed={draftRole === role}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs transition-colors duration-200 ${
                        draftRole === role
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {role === 'them' ? '对方' : '我'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={2}
                  placeholder={
                    draftRole === 'them'
                      ? '粘贴对方发来的消息…（Enter 添加）'
                      : '输入我的回复…（Enter 添加）'
                  }
                  className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 placeholder:text-muted-foreground/70 focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!draft.trim() || sending}
                  aria-label="发送"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
                >
                  <Send className="h-4.5 w-4.5" aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {detail && analysis && !error ? (
        <EmotionPanel analysis={analysis} />
      ) : (
        <div className="flex h-full w-80 flex-col items-center justify-center gap-2 border-l border-border bg-muted/40 p-6 text-center text-sm leading-relaxed text-muted-foreground">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <>
              <Sparkles className="h-5 w-5 text-secondary" aria-hidden />
              <p>
                {detail?.messages.length
                  ? '点击上方「AI 分析」，生成情绪洞察与回复建议'
                  : '添加对方的消息后即可分析'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
