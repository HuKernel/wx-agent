import { useEffect, useState } from 'react'
import { Bot, Brain, Check, Link2Off, MessageCircleHeart, Radio, Trash2 } from 'lucide-react'
import type { EmoraSettings } from '../types/emora'
import { api, memoryKindLabel, type ApiMemory, type ApiWechatConversation } from '../lib/api'
import type { ApiConversationSummary } from '../types/analysis'

function MemorySection(): React.JSX.Element {
  const [memories, setMemories] = useState<ApiMemory[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      setMemories(await api.listMemories())
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载记忆失败')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (m: ApiMemory): Promise<void> => {
    if (!window.confirm('删除这条记忆？分析时将不再参考它。')) return
    await api.deleteMemory(m.id)
    void load()
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <Brain className="h-4.5 w-4.5 text-primary" aria-hidden />
        记忆管理
      </h2>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : memories === null ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : memories.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          还没有长期记忆。进行几次 AI 分析后，Emora 会在这里积累你的沟通风格画像、关系记忆与对话摘要。
        </p>
      ) : (
        <ul className="space-y-2.5">
          {memories.map((m) => (
            <li key={m.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-primary">
                    {memoryKindLabel[m.kind]}
                  </span>
                  {m.contact_name && (
                    <span className="text-xs text-muted-foreground">{m.contact_name}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  aria-label="删除记忆"
                  className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">{m.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function WechatDirectSection(props: {
  dataRoot: string
  directOn: boolean
  onPersist: (next: { wechatDirect?: boolean; wechatDataRoot?: string }) => Promise<void>
}): React.JSX.Element {
  const { dataRoot, directOn, onPersist } = props
  const [keyOk, setKeyOk] = useState<boolean | null>(null)
  const [dirValid, setDirValid] = useState<boolean | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convs, setConvs] = useState<ApiWechatConversation[] | null>(null)
  const [bound, setBound] = useState<ApiConversationSummary[]>([])
  // 输入框本地值，失焦才保存：避免逐字符触发保存+状态请求竞态
  const [rootDraft, setRootDraft] = useState(dataRoot)

  const refreshStatus = async (): Promise<void> => {
    setKeyOk(null)
    setDirValid(null)
    try {
      const s = await api.wechatStatus(dataRoot)
      setKeyOk(s.key_ok)
      setDirValid(s.key_ok ? (s.dir_valid ?? true) : null)
    } catch {
      setKeyOk(false)
    }
  }
  const reloadBound = async (): Promise<void> => {
    try {
      setBound((await api.listConversations()).filter((c) => c.wechat_chat_id))
    } catch {
      // 列表失败不阻塞区块
    }
  }

  useEffect(() => {
    // 竞态防护：mount 时会先用初始空串跑一次，随后 dataRoot 才到位；
    // 空目录探测请求更慢，若不丢弃旧响应会把已显示的正常状态覆盖成黄字
    let stale = false
    const run = async (): Promise<void> => {
      setKeyOk(null)
      setDirValid(null)
      try {
        const s = await api.wechatStatus(dataRoot)
        if (stale) return
        setKeyOk(s.key_ok)
        setDirValid(s.key_ok ? (s.dir_valid ?? true) : null)
      } catch {
        if (!stale) setKeyOk(false)
      }
    }
    void run()
    void reloadBound()
    return () => {
      stale = true
    }
  }, [dataRoot])

  useEffect(() => {
    setRootDraft(dataRoot)
  }, [dataRoot])

  const extract = async (): Promise<void> => {
    if (!window.confirm('提取过程会自动重启一次微信（约 1-2 分钟，期间勿操作微信），继续？')) return
    setExtracting(true)
    setError(null)
    try {
      await api.wechatExtractKey(dataRoot)
      await refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提取失败')
    } finally {
      setExtracting(false)
    }
  }

  const loadConvs = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setConvs(await api.wechatConversations(dataRoot))
    } catch (e) {
      setError(e instanceof Error ? e.message : '会话列表读取失败')
    } finally {
      setBusy(false)
    }
  }

  const bind = async (c: ApiWechatConversation): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api.wechatBind({
        data_root: dataRoot || null,
        chat_id: c.chat_id,
        display_name: c.display_name,
        relationship: '朋友'
      })
      await reloadBound()
    } catch (e) {
      setError(e instanceof Error ? e.message : '绑定失败')
    } finally {
      setBusy(false)
    }
  }

  const unbind = async (c: ApiConversationSummary): Promise<void> => {
    await api.wechatUnbind(c.id)
    await reloadBound()
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <Radio className="h-4.5 w-4.5 text-primary" aria-hidden />
        微信实时同步（实验）
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          直接读取本机微信数据库
        </span>
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        实验功能：解密密钥与聊天数据仅保存在本机，不上传；微信版本更新后可能需要重新提取密钥。
      </p>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">微信数据目录</span>
        <input
          value={rootDraft}
          onChange={(e) => setRootDraft(e.target.value)}
          onBlur={() => {
            const v = rootDraft.trim()
            setRootDraft(v)
            if (v !== dataRoot) onPersist({ wechatDataRoot: v })
          }}
          placeholder="留空自动探测；自动探测到旧版目录时会在这里提示，需手动填写 xwechat_files 路径"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 focus:border-primary/50"
        />
      </label>

      {dirValid === false && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-amber-600">
          自动探测到的不是有效的微信 4.x 数据目录（可能是旧版遗留）。请在上方填写
          xwechat_files 所在路径，例如 <span className="font-mono text-xs">D:\wenjian\xwechat_files</span>
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className={`text-sm ${keyOk === null ? 'text-muted-foreground' : keyOk ? 'text-primary' : 'text-destructive'}`}>
          {keyOk === null ? '检测中…' : keyOk ? '密钥可用' : '尚未提取密钥'}
        </span>
        {keyOk !== true && (
          <button
            type="button"
            onClick={extract}
            disabled={extracting}
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            {extracting ? '提取中（微信将重启一次）…' : '提取解密密钥'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {keyOk === true && dirValid !== false && (
        <>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={directOn}
              onChange={(e) => onPersist({ wechatDirect: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
            />
            <span className="text-sm">
              自动同步并分析新消息
              <span className="block text-xs text-muted-foreground">
                绑定的会话收到对方新消息时自动导入并生成回复建议
              </span>
            </span>
          </label>

          {bound.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">已同步的会话</span>
              {bound.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm">
                    {c.contact_name}
                    <span className="ml-2 text-xs text-muted-foreground">{c.message_count} 条</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => unbind(c)}
                    aria-label={`停止同步 ${c.contact_name}`}
                    title="停止同步（保留已导入的消息）"
                    className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-destructive"
                  >
                    <Link2Off className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={loadConvs}
              disabled={busy}
              className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm transition-colors duration-200 hover:bg-muted disabled:cursor-default disabled:opacity-40"
            >
              {convs === null ? '选择要同步的微信会话…' : '刷新会话列表'}
            </button>
          </div>

          {convs !== null && (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {convs.map((c) => {
                const isBound = bound.some((b) => b.wechat_chat_id === c.chat_id)
                return (
                  <li
                    key={c.chat_id}
                    className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <span className="text-sm">
                      {c.display_name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        历史共 {c.message_count} 条
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => bind(c)}
                      disabled={isBound || busy}
                      className="cursor-pointer rounded-lg border border-border px-3 py-1 text-xs transition-colors duration-200 hover:bg-muted disabled:cursor-default disabled:opacity-40"
                    >
                      {isBound ? '已同步' : '同步'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

export default function SettingsView(): React.JSX.Element {
  const [settings, setSettings] = useState<EmoraSettings | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [wechatName, setWechatName] = useState('')
  const [clipboardWatch, setClipboardWatch] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // 直读区块独立管理（提取/绑定即时执行；开关和目录即时保存生效）
  const [wechatDirect, setWechatDirect] = useState(false)
  const [wechatDataRoot, setWechatDataRoot] = useState('')

  const persistDirect = async (next: { wechatDirect?: boolean; wechatDataRoot?: string }) => {
    await window.emora.saveSettings({
      baseUrl,
      model,
      wechatName,
      clipboardWatch,
      wechatDirect: next.wechatDirect ?? wechatDirect,
      wechatDataRoot: next.wechatDataRoot ?? wechatDataRoot
    })
    if (next.wechatDirect !== undefined) setWechatDirect(next.wechatDirect)
    if (next.wechatDataRoot !== undefined) setWechatDataRoot(next.wechatDataRoot)
  }

  useEffect(() => {
    window.emora.getSettings().then((s) => {
      setSettings(s)
      setBaseUrl(s.baseUrl)
      setModel(s.model)
      setWechatName(s.wechatName)
      setClipboardWatch(s.clipboardWatch)
      setWechatDirect(s.wechatDirect)
      setWechatDataRoot(s.wechatDataRoot)
    })
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.emora.saveSettings({
        baseUrl,
        model,
        apiKey: apiKey.trim(),
        wechatName,
        clipboardWatch
      })
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

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium">
            <MessageCircleHeart className="h-4.5 w-4.5 text-primary" aria-hidden />
            微信导入
          </h2>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">我的微信昵称</span>
            <input
              value={wechatName}
              onChange={(e) => setWechatName(e.target.value)}
              placeholder="你在微信里的昵称（用于区分哪句是你说的）"
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow duration-200 focus:border-primary/50"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={clipboardWatch}
              onChange={(e) => setClipboardWatch(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
            />
            <span className="text-sm">
              剪贴板自动导入
              <span className="block text-xs text-muted-foreground">
                在微信 PC 端多选消息复制后，Emora 自动识别并导入分析
              </span>
            </span>
          </label>
        </section>

        <WechatDirectSection
          dataRoot={wechatDataRoot}
          directOn={wechatDirect}
          onPersist={persistDirect}
        />

        <MemorySection />
      </div>
    </div>
  )
}
