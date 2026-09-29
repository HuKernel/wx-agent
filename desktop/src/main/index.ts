import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings } from './settings'
import { analyzeConversation, type AnalyzePayload } from './analyze'

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

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, input) => saveSettings(input))
  ipcMain.handle('analyze', (_e, payload: AnalyzePayload) => analyzeConversation(payload))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
