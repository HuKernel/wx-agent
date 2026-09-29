import { useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import ConversationList from '../components/conversation/ConversationList'
import MessageBubble from '../components/conversation/MessageBubble'
import EmotionPanel from '../components/conversation/EmotionPanel'
import { mockConversations } from '../data/mock'
import type { AnalysisResult } from '../types/analysis'

export default function ConversationView(): React.JSX.Element {
  const [conversations, setConversations] = useState(mockConversations)
  const [activeId, setActiveId] = useState(mockConversations[0].id)
  const [draft, setDraft] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0]

  const send = (): void => {
    const text = draft.trim()
    if (!text) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? {
              ...c,
              messages: [...c.messages, { id: `local-${Date.now()}`, role: 'me', text, time: '刚刚' }]
            }
          : c
      )
    )
    setDraft('')
  }

  const analyze = async (): Promise<void> => {
    setAnalyzing(true)
    setError(null)
    try {
      const result = (await window.emora.analyze({
        relationship: active.relationship,
        messages: active.messages.map((m) => ({ role: m.role, text: m.text }))
      })) as AnalysisResult
      setConversations((prev) =>
        prev.map((c) => (c.id === active.id ? { ...c, analysis: result } : c))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败，请稍后重试')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="flex h-full">
      <ConversationList conversations={conversations} activeId={active.id} onSelect={setActiveId} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div>
            <h1 className="font-semibold">{active.contactName}</h1>
            <p className="text-xs text-muted-foreground">{active.relationship}</p>
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={analyzing}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-60"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {analyzing ? '分析中…' : 'AI 分析'}
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {active.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>

        <div className="border-t border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder="输入回复…（Enter 发送，Shift+Enter 换行）"
              className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 placeholder:text-muted-foreground/70 focus:border-primary/50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="发送"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              <Send className="h-4.5 w-4.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {active.analysis && !error ? (
        <EmotionPanel analysis={active.analysis} />
      ) : (
        <div className="flex h-full w-80 flex-col items-center justify-center gap-2 border-l border-border bg-muted/40 p-6 text-center text-sm leading-relaxed text-muted-foreground">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : (
            <>
              <Sparkles className="h-5 w-5 text-secondary" aria-hidden />
              <p>
                {active.messages.length > 0
                  ? '点击上方「AI 分析」，生成情绪洞察与回复建议'
                  : '发送消息后即可分析'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
