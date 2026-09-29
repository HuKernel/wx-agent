import { useState } from 'react'
import { Send } from 'lucide-react'
import ConversationList from '../components/conversation/ConversationList'
import MessageBubble from '../components/conversation/MessageBubble'
import EmotionPanel from '../components/conversation/EmotionPanel'
import { mockConversations } from '../data/mock'

export default function ConversationView(): React.JSX.Element {
  const [conversations, setConversations] = useState(mockConversations)
  const [activeId, setActiveId] = useState(mockConversations[0].id)
  const [draft, setDraft] = useState('')

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0]

  const send = (): void => {
    const text = draft.trim()
    if (!text) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: `local-${Date.now()}`, role: 'me', text, time: '刚刚' }
              ]
            }
          : c
      )
    )
    setDraft('')
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

      {active.analysis ? (
        <EmotionPanel analysis={active.analysis} />
      ) : (
        <div className="flex h-full w-80 items-center justify-center border-l border-border bg-muted/40 p-6 text-center text-sm leading-relaxed text-muted-foreground">
          暂无分析结果。
          <br />
          AI 分析将在 Phase 3 接入后提供。
        </div>
      )}
    </div>
  )
}
