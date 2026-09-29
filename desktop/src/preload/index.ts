import { contextBridge, ipcRenderer } from 'electron'

// channel 字符串与 src/main/index.ts 的 ipcMain.handle 保持一致。
const api = {
  getBackendUrl: (): Promise<string> => ipcRenderer.invoke('backend-url'),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: unknown): Promise<void> => ipcRenderer.invoke('settings:save', input),
  analyze: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('analyze', payload)
}

contextBridge.exposeInMainWorld('emora', api)
