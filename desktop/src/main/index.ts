import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings } from './settings'
import { analyzeConversation, type AnalyzePayload } from './analyze'
import { getBackendUrl, startBackend, stopBackend } from './backend'
import { readClipboardForImport, startClipboardWatch } from './wechat-clipboard'
import { startWechatDirectWatch } from './wechat-direct'

// Electron 默认菜单为英文硬编码，这里替换为中文菜单
function setupMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Emora AI',
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
}

app.whenReady().then(async () => {
  await startBackend()
  setupMenu()

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
