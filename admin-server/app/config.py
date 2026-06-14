from pathlib import Path

import yaml
from pydantic import BaseModel


class AdminCredentials(BaseModel):
    username: str = "admin"
    password: str = "admin123"


class MySQLConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 3306
    user: str = "root"
    password: str = ""
    database: str = "translation_db"


class AdminAppConfig(BaseModel):
    port: int = 15002
    session_secret: str = "admin-secret"
    admin: AdminCredentials = AdminCredentials()
    mysql: MySQLConfig = MySQLConfig()


def load_config(path: str = "config.yaml") -> AdminAppConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return AdminAppConfig(**data)


config: AdminAppConfig = load_config()
