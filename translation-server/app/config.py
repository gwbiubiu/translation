from pathlib import Path

import yaml
from pydantic import BaseModel


class AIConfig(BaseModel):
    api_key: str
    base_url: str
    model: str


class WeChatConfig(BaseModel):
    app_id: str = ""
    app_secret: str = ""


class MySQLConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 3306
    user: str = "root"
    password: str = ""
    database: str = "translation_db"


class AppConfig(BaseModel):
    ai: AIConfig
    port: int = 5000
    session_secret: str = "change-me-please-use-a-random-string"
    wechat: WeChatConfig = WeChatConfig()
    mysql: MySQLConfig = MySQLConfig()


def load_config(path: str = "config.yaml") -> AppConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return AppConfig(**data)


config: AppConfig = load_config()
