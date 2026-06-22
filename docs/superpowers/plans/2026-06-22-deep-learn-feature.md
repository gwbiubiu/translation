# 划词翻译深度学习功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在划词翻译卡片中新增「深度学习」按钮，Pro 用户点击后展开 TTS 朗读、词汇强化、语法解析三个区块。

**Architecture:** 后端新增 `deep_learn.py` 模块，包含 AI 分析函数和两个 Flask 路由（`/api/deep-learn`、`/api/tts`）。前端 background.js 新增 tts 消息处理，content.js 在翻译卡片末尾追加深度学习按钮和可展开面板，首次展开时并行发起 AI 分析和等待 TTS 点击触发。

**Tech Stack:** Flask, LangChain `ChatOpenAI` (AiHubMix), `openai.OpenAI` TTS (`gpt-4o-mini-tts`), Chrome MV3 Extension

## Global Constraints

- Pro 鉴权：用 `login_required` 装饰器 + 手动 Pro 检查（`get_user_by_id` + membership 过期校验），非 Pro 返回 `{"error": "pro_required"}` + HTTP 403
- AiHubMix 配置：`api_key=config.ai.api_key`，`base_url=config.ai.base_url`（已在 config.yaml 中）
- TTS model：`gpt-4o-mini-tts`，en → voice `coral`，zh → voice `alloy`
- 所有 LLM 响应必须是纯 JSON（无 markdown 包裹），沿用 `_strip_code_block()` 处理
- content.js 内所有 DOM 元素样式必须以 `all:initial` 开头，防止页面 CSS 污染
- Chrome Extension：改动后需在 `chrome://extensions` 手动重载

---

## File Structure

```
translation-server/
├── app/
│   ├── deep_learn.py          ← 新增：AI 分析函数 + Blueprint (/api/deep-learn, /api/tts)
│   └── __init__.py            ← 修改：注册 deep_learn_bp
├── tests/
│   └── test_deep_learn.py     ← 新增：单元测试（mock LLM + TTS）

chrome-extension/
├── background.js              ← 修改：新增 tts 消息处理
└── content.js                 ← 修改：翻译卡片新增深度学习按钮 + 面板
```

---

## Task 1: 后端 — deep_learn 模块（AI 函数 + Blueprint + 注册）

**Files:**
- Create: `translation-server/app/deep_learn.py`
- Modify: `translation-server/app/__init__.py`
- Create: `translation-server/tests/__init__.py`（空文件）
- Create: `translation-server/tests/test_deep_learn.py`

**Interfaces:**
- Produces:
  - `deep_learn(text, translated, from_lang, to_lang) -> dict` — 返回 `{vocab_enhancement, grammar}`
  - `text_to_speech(text, lang) -> bytes` — 返回 audio/mpeg 字节
  - Blueprint `deep_learn_bp` 注册到 Flask app

---

- [ ] **Step 1: 创建测试文件（先写测试）**

创建 `translation-server/tests/__init__.py`（空文件），再创建 `translation-server/tests/test_deep_learn.py`：

```python
import json
from unittest.mock import MagicMock, patch

import pytest


@patch("app.deep_learn._llm")
def test_deep_learn_returns_expected_keys(mock_llm):
    mock_llm.invoke.return_value.content = json.dumps({
        "vocab_enhancement": [
            {
                "word": "ephemeral",
                "examples": ["The beauty is ephemeral.", "Fame can be ephemeral."],
                "synonyms": ["transient", "fleeting"],
                "root": "希腊语 ephemeros，意为「仅存一天」",
            }
        ],
        "grammar": {
            "structure": "简单句·一般现在时",
            "breakdown": [
                {"text": "The system", "role": "主语"},
                {"text": "processes", "role": "谓语"},
                {"text": "all requests", "role": "宾语"},
            ],
            "note": "这是一个简单句，谓语 processes 为一般现在时。",
        },
    })

    from app.deep_learn import deep_learn

    result = deep_learn("The system processes all requests.", "系统处理所有请求。", "en", "zh")
    assert "vocab_enhancement" in result
    assert "grammar" in result
    assert isinstance(result["vocab_enhancement"], list)
    assert "structure" in result["grammar"]
    assert "breakdown" in result["grammar"]


@patch("app.deep_learn._tts_client")
def test_text_to_speech_returns_bytes(mock_client):
    mock_response = MagicMock()
    mock_response.content = b"fake_audio_bytes"
    mock_client.audio.speech.create.return_value = mock_response

    from app.deep_learn import text_to_speech

    result = text_to_speech("Hello world", "en")
    assert isinstance(result, bytes)
    assert result == b"fake_audio_bytes"
    mock_client.audio.speech.create.assert_called_once_with(
        model="gpt-4o-mini-tts",
        voice="coral",
        input="Hello world",
    )


@patch("app.deep_learn._tts_client")
def test_text_to_speech_uses_alloy_for_chinese(mock_client):
    mock_response = MagicMock()
    mock_response.content = b"fake_audio_bytes"
    mock_client.audio.speech.create.return_value = mock_response

    from app.deep_learn import text_to_speech

    text_to_speech("你好世界", "zh")
    mock_client.audio.speech.create.assert_called_once_with(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input="你好世界",
    )
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd translation-server
uv run pytest tests/test_deep_learn.py -v
```

预期：`ModuleNotFoundError: No module named 'app.deep_learn'`

- [ ] **Step 3: 创建 `translation-server/app/deep_learn.py`**

```python
import json
from datetime import datetime, timezone

from flask import Blueprint, Response, g, jsonify, request
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from openai import OpenAI

from .config import config
from .database import get_user_by_id
from .logger import get_logger
from .translator import _strip_code_block
from .user import login_required

logger = get_logger(__name__)

_llm = ChatOpenAI(
    model=config.ai.model,
    api_key=config.ai.api_key,
    base_url=config.ai.base_url,
)

_tts_client = OpenAI(
    api_key=config.ai.api_key,
    base_url=config.ai.base_url,
)

_DEEP_LEARN_PROMPT = """You are an English learning assistant helping a Chinese speaker understand text.

Given source text, its translation, and language codes, return a JSON with:
1. vocab_enhancement: up to 5 key English words (from English side of the text). For each word:
   - word: the English word
   - examples: array of 2 short natural English example sentences
   - synonyms: array of 2-3 English synonyms
   - root: one sentence in Chinese explaining the word root or etymology

2. grammar: sentence structure analysis of the source text:
   - structure: sentence type in Chinese (e.g. "简单句·一般现在时")
   - breakdown: array of {"text": "...", "role": "..."} where role is Chinese grammatical term
   - note: 1-2 sentences in Chinese about key grammar points

If source text is fewer than 4 words, return empty vocab_enhancement list and a minimal grammar object.

Respond with ONLY valid JSON, no markdown fence:
{
  "vocab_enhancement": [{"word":"...","examples":["...","..."],"synonyms":["...","..."],"root":"..."}],
  "grammar": {"structure":"...","breakdown":[{"text":"...","role":"..."}],"note":"..."}
}"""


def deep_learn(text: str, translated: str, from_lang: str, to_lang: str) -> dict:
    logger.info("深度学习请求 [%s→%s] 文本长度=%d", from_lang, to_lang, len(text))
    user_msg = (
        f"source_text: {text}\n"
        f"translated: {translated}\n"
        f"from_lang: {from_lang}\n"
        f"to_lang: {to_lang}"
    )
    response = _llm.invoke([
        SystemMessage(content=_DEEP_LEARN_PROMPT),
        HumanMessage(content=user_msg),
    ])
    raw = _strip_code_block(response.content)
    logger.debug("深度学习响应: %s", raw[:400])
    return json.loads(raw)


def text_to_speech(text: str, lang: str) -> bytes:
    voice = "coral" if lang == "en" else "alloy"
    logger.info("TTS 请求 lang=%s voice=%s 文本长度=%d", lang, voice, len(text))
    response = _tts_client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice=voice,
        input=text,
    )
    return response.content


def _check_pro(user_id: int):
    """Return (is_pro, error_response). error_response is None if pro."""
    user = get_user_by_id(user_id)
    if not user:
        return False, (jsonify({"error": "用户不存在"}), 404)
    membership = user.get("membership", "free")
    expires_at = user.get("membership_expires_at")
    if membership == "pro" and expires_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires_at <= now:
            membership = "free"
    if membership != "pro":
        return False, (jsonify({"error": "pro_required"}), 403)
    return True, None


deep_learn_bp = Blueprint("deep_learn", __name__)


@deep_learn_bp.route("/api/deep-learn", methods=["POST", "OPTIONS"])
@login_required
def deep_learn_api():
    if request.method == "OPTIONS":
        return "", 204

    is_pro, err = _check_pro(g.user_id)
    if not is_pro:
        return err

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    translated = body.get("translated", "").strip()
    from_lang = body.get("from", "")
    to_lang = body.get("to", "")

    if not text or not translated:
        return jsonify({"error": "缺少参数"}), 400

    try:
        result = deep_learn(text, translated, from_lang, to_lang)
        return jsonify(result)
    except Exception as e:
        logger.exception("深度学习异常: %s", e)
        return jsonify({"error": str(e)}), 500


@deep_learn_bp.route("/api/tts", methods=["POST", "OPTIONS"])
@login_required
def tts_api():
    if request.method == "OPTIONS":
        return "", 204

    is_pro, err = _check_pro(g.user_id)
    if not is_pro:
        return err

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    lang = body.get("lang", "en")

    if not text:
        return jsonify({"error": "缺少参数"}), 400

    try:
        audio_bytes = text_to_speech(text, lang)
        return Response(audio_bytes, mimetype="audio/mpeg")
    except Exception as e:
        logger.exception("TTS 异常: %s", e)
        return jsonify({"error": str(e)}), 500
```

- [ ] **Step 4: 注册 Blueprint — 修改 `translation-server/app/__init__.py`**

在文件顶部 import 区追加：
```python
from .deep_learn import deep_learn_bp
```

在 `app.register_blueprint(user_bp)` 之后追加：
```python
app.register_blueprint(deep_learn_bp)
```

最终 `create_app()` 中注册顺序：
```python
app.register_blueprint(bp)
app.register_blueprint(auth_bp)
app.register_blueprint(user_bp)
app.register_blueprint(deep_learn_bp)
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd translation-server
uv run pytest tests/test_deep_learn.py -v
```

预期输出：
```
tests/test_deep_learn.py::test_deep_learn_returns_expected_keys PASSED
tests/test_deep_learn.py::test_text_to_speech_returns_bytes PASSED
tests/test_deep_learn.py::test_text_to_speech_uses_alloy_for_chinese PASSED
3 passed
```

- [ ] **Step 6: 手动验证服务启动正常**

```bash
cd translation-server
uv run python main.py
```

预期：服务正常启动，无 import 错误。

- [ ] **Step 7: Commit**

```bash
cd translation-server
git add app/deep_learn.py app/__init__.py tests/__init__.py tests/test_deep_learn.py
git commit -m "feat: add deep-learn and tts backend endpoints"
```

---

## Task 2: Chrome Extension — background.js TTS 消息处理

**Files:**
- Modify: `chrome-extension/background.js`

**Interfaces:**
- Consumes: `chrome.runtime.onMessage` 消息 `{ type: 'tts', text: string, lang: string }`
- Produces: `sendResponse({ ok: true, data: number[] })` — audio/mpeg 字节数组；或 `{ ok: false, data: { error: string } }`

---

- [ ] **Step 1: 在 background.js 的 `onMessage` 监听器中追加 tts 分支**

在 `if (msg.type === 'fetchaudio')` 代码块之后，`chrome.runtime.onInstalled` 之前，追加：

```javascript
  if (msg.type === 'tts') {
    chrome.storage.sync.get('apiBase', function (s) {
      var apiBase = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
      fetch(apiBase + '/api/tts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text, lang: msg.lang }),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (d) {
              sendResponse({ ok: false, data: d });
            });
          }
          return res.arrayBuffer().then(function (buf) {
            sendResponse({ ok: true, data: Array.from(new Uint8Array(buf)) });
          });
        })
        .catch(function (e) {
          sendResponse({ ok: false, data: { error: e.message } });
        });
    });
    return true;
  }
```

- [ ] **Step 2: 重载扩展并手动验证消息通道**

1. 打开 `chrome://extensions`，点击「重新加载」
2. 打开任意网页，打开 DevTools Console，运行：
```javascript
chrome.runtime.sendMessage(
  { type: 'tts', text: 'Hello world', lang: 'en' },
  function(r) { console.log('tts response:', r); }
);
```
预期：`{ ok: true, data: [...] }` 或 `{ ok: false, data: { error: 'unauthorized' } }`（未登录时）

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/background.js
git commit -m "feat: add tts message handler to background.js"
```

---

## Task 3: Chrome Extension — content.js 深度学习按钮与面板

**Files:**
- Modify: `chrome-extension/content.js`

**Interfaces:**
- Consumes:
  - `chrome.runtime.sendMessage({ type: 'tts', text, lang })` → `{ ok, data }` (Task 2)
  - `fetch('/api/deep-learn', ...)` → `{ vocab_enhancement, grammar }` (Task 1)
  - `card._origText` — 原文
  - `card._langFrom`, `card._langTo` — 语言方向
- Produces: 卡片末尾新增深度学习按钮和展开面板

---

- [ ] **Step 1: 在 `showCard()` 内存储译文到 card**

在 `showCard()` 函数内，`if (!loading && from)` 块的开头（`card._langFrom = from;` 之前）追加：

```javascript
      card._bodyText = text;
```

- [ ] **Step 2: 在 card 末尾追加深度学习按钮和面板**

在 `showCard()` 内，`card._vocabDiv = vocabDiv;` 之后（`document.documentElement.appendChild(card)` 之前）追加：

```javascript
      // ── Deep Learn button ──────────────────────────────────────────
      var deepLearnBtn = document.createElement('button');
      deepLearnBtn.style.cssText =
        'all:initial;display:block !important;width:100%;' +
        'padding:9px 16px;background:#f5f3ff;border:none;' +
        'border-top:1px solid #ede9fe;cursor:pointer;' +
        'font-size:11.5px;font-weight:600;color:#6366f1;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'text-align:center;letter-spacing:0.02em;' +
        'transition:background 0.15s ease;';
      deepLearnBtn.textContent = '✨ 深度学习';
      deepLearnBtn.addEventListener('mouseenter', function () {
        deepLearnBtn.style.background = '#ede9fe';
      });
      deepLearnBtn.addEventListener('mouseleave', function () {
        deepLearnBtn.style.background = '#f5f3ff';
      });
      card.appendChild(deepLearnBtn);

      // ── Deep Learn Panel ───────────────────────────────────────────
      var deepLearnPanel = document.createElement('div');
      deepLearnPanel.style.cssText = 'all:initial;display:none !important;';
      card.appendChild(deepLearnPanel);
      card._deepLearnPanel = deepLearnPanel;
      card._deepLearnOpen = false;
      card._deepLearnLoaded = false;

      deepLearnBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!card._deepLearnOpen) {
          card._deepLearnOpen = true;
          deepLearnPanel.style.cssText =
            'all:initial;display:block !important;border-top:1px solid #ede9fe;';
          if (!card._deepLearnLoaded) {
            card._deepLearnLoaded = true;
            _renderDeepLearnLoading(deepLearnPanel, card);
            _loadDeepLearn(deepLearnPanel, card);
          }
        } else {
          card._deepLearnOpen = false;
          deepLearnPanel.style.cssText = 'all:initial;display:none !important;';
        }
      });
```

- [ ] **Step 3: 在 content.js IIFE 内添加深度学习辅助函数**

在 `// ── Utils ──` 注释之前（IIFE 末尾的 `})();` 之前）追加以下函数：

```javascript
  // ── Deep Learn helpers ─────────────────────────────────────────────

  function _playTTS(text, lang, btn, originalLabel) {
    btn.disabled = true;
    btn.textContent = '▶ 加载中…';
    chrome.runtime.sendMessage({ type: 'tts', text: text, lang: lang }, function (resp) {
      btn.disabled = false;
      btn.textContent = originalLabel;
      if (!resp || !resp.ok) return;
      try {
        var buf = new Uint8Array(resp.data).buffer;
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(buf).then(function (decoded) {
          var src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.start(0);
        });
      } catch (ex) {}
    });
  }

  function _makeSection(title) {
    var sec = document.createElement('div');
    sec.style.cssText =
      'all:initial;display:block !important;padding:12px 14px;' +
      'border-bottom:1px solid #f0f2f5;';

    var hdr = document.createElement('div');
    hdr.style.cssText =
      'all:initial;display:flex !important;align-items:center;gap:6px;margin-bottom:8px;';

    var bar = document.createElement('span');
    bar.style.cssText =
      'all:initial;display:inline-block !important;width:3px;height:11px;' +
      'background:linear-gradient(to bottom,#818cf8,#4f46e5);border-radius:2px;flex-shrink:0;';

    var titleEl = document.createElement('span');
    titleEl.style.cssText =
      'all:initial;font-size:10px;font-weight:700;color:#6b7280;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'text-transform:uppercase;letter-spacing:0.06em;';
    titleEl.textContent = title;

    hdr.appendChild(bar);
    hdr.appendChild(titleEl);
    sec.appendChild(hdr);
    return sec;
  }

  function _renderDeepLearnLoading(panel, card) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    // TTS section — renders immediately, no loading needed
    var ttsSection = _makeSection('🔊 朗读');
    var ttsRow = document.createElement('div');
    ttsRow.style.cssText = 'all:initial;display:flex !important;gap:8px;flex-wrap:wrap;';

    function _makePlayBtn(label) {
      var btn = document.createElement('button');
      btn.style.cssText =
        'all:initial;display:inline-flex !important;align-items:center;gap:5px;' +
        'border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;color:#6366f1;' +
        'font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'transition:background 0.15s ease;';
      btn.textContent = label;
      btn.addEventListener('mouseenter', function () { btn.style.background = '#ede9fe'; });
      btn.addEventListener('mouseleave', function () { btn.style.background = '#f9fafb'; });
      return btn;
    }

    var origBtn = _makePlayBtn('▶ 播放原文');
    var transBtn = _makePlayBtn('▶ 播放译文');

    origBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _playTTS(card._origText || '', card._langFrom || 'en', origBtn, '▶ 播放原文');
    });
    transBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _playTTS(card._bodyText || '', card._langTo || 'zh', transBtn, '▶ 播放译文');
    });

    ttsRow.appendChild(origBtn);
    ttsRow.appendChild(transBtn);
    ttsSection.appendChild(ttsRow);
    panel.appendChild(ttsSection);

    // Vocab enhance section — loading state
    var vocabSection = _makeSection('💡 词汇强化');
    var vocabLoading = document.createElement('span');
    vocabLoading.style.cssText =
      'all:initial;font-size:11px;color:#9ca3af;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    vocabLoading.textContent = '分析中…';
    vocabSection.appendChild(vocabLoading);
    panel.appendChild(vocabSection);
    panel._vocabSection = vocabSection;

    // Grammar section — loading state
    var gramSection = _makeSection('📖 语法解析');
    var gramLoading = document.createElement('span');
    gramLoading.style.cssText =
      'all:initial;font-size:11px;color:#9ca3af;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    gramLoading.textContent = '分析中…';
    gramSection.appendChild(gramLoading);
    panel.appendChild(gramSection);
    panel._gramSection = gramSection;
  }

  function _loadDeepLearn(panel, card) {
    chrome.storage.sync.get('apiBase', function (s) {
      var apiBase = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
      fetch(apiBase + '/api/deep-learn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: card._origText || '',
          translated: card._bodyText || '',
          from: card._langFrom || '',
          to: card._langTo || '',
        }),
      })
        .then(function (res) {
          return res.json().then(function (d) { return { ok: res.ok, data: d }; });
        })
        .then(function (r) {
          if (!r.ok) {
            if (r.data && r.data.error === 'pro_required') {
              _renderDeepLearnUpgrade(panel);
            } else {
              _renderDeepLearnError(panel, r.data && r.data.error || '请求失败');
            }
            return;
          }
          _fillVocabEnhance(panel._vocabSection, r.data.vocab_enhancement || []);
          _fillGrammar(panel._gramSection, r.data.grammar || {});
        })
        .catch(function () {
          _renderDeepLearnError(panel, '网络错误，请稍后重试');
        });
    });
  }

  function _fillVocabEnhance(section, items) {
    // Remove loading text (all children after header)
    var hdr = section.firstChild;
    while (section.lastChild !== hdr) section.removeChild(section.lastChild);

    if (!items.length) {
      var empty = document.createElement('span');
      empty.style.cssText =
        'all:initial;font-size:11px;color:#9ca3af;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      empty.textContent = '未提取到关键词汇';
      section.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var block = document.createElement('div');
      block.style.cssText =
        'all:initial;display:block !important;margin-bottom:10px;';

      var wordLine = document.createElement('div');
      wordLine.style.cssText =
        'all:initial;display:flex !important;align-items:baseline;gap:8px;margin-bottom:4px;';

      var chip = document.createElement('span');
      chip.style.cssText =
        'all:initial;display:inline-block !important;background:#eff6ff;color:#3730a3;' +
        'font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:20px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;border:1px solid #c7d2fe;';
      chip.textContent = item.word || '';

      var synonyms = document.createElement('span');
      synonyms.style.cssText =
        'all:initial;font-size:10.5px;color:#818cf8;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      synonyms.textContent = (item.synonyms || []).join(' · ');

      wordLine.appendChild(chip);
      wordLine.appendChild(synonyms);
      block.appendChild(wordLine);

      if (item.root) {
        var root = document.createElement('div');
        root.style.cssText =
          'all:initial;font-size:10.5px;color:#6b7280;margin-bottom:3px;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        root.textContent = '📌 ' + item.root;
        block.appendChild(root);
      }

      (item.examples || []).forEach(function (ex) {
        var exEl = document.createElement('div');
        exEl.style.cssText =
          'all:initial;font-size:10.5px;color:#374151;line-height:1.6;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'padding-left:8px;border-left:2px solid #c7d2fe;margin-top:2px;';
        exEl.textContent = ex;
        block.appendChild(exEl);
      });

      section.appendChild(block);
    });
  }

  function _fillGrammar(section, grammar) {
    var hdr = section.firstChild;
    while (section.lastChild !== hdr) section.removeChild(section.lastChild);

    if (!grammar.structure) {
      var empty = document.createElement('span');
      empty.style.cssText =
        'all:initial;font-size:11px;color:#9ca3af;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      empty.textContent = '未获取到语法信息';
      section.appendChild(empty);
      return;
    }

    var structEl = document.createElement('div');
    structEl.style.cssText =
      'all:initial;font-size:11px;font-weight:600;color:#4338ca;margin-bottom:8px;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    structEl.textContent = grammar.structure;
    section.appendChild(structEl);

    if (grammar.breakdown && grammar.breakdown.length) {
      var bdRow = document.createElement('div');
      bdRow.style.cssText =
        'all:initial;display:flex !important;flex-wrap:wrap;gap:6px;margin-bottom:8px;';

      grammar.breakdown.forEach(function (part) {
        var chunk = document.createElement('div');
        chunk.style.cssText =
          'all:initial;display:inline-flex !important;flex-direction:column;' +
          'align-items:center;gap:2px;';

        var textEl = document.createElement('span');
        textEl.style.cssText =
          'all:initial;font-size:11px;color:#111827;font-weight:500;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'background:#f0f9ff;padding:2px 6px;border-radius:4px;white-space:nowrap;';
        textEl.textContent = part.text || '';

        var roleEl = document.createElement('span');
        roleEl.style.cssText =
          'all:initial;font-size:9.5px;color:#818cf8;font-weight:600;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        roleEl.textContent = part.role || '';

        chunk.appendChild(textEl);
        chunk.appendChild(roleEl);
        bdRow.appendChild(chunk);
      });
      section.appendChild(bdRow);
    }

    if (grammar.note) {
      var noteEl = document.createElement('div');
      noteEl.style.cssText =
        'all:initial;font-size:10.5px;color:#6b7280;line-height:1.6;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      noteEl.textContent = '💬 ' + grammar.note;
      section.appendChild(noteEl);
    }
  }

  function _renderDeepLearnUpgrade(panel) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    var wrap = document.createElement('div');
    wrap.style.cssText =
      'all:initial;display:flex !important;flex-direction:column;gap:6px;' +
      'padding:14px 16px;align-items:flex-start;';

    var msg = document.createElement('span');
    msg.style.cssText =
      'all:initial;font-size:12px;color:#6b7280;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    msg.textContent = '深度学习功能仅限 Pro 会员使用';

    var link = document.createElement('button');
    link.style.cssText =
      'all:initial;cursor:pointer;font-size:12px;color:#6366f1;font-weight:600;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'background:none;border:none;padding:0;';
    link.textContent = '→ 开通 Pro 会员';
    link.addEventListener('click', function () {
      chrome.storage.sync.get('apiBase', function (s) {
        var base = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
        window.open(base + '/dashboard', '_blank');
      });
    });

    wrap.appendChild(msg);
    wrap.appendChild(link);
    panel.appendChild(wrap);
  }

  function _renderDeepLearnError(panel, message) {
    if (panel._vocabSection) {
      var hdr = panel._vocabSection.firstChild;
      while (panel._vocabSection.lastChild !== hdr) {
        panel._vocabSection.removeChild(panel._vocabSection.lastChild);
      }
      var err = document.createElement('span');
      err.style.cssText =
        'all:initial;font-size:11px;color:#ef4444;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      err.textContent = message;
      panel._vocabSection.appendChild(err);
    }
    if (panel._gramSection) {
      var hdr2 = panel._gramSection.firstChild;
      while (panel._gramSection.lastChild !== hdr2) {
        panel._gramSection.removeChild(panel._gramSection.lastChild);
      }
      var err2 = document.createElement('span');
      err2.style.cssText =
        'all:initial;font-size:11px;color:#ef4444;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      err2.textContent = message;
      panel._gramSection.appendChild(err2);
    }
  }
```

- [ ] **Step 4: 重载扩展并手动验证完整流程**

1. 打开 `chrome://extensions`，点击「重新加载」
2. 打开任意英文网页（例如 Wikipedia）
3. 划选一段英文（例如 "The system processes all incoming requests."）
4. 点击蓝色 T 圆点，等待翻译卡片出现
5. 确认卡片底部有「✨ 深度学习」按钮
6. 点击按钮：
   - 非 Pro 用户：面板展开并显示「深度学习功能仅限 Pro 会员使用」+ 升级链接
   - Pro 用户：展开后 TTS 两个播放按钮立即可点击；词汇强化和语法解析显示「分析中…」→ 加载完成后填入内容
7. 点击「▶ 播放原文」确认有发音
8. 再次点击「✨ 深度学习」确认面板可收起

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/content.js
git commit -m "feat: add deep-learn panel to translation card in content.js"
```

---

## 验收标准

- [ ] `uv run pytest tests/test_deep_learn.py -v` 全部通过
- [ ] 服务启动无报错，`/api/deep-learn` 和 `/api/tts` 路由已注册
- [ ] 非 Pro 用户点击深度学习 → 显示升级提示
- [ ] Pro 用户点击深度学习 → 加载词汇强化 + 语法解析 + TTS 可播放
- [ ] 「✨ 深度学习」按钮可重复点击展开/收起
