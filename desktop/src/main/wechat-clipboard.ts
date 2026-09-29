import { BrowserWindow, clipboard } from 'electron'
import { parseWechatText } from './wechat-parse'
import { getSettings } from './settings'

// 剪贴板桥：轮询检测微信复制格式，解析成功推送给渲染进程。
// 单条纯文本复制无格式头，不走自动导入（由会话页「粘贴导入」按钮手动触发）。

const POLL_MS = 1200

let lastText = ''

async function readAndDispatch(): Promise<void> {
  if (!getSettings().clipboardWatch) return
  const text = await clipboard.readText()
  if (!text || text === lastText) return
  lastText = text

  const parsed = parseWechatText(text, getSettings().wechatName)
  if (!parsed || 'ambiguous' in parsed) return

  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send('wechat-import', parsed)
}

export function startClipboardWatch(): void {
  void clipboard.readText().then((t) => {
    lastText = t // 记住启动前已有内容，避免误导入
  })
  setInterval(() => {
    void readAndDispatch()
  }, POLL_MS)
}

/** 手动导入：读取剪贴板，有格式走解析，无格式返回原始文本由调用方处理。 */
export async function readClipboardForImport(): Promise<{
  parsed: ReturnType<typeof parseWechatText>
  raw: string
}> {
  const raw = await clipboard.readText()
  return { parsed: parseWechatText(raw, getSettings().wechatName), raw }
}
