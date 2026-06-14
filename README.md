# 智能翻译

中英文智能互译服务，基于 Claude AI，提供 Web 界面与 Chrome 划词翻译插件。

## 功能

- **Web 界面**：输入中文或英文，600ms 防抖后自动翻译，自动识别语言方向
- **Chrome 插件**：
  - 弹窗翻译：点击插件图标，在弹窗中输入文字翻译
  - 右键翻译：选中文字后右键 → "翻译选中文字"
  - **划词翻译**：选中任意网页文字，点击蓝色 T 按钮，结果以悬浮卡片展示
- **重点词汇**：每次翻译同时返回 5–8 个关键词及对应译文

## 快速开始

### 1. 安装依赖

```bash
uv sync
```

### 2. 配置

复制配置模板并填入 API Key：

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`：

```yaml
ai:
  api_key: "YOUR_AIHUBMIX_API_KEY"   # https://aihubmix.com
  base_url: "https://aihubmix.com/v1"
  model: "claude-sonnet-4-5"
```

> `config.yaml` 已加入 `.gitignore`，不会被提交。

### 3. 启动后端

```bash
uv run python main.py
```

服务默认运行在 `http://127.0.0.1:5000`。

### 4. 安装 Chrome 插件

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `chrome-extension/` 目录

> 修改插件代码后需在 `chrome://extensions` 点击「重新加载」。

## API

### `POST /translate`

**请求体：**

```json
{ "text": "需要翻译的文本" }
```

**响应：**

```json
{
  "translated": "翻译结果",
  "from": "en",
  "to": "zh",
  "vocab": [
    { "word": "example", "translation": "示例" }
  ]
}
```

## 项目结构

```
├── app/
│   ├── __init__.py      # 应用工厂 create_app()
│   ├── config.py        # 读取 config.yaml，Pydantic 类型验证
│   ├── models.py        # 数据模型
│   ├── translator.py    # Claude AI 翻译逻辑
│   ├── routes.py        # Flask 路由
│   └── logger.py        # 日志（按天滚动，保留 30 天）
├── chrome-extension/    # Chrome MV3 插件
├── templates/
│   └── index.html       # Web 界面
├── config.yaml          # 本地配置（gitignored）
├── config.example.yaml  # 配置模板
└── main.py              # 启动入口
```

## 依赖

| 包 | 用途 |
|----|------|
| Flask | Web 框架 |
| langchain-openai | Claude AI 客户端 |
| pydantic | 配置与响应数据验证 |
| pyyaml | 读取 config.yaml |
