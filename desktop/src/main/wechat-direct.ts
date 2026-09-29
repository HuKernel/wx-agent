import { BrowserWindow } from 'electron'

import { getBackendUrl } from './backend'
import { getSettings } from './settings'
import { analyzeConversation } from './analyze'

// 微信本地库直读轮询：每 10s 调 backend /api/wechat/sync 增量拉新消息，
// 末条是对方消息的会话直接触发分析（LLM 配置在主进程解密后经 analyze 通道下发），
// 然后广播给渲染进程刷新。LLM 未配置时只同步不分析。

const POLL_MS = 10_000

let timer: NodeJS.Timeout | null = null
let running = false

async function syncOnce(): Promise<void> {
  if (running) return
  running = true
  try {
    const s = getSettings()
    if (!s.wechatDirect) return
    const base = getBackendUrl()
    let resp: Response
    try {
      resp = await fetch(`${base}/api/wechat/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_root: s.wechatDataRoot || null })
      })
    } catch {
      return // 后端未就绪：静默等下一轮
    }
    if (!resp.ok) return
    const { updated } = (await resp.json()) as {
      updated: { conversation_id: string; need_analysis: boolean }[]
    }
    if (!updated?.length) return

    for (const u of updated) {
      if (!u.need_analysis) continue
      try {
        // conversation_id 路径下后端以 DB 为单一事实来源，relationship/messages 传空
        await analyzeConversation({ conversationId: u.conversation_id, relationship: '', messages: [] })
      } catch {
        // 分析失败（如未配 LLM）不影响同步，下一轮新消息会再触发
      }
    }
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('wechat-direct-updated', updated.map((u) => u.conversation_id))
    }
  } finally {
    running = false
  }
}

export function startWechatDirectWatch(): void {
  stopWechatDirectWatch()
  if (!getSettings().wechatDirect) return
  void syncOnce()
  timer = setInterval(() => void syncOnce(), POLL_MS)
}

export function stopWechatDirectWatch(): void {
  if (timer) clearInterval(timer)
  timer = null
}
