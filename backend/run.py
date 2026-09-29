"""PyInstaller 打包入口：由 Electron 主进程拉起（sidecar 模式）。

直接传 app 对象（而非 "app.main:app" 字符串），确保 PyInstaller 能静态分析到 app 包。

环境变量：
- EMORA_PORT  监听端口（默认 8000）
- EMORA_DATABASE_PATH  SQLite 路径（由 Electron 传入 userData 目录，默认开发路径）
"""

import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("EMORA_PORT", "8000"))
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )
