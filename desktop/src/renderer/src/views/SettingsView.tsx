import { Bot, Palette } from 'lucide-react'

interface FieldProps {
  label: string
  type?: string
  placeholder: string
  hint?: string
}

function Field({ label, type = 'text', placeholder, hint }: FieldProps): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 placeholder:text-muted-foreground/70 focus:border-primary/50"
      />
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export default function SettingsView(): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-lg font-semibold">设置</h1>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Bot className="h-4.5 w-4.5 text-primary" aria-hidden />
            AI 模型
          </h2>
          <Field label="API Base URL" placeholder="https://api.example.com/v1" />
          <Field label="API Key" type="password" placeholder="sk-…" hint="密钥仅保存在本机，不会上传。" />
          <Field label="模型" placeholder="gpt-4o / glm-4 / deepseek-chat …" />
          <p className="text-xs text-muted-foreground">
            模型调用将在 Phase 3 接入，当前仅作配置入口预留。
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Palette className="h-4.5 w-4.5 text-primary" aria-hidden />
            外观
          </h2>
          <Field label="主题" placeholder="浅色（深色主题规划中）" />
        </section>
      </div>
    </div>
  )
}
