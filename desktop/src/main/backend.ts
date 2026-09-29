import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { existsSync } from 'fs'
import { join } from 'path'
import { get as httpGet } from 'http'

// Sidecar 模式：打包后的后端 exe 随应用分发，由主进程拉起（随机端口 + 健康检查门控）。
// dev 模式：无 sidecar，回退到手动 uvicorn（默认 127.0.0.1:8000）。

let child: ChildProcess | null = null
let backendUrl = 'http://127.0.0.1:8000'

export function getBackendUrl(): string {
  return backendUrl
}

function sidecarExe(): string | null {
  if (process.env.EMORA_SIDECAR_DIR) {
    return join(process.env.EMORA_SIDECAR_DIR, 'emora-backend.exe')
  }
  if (!process.resourcesPath) return null
  const p = join(process.resourcesPath, 'sidecar', 'emora-backend', 'emora-backend.exe')
  return existsSync(p) ? p : null
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => (port ? resolve(port) : reject(new Error('no free port'))))
    })
  })
}

function waitHealthy(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const probe = (): void => {
      const req = httpGet(`${url}/health`, (resp) => {
        resp.resume()
        if (resp.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.setTimeout(1500, () => {
        req.destroy()
        retry()
      })
    }
    const retry = (): void => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('后端服务启动超时'))
      } else {
        setTimeout(probe, 300)
      }
    }
    probe()
  })
}

export async function startBackend(): Promise<void> {
  const exe = sidecarExe()
  if (!exe) {
    backendUrl = process.env.EMORA_BACKEND_URL ?? backendUrl
    return
  }

  const port = await getFreePort()
  backendUrl = `http://127.0.0.1:${port}`
  child = spawn(exe, [], {
    env: {
      ...process.env,
      EMORA_PORT: String(port),
      EMORA_DATABASE_PATH: join(app.getPath('userData'), 'emora.db')
    },
    stdio: 'ignore',
    windowsHide: true
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`backend sidecar exited with ${code}`)
  })
  await waitHealthy(backendUrl, 30000)
}

export function stopBackend(): void {
  if (child && !child.killed) child.kill()
  child = null
}
