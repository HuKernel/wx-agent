import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// 密钥安全模型：api_key 用 safeStorage（Windows DPAPI）加密后存 userData/settings.json，
// 明文只在主进程内存中出现；渲染进程仅拿到尾 4 位。配置不经过后端落盘。

export interface PublicSettings {
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKeyTail: string | null
  wechatName: string
  clipboardWatch: boolean
}

interface SaveInput {
  baseUrl: string
  model: string
  /** 空字符串表示保留已存密钥 */
  apiKey?: string
  wechatName?: string
  clipboardWatch?: boolean
}

interface SettingsFile {
  baseUrl: string
  model: string
  /** safeStorage.encryptString 的 base64 */
  apiKeyEnc?: string
  wechatName?: string
  clipboardWatch?: boolean
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): SettingsFile {
  const p = settingsPath()
  if (!existsSync(p)) return { baseUrl: '', model: '' }
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SettingsFile
  } catch {
    return { baseUrl: '', model: '' }
  }
}

function decryptApiKey(file: SettingsFile): string | null {
  if (!file.apiKeyEnc) return null
  try {
    return safeStorage.decryptString(Buffer.from(file.apiKeyEnc, 'base64'))
  } catch {
    return null
  }
}

export function getSettings(): PublicSettings {
  const file = read()
  const key = decryptApiKey(file)
  return {
    baseUrl: file.baseUrl,
    model: file.model,
    hasApiKey: key !== null,
    apiKeyTail: key ? key.slice(-4) : null,
    wechatName: file.wechatName ?? '',
    clipboardWatch: file.clipboardWatch ?? true
  }
}

/** 仅供主进程内部使用：含明文密钥，用于转发分析请求。 */
export function getLLMConfig(): { baseUrl: string; model: string; apiKey: string } | null {
  const file = read()
  const key = decryptApiKey(file)
  if (!file.baseUrl || !file.model || !key) return null
  return { baseUrl: file.baseUrl, model: file.model, apiKey: key }
}

export function saveSettings(input: SaveInput): void {
  const file = read()
  if (input.apiKey) {
    file.apiKeyEnc = safeStorage.encryptString(input.apiKey).toString('base64')
  }
  file.baseUrl = input.baseUrl.trim()
  file.model = input.model.trim()
  if (input.wechatName !== undefined) file.wechatName = input.wechatName.trim()
  if (input.clipboardWatch !== undefined) file.clipboardWatch = input.clipboardWatch
  writeFileSync(settingsPath(), JSON.stringify(file, null, 2), 'utf-8')
}
