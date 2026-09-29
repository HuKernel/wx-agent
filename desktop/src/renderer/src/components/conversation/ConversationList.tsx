import type { Conversation } from '../../types/analysis'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect
}: ConversationListProps): React.JSX.Element {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      <h1 className="px-4 pb-3 pt-4 text-sm font-semibold text-muted-foreground">对话</h1>
      <ul className="flex-1 overflow-y-auto">
        {conversations.map((c) => {
          const last = c.messages[c.messages.length - 1]
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`w-full cursor-pointer px-4 py-3 text-left transition-colors duration-200 ${
                  c.id === activeId ? 'bg-muted' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.contactName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{last.time}</span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{last.text}</p>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
