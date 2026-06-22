# 划词翻译深度学习功能设计

**日期：** 2026-06-22  
**范围：** chrome-extension + translation-server  
**权限：** Pro 专属

---

## 概述

在现有划词翻译卡片基础上，增加「深度学习」入口。用户翻译后点击该按钮，可获得三项 AI 驱动的学习辅助：TTS 朗读、词汇强化、语法解析。未开通 Pro 的用户点击后显示升级提示。

---

## 交互流程

```
用户划词 → 点击翻译小圆点
    ↓
翻译卡片弹出（现有）
    └── [✨ 深度学习] 按钮（新增，词汇区下方）
              ↓ 点击
        Pro 检测
        ├── 非 Pro → 复用现有 _explainUpgrade() overlay
        └── Pro → 展开深度学习面板（并行加载三个区块）
                  ├── 🔊 朗读区（立即渲染，TTS 按需触发）
                  ├── 💡 词汇强化（请求 /api/deep-learn，loading → 填入）
                  └── 📖 语法解析（同上，与词汇强化共享一次请求）
```

---

## 后端变更（translation-server）

### 新增端点 1：`POST /api/deep-learn`

**鉴权：** 需登录 + Pro 会员（复用现有 `require_pro` 装饰器）

**请求体：**
```json
{
  "text": "原文",
  "translated": "译文",
  "from": "en",
  "to": "zh"
}
```

**响应体：**
```json
{
  "vocab_enhancement": [
    {
      "word": "ephemeral",
      "examples": ["The beauty of cherry blossoms is ephemeral."],
      "synonyms": ["transient", "fleeting", "momentary"],
      "root": "希腊语 ephemeros，意为「仅存一天」"
    }
  ],
  "grammar": {
    "structure": "简单句 · 一般现在时",
    "breakdown": [
      { "text": "The system", "role": "主语" },
      { "text": "processes", "role": "谓语" },
      { "text": "all incoming requests", "role": "宾语" }
    ],
    "note": "这是一个简单句，谓语 processes 为一般现在时第三人称单数形式。"
  }
}
```

**实现：** LangChain `ChatOpenAI`（AiHubMix），单次 prompt 同时返回词汇强化和语法解析，JSON 格式输出。

**错误响应：**
- `401` — 未登录
- `403 { "error": "pro_required" }` — 非 Pro
- `400` — 缺少必要字段

---

### 新增端点 2：`POST /api/tts`

**鉴权：** 需登录 + Pro 会员

**请求体：**
```json
{
  "text": "要朗读的文本",
  "lang": "en"
}
```

**响应：** `Content-Type: audio/mpeg`，直接返回音频字节流。

**实现：** AiHubMix `gpt-4o-mini-tts`，voice 根据 `lang` 自动选择：
- `en` → `coral`
- `zh` → `alloy`

```python
from openai import OpenAI

client = OpenAI(
    api_key=config.ai.api_key,
    base_url="https://aihubmix.com/v1",
)

response = client.audio.speech.create(
    model="gpt-4o-mini-tts",
    voice="coral",
    input=text,
)
# 将 response.content 作为 audio/mpeg 返回
```

---

## 前端变更（content.js）

### 卡片结构变更

```
现有卡片
├── header（不变）
├── body - 翻译结果（不变）
├── footer - 复制按钮（不变）
├── 词汇区 vocabDiv（不变）
└── [✨ 深度学习] 按钮（新增）← deepLearnBtn
    └── 深度学习面板 deepLearnPanel（新增，默认隐藏）
        ├── 🔊 朗读区 ttsSection
        │   ├── [▶ 播放原文] originPlayBtn
        │   └── [▶ 播放译文] translatedPlayBtn
        ├── 💡 词汇强化区 vocabEnhanceSection（loading → 内容）
        └── 📖 语法解析区 grammarSection（loading → 内容）
```

### Pro 检测逻辑

与现有 `wordexplain` 保持一致，采用服务端检测：

`deepLearnBtn` 点击时：
1. 切换 `deepLearnPanel` 显示/隐藏
2. 首次展开 → 并行触发 `/api/deep-learn` 和等待用户点击播放的 TTS 请求
3. 若服务端返回 `{ "error": "pro_required" }` → 调用 `_explainUpgrade()` 显示升级提示，收起面板

### TTS 播放

- 点击「播放」按钮 → `chrome.runtime.sendMessage({ type: 'tts', text, lang })`
- background.js 调用 `/api/tts` → 返回音频字节数组
- content.js 用 `AudioContext.decodeAudioData` 播放（复用现有 `fetchaudio` 播放逻辑）

---

## 文件改动清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `translation-server/app/deep_learn.py` | 新增 | `/api/deep-learn` 和 `/api/tts` 路由 |
| `translation-server/app/__init__.py` | 修改 | 注册 deep_learn blueprint |
| `chrome-extension/content.js` | 修改 | 卡片新增深度学习按钮 + 面板 |
| `chrome-extension/background.js` | 修改 | 新增 `tts` 消息处理 |

---

## 不在本次范围内

- 词汇强化结果的本地缓存
- 深度学习历史记录
- 面板内容的收藏功能
- 移动端适配
