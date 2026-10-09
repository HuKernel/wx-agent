import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings } from './settings'
import { analyzeConversation, type AnalyzePayload } from './analyze'
import { getBackendUrl, startBackend, stopBackend } from './backend'
import { readClipboardForImport, startClipboardWatch } from './wechat-clipboard'
import { startWechatDirectWatch } from './wechat-direct'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960, // 三栏布局（侧栏64+会话列表+主区）的下限，再小布局挤坏
    minHeight: 600,
    title: 'Emora AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 无菜单栏后保留 devtools 排障入口（复制/粘贴等编辑快捷键是 Chromium 内置，不受影响）
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
    if (input.type === 'keyDown' && input.key === 'r' && input.control) {
      win.webContents.reload()
    }
  })
}

app.whenReady().then(async () => {
  await startBackend()

  ipcMain.handle('backend-url', () => getBackendUrl())
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, input) => {
    saveSettings(input)
    startWechatDirectWatch() // 开关或数据目录可能变了；内部自判 wechatDirect
  })
  ipcMain.handle('analyze', (_e, payload: AnalyzePayload) => analyzeConversation(payload))
  ipcMain.handle('clipboard:read-import', () => readClipboardForImport())

  startClipboardWatch()
  startWechatDirectWatch()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopBackend()
})
