# Emora AI

AI 情商助手 —— 分析对话上下文、识别情绪与隐藏需求，生成 warm / casual / deep 三种风格的回复建议，帮助用户成为更好的沟通者。

## 技术栈

- **desktop/** — Electron + React + TypeScript + Tailwind CSS v4（electron-vite）
- **backend/** — Python + FastAPI（uvicorn）

## 快速启动

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install fastapi "uvicorn[standard]" pydantic-settings pytest httpx
.venv/Scripts/python -m pytest            # 运行测试
.venv/Scripts/python -m uvicorn app.main:app --reload
# GET http://127.0.0.1:8000/health -> {"status":"ok"}
```

### Desktop

```bash
cd desktop
npm install
npm run typecheck   # 类型检查
npm run dev         # 启动 Electron 窗口（开发模式）
npm run build       # 构建
```

## 开发说明

- 每个有意义的改动一个 commit，格式如 `feat: add emotion analysis module`。
- 密钥与环境变量通过 `.env` 配置，绝不提交（参考 `backend/.env.example`）。
