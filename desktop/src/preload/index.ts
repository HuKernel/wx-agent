import { contextBridge, ipcRenderer } from 'electron'

import type { ParsedWechatImport } from '../main/wechat-parse'

export type WechatImportPayload = ParsedWechatImport

// channel 字符串与 src/main/index.ts 的 ipcMain.handle 保持一致。
const api = {
  getBackendUrl: (): Promise<string> => ipcRenderer.invoke('backend-url'),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: unknown): Promise<void> => ipcRenderer.invoke('settings:save', input),
  analyze: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('analyze', payload),
  readClipboardForImport: (): Promise<{ parsed: WechatImportPayload | null; raw: string }> =>
    ipcRenderer.invoke('clipboard:read-import'),
  onWechatImport: (callback: (payload: WechatImportPayload) => void): (() => void) => {
    const listener = (_e: unknown, payload: WechatImportPayload): void => callback(payload)
    ipcRenderer.on('wechat-import', listener)
    return () => ipcRenderer.removeListener('wechat-import', listener)
  }
}

contextBridge.exposeInMainWorld('emora', api)
