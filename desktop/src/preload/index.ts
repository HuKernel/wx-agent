import { contextBridge, ipcRenderer } from 'electron'

import type { WechatParseResult } from '../main/wechat-parse'

export type { WechatParseResult }

// channel 字符串与 src/main/index.ts 的 ipcMain.handle 保持一致。
const api = {
  getBackendUrl: (): Promise<string> => ipcRenderer.invoke('backend-url'),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: unknown): Promise<void> => ipcRenderer.invoke('settings:save', input),
  analyze: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('analyze', payload),
  readClipboardForImport: (): Promise<{ parsed: WechatParseResult; raw: string }> =>
    ipcRenderer.invoke('clipboard:read-import'),
  onWechatImport: (
    callback: (payload: import('../main/wechat-parse').ParsedWechatImport) => void
  ): (() => void) => {
    const listener = (
      _e: unknown,
      payload: import('../main/wechat-parse').ParsedWechatImport
    ): void => callback(payload)
    ipcRenderer.on('wechat-import', listener)
    return () => ipcRenderer.removeListener('wechat-import', listener)
  },
  onWechatDirectUpdated: (callback: (conversationIds: string[]) => void): (() => void) => {
    const listener = (_e: unknown, conversationIds: string[]): void => callback(conversationIds)
    ipcRenderer.on('wechat-direct-updated', listener)
    return () => ipcRenderer.removeListener('wechat-direct-updated', listener)
  }
}

contextBridge.exposeInMainWorld('emora', api)
