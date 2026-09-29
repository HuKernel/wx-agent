import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api, formatTime } from '../../lib/api'
import type { ApiConversationSummary } from '../../types/analysis'

const RELATIONSHIPS = ['朋友', '伴侣', '同事', '上级', '家人', '其他']

interface ConversationListProps {
  conversations: ApiConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  /** 列表发生增删后回调，父级重新拉取 */
  onChanged: () => void
}

export default function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onChanged
}: ConversationListProps): React.JSX.Element {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0])
  const [busy, setBusy] = useState(false)

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await api.createConversation({ contact_name: name.trim(), relationship })
      setName('')
      setCreating(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, contact: string): Promise<void> => {
    if (!window.confirm(`删除与「${contact}」的对话？消息将一并删除。`)) return
    await api.deleteConversation(id)
    onChanged()
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h1 className="text-sm font-semibold text-muted-foreground">对话</h1>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          aria-label="新建对话"
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {creating && (
        <div className="mx-3 mb-2 space-y-2 rounded-xl bg-muted/60 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            autoFocus
            placeholder="联系人名字"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
          />
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            aria-label="关系"
            className="w-full cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={create}
              disabled={!name.trim() || busy}
              className="flex-1 cursor-pointer rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="cursor-pointer rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">加载中…</p>
      ) : conversations.length === 0 ? (
        <p className="px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          还没有对话。点右上角 + 新建一个，粘贴对方的聊天记录开始分析。
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full cursor-pointer px-4 py-3 pr-10 text-left transition-colors duration-200 ${
                  c.id === activeId ? 'bg-muted' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.contact_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTime(c.updated_at)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {c.last_text ?? '暂无消息'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => remove(c.id, c.contact_name)}
                aria-label={`删除与${c.contact_name}的对话`}
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-destructive group-hover:block"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
