from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Emora AI"
    debug: bool = False
    # 桌面端渲染进程的开发服务器来源（electron-vite 默认 5173）
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "EMORA_", "env_file": ".env"}


settings = Settings()
