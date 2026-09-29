import { parseEmotionText } from '../../lib/emotions'

interface EmotionTextProps {
  text: string
}

/** 渲染含微信表情码的文本：经典表情动图 / 新表情 emoji / 系统标记徽章 */
export default function EmotionText({ text }: EmotionTextProps): React.JSX.Element {
  const pieces = parseEmotionText(text)
  return (
    <>
      {pieces.map((p, i) => {
        if (p.kind === 'gif') {
          return (
            <img
              key={i}
              src={p.url}
              alt={p.name}
              title={p.name}
              className="mx-0.5 inline-block h-6 w-6 align-[-0.4em]"
            />
          )
        }
        if (p.kind === 'emoji') {
          return <span key={i}>{p.char}</span>
        }
        if (p.kind === 'tag') {
          return (
            <span
              key={i}
              className="mx-0.5 inline-block rounded-md bg-foreground/10 px-1.5 py-0.5 text-xs"
            >
              {p.name}
            </span>
          )
        }
        return <span key={i}>{p.value}</span>
      })}
    </>
  )
}
