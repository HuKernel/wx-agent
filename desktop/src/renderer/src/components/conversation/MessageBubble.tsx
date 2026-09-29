import type { ChatMessage } from '../../types/analysis'

interface MessageBubbleProps {
  message: ChatMessage
}

export default function MessageBubble({ message }: MessageBubbleProps): React.JSX.Element {
  const isMine = message.role === 'me'
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isMine
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground'
        }`}
      >
        <p>{message.text}</p>
        <span
          className={`mt-1 block text-right text-xs ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
        >
          {message.time}
        </span>
      </div>
    </div>
  )
}
