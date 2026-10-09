import type { ReactNode } from 'react'
import Sidebar, { type View } from './Sidebar'

// 跑马灯词条是产品能力清单（语义行，非装饰眉标）
const MARQUEE_ITEMS = [
  '情绪洞察',
  '回复建议',
  '长期记忆',
  '微信实时同步',
  '沟通知识库',
  '多工具智能体',
  '数据不出本机'
]

function Marquee(): React.JSX.Element {
  const row = MARQUEE_ITEMS.map((t) => ` ${t} /`).join('')
  return (
    <div
      className="overflow-hidden border-b border-border bg-accent text-accent-foreground"
      aria-hidden
    >
      <div className="marquee-track w-max py-1.5 text-xs font-bold whitespace-nowrap">
        <span>{row}</span>
        <span>{row}</span>
      </div>
    </div>
  )
}

export default function AppShell({ view, onNavigate, children }: {
  view: View
  onNavigate: (v: View) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full bg-background text-foreground">
      <Sidebar view={view} onNavigate={onNavigate} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Marquee />
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  )
}
