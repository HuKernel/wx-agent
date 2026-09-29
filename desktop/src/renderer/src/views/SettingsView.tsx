import { useEffect, useState } from 'react'
import { Bot, Check } from 'lucide-react'
import type { EmoraSettings } from '../types/emora'

export default function SettingsView(): React.JSX.Element {
  const [settings, setSettings] = useState<EmoraSettings | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.emora.getSettings().then((s) => {
      setSettings(s)
      setBaseUrl(s.baseUrl)
      setModel(s.model)
    })
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.emora.saveSettings({ baseUrl, model, apiKey: apiKey.trim() })
      setSaved(true)
      setApiKey('')
      const s = await window.emora.getSettings()
      setSettings(s)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const valid = baseUrl.trim() !== '' && model.trim() !== '' && (apiKey.trim() !== '' || settings?.hasApiKey)

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-lg font-semibold">设置</h1>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Bot className="h-4.5 w-4.5 text-primary" aria-hidden />
            AI 模型（OpenAI 兼容）
          </h2>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">API Base URL</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 focus:border-primary/50"
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">
              通常以 /v1 结尾；智谱、DeepSeek、OpenAI 等兼容服务均可
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">模型</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="glm-4.7 / deepseek-chat / gpt-4o …"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 focus:border-primary/50"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings?.hasApiKey ? `已保存（****${settings.apiKeyTail}），留空则不修改` : 'sk-…'
              }
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 focus:border-primary/50"
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">
              密钥经系统加密后仅保存在本机，不会上传到任何服务器
            </span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={!valid || saving}
              className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-primary">
                <Check className="h-4 w-4" aria-hidden />
                已保存
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
