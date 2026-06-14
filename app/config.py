from pathlib import Path

import yaml
from pydantic import BaseModel


class AIConfig(BaseModel):
    api_key: str
    base_url: str
    model: str


class BaiduConfig(BaseModel):
    api_key: str
    app_id: str


class AppConfig(BaseModel):
    ai: AIConfig
    baidu: BaiduConfig


def load_config(path: str = "config.yaml") -> AppConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return AppConfig(**data)


config: AppConfig = load_config()
