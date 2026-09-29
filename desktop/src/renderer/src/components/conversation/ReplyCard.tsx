import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { replyStyleLabel, type ReplyOption } from '../../types/analysis'
import EmotionText from './EmotionText'

interface ReplyCardProps {
  option: ReplyOption
}

export default function ReplyCard({ option }: ReplyCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(option.reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 transition-shadow duration-200 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-primary">
          {replyStyleLabel[option.style]}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? '已复制' : '复制回复'}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        <EmotionText text={option.reply} />
      </p>
      {option.expected_reaction && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          ↩ {option.expected_reaction}
        </p>
      )}
    </div>
  )
}
