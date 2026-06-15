from pathlib import Path

import yaml
from pydantic import BaseModel


class AIConfig(BaseModel):
    api_key: str
    base_url: str
    model: str


class GoogleConfig(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""  # 留空则自动生成，建议显式配置


class MySQLConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 3306
    user: str = "root"
    password: str = ""
    database: str = "translation_db"


class AlipayConfig(BaseModel):
    app_id: str = ""
    private_key: str = ""
    public_key: str = ""
    notify_url: str = ""
    sandbox: bool = True


class AppConfig(BaseModel):
    ai: AIConfig
    port: int = 5000
    session_secret: str = "change-me-please-use-a-random-string"
    google: GoogleConfig = GoogleConfig()
    mysql: MySQLConfig = MySQLConfig()
    alipay: AlipayConfig = AlipayConfig()


def load_config(path: str = "config.yaml") -> AppConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return AppConfig(**data)


config: AppConfig = load_config()
