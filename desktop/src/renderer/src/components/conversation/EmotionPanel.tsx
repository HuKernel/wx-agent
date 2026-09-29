import { AlertTriangle, HeartPulse, Lightbulb } from 'lucide-react'
import type { AnalysisResult } from '../../types/analysis'
import ReplyCard from './ReplyCard'

interface EmotionPanelProps {
  analysis: AnalysisResult
}

function SectionTitle({ icon: Icon, children }: { icon: typeof HeartPulse; children: string }): React.JSX.Element {
  return (
    <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </h2>
  )
}

export default function EmotionPanel({ analysis }: EmotionPanelProps): React.JSX.Element {
  const { emotion_analysis: ea, communication_strategy, risk_warning, reply_options, reason } = analysis

  return (
    <div className="flex h-full w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-muted/40 p-4">
      <section className="space-y-2">
        <SectionTitle icon={HeartPulse}>情绪洞察</SectionTitle>
        <div className="rounded-xl bg-card p-3 text-sm">
          <p>
            <span className="text-muted-foreground">情绪：</span>
            {ea.emotion}（强度：{ea.intensity}）
          </p>
          <p className="mt-1.5">
            <span className="text-muted-foreground">隐藏需求：</span>
            {ea.hidden_need}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle icon={Lightbulb}>沟通策略</SectionTitle>
        <p className="rounded-xl bg-card p-3 text-sm leading-relaxed">{communication_strategy}</p>
        {reason && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{reason}</p>}
      </section>

      {risk_warning && (
        <section className="space-y-2">
          <SectionTitle icon={AlertTriangle}>风险提示</SectionTitle>
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive">
            {risk_warning}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle icon={HeartPulse}>回复建议</SectionTitle>
        <div className="flex flex-col gap-2.5">
          {reply_options.map((opt) => (
            <ReplyCard key={opt.style} option={opt} />
          ))}
        </div>
      </section>
    </div>
  )
}
