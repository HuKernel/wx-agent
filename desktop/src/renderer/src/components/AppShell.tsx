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
  // 无缝轮播两个必要条件（都踩过坑）：
  // 1. 两份完全等宽的 flex 容器（词条间距统一 mx-3）→ translateX(-50%) 数学对齐
  // 2. 单份宽度 ≥ 视口宽度（词条重复 4 遍 ≈ 3000px+，覆盖 2560 宽屏）→ 一份
  //    滚出时另一份铺满视口，否则右侧露空白（用户实测报过）
  const strip = (key: string): React.JSX.Element => (
    <div key={key} className="flex shrink-0 items-center py-1.5 text-xs font-bold">
      {[0, 1, 2, 3].flatMap((r) =>
        MARQUEE_ITEMS.map((t) => (
          <span key={`${r}-${t}`} className="mx-3 whitespace-nowrap">
            {t} /
          </span>
        ))
      )}
    </div>
  )
  return (
    <div
      className="overflow-hidden border-b border-border bg-accent text-accent-foreground"
      aria-hidden
    >
      <div className="marquee-track flex w-max">
        {strip('a')}
        {strip('b')}
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
