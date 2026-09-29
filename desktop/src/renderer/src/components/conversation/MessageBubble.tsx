import { X } from 'lucide-react'
import { formatTime } from '../../lib/api'
import type { ApiMessage } from '../../types/analysis'
import EmotionText from './EmotionText'

interface MessageBubbleProps {
  message: ApiMessage
  onDelete?: (messageId: number) => void
}

export default function MessageBubble({ message, onDelete }: MessageBubbleProps): React.JSX.Element {
  const isMine = message.role === 'me'
  return (
    <div className={`group flex items-center gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(message.id)}
          aria-label="删除消息"
          className="hidden cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors duration-200 hover:text-destructive group-hover:block"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isMine
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        <p>
          <EmotionText text={message.text} />
        </p>
        <span
          className={`mt-1 block text-right text-xs ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
