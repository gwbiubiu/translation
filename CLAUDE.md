# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the backend server
uv run python main.py

# Run a one-off translation test
uv run python -c "from app.translator import translate; import json; print(json.dumps(translate('hello world').to_dict(), ensure_ascii=False))"

# Install / sync dependencies
uv sync

# Add a dependency
uv add <package>
```

## Architecture

This is a Flask-based Chinese↔English translation service backed by Claude AI (via AIHubMix), plus a Chrome MV3 extension that consumes it.

### Backend (`app/` package)

Flask application factory pattern — `create_app()` in `app/__init__.py` registers the Blueprint and CORS headers.

```
app/
├── __init__.py     # create_app() factory, CORS after_request hook
├── config.py       # Loads config.yaml → typed AppConfig (Pydantic)
├── models.py       # VocabItem, TranslationOutput, TranslationResponse
├── translator.py   # ChatOpenAI client + translate() function
├── routes.py       # Blueprint: GET / and POST /translate
└── logger.py       # TimedRotatingFileHandler, writes to logs/app.log
```

Entry point is `main.py` (calls `create_app()`). Configuration is read from `config.yaml` (never from env vars).

**Translation flow:** `POST /translate` → `routes.py` → `translator.translate()` → Claude via LangChain `ChatOpenAI` → returns `{translated, from, to, vocab[]}` where `vocab` is 5–8 key terms extracted from the source text in the same AI call.

The AI returns raw JSON (sometimes wrapped in ` ```json ``` ` code fences); `_strip_code_block()` in `translator.py` handles both cases before Pydantic validation.

### Config (`config.yaml`)

```yaml
baidu:          # Legacy keys, kept for reference
  api_key: ...
  app_id: ...
ai:
  api_key: ...  # AIHubMix key (proxies Claude)
  base_url: "https://aihubmix.com/v1"
  model: "claude-sonnet-4-5"
```

`config.yaml` is gitignored. Use `config.example.yaml` as the template.

### Chrome Extension (`chrome-extension/`)

Manifest V3 extension with three JS contexts and distinct fetch capabilities:

| File | Context | Notes |
|------|---------|-------|
| `popup.js` | Extension page | Direct fetch to `http://127.0.0.1:5000` — works fine |
| `content.js` | Content script | Injected into every page; handles text-selection dot + translation card UI |
| `background.js` | Service worker | Context menu right-click; Chrome PNA may block localhost fetches |

**Content script flow:** `mouseup` → capture cursor coords → 10ms timeout to read `window.getSelection()` → show blue "T" dot at `position:fixed` → click dot → `POST /translate` → render card overlay with translation + vocab.

All injected DOM elements use `all:initial` CSS reset and `position:fixed !important` with viewport-relative coordinates (`e.clientX/Y`) to avoid interference from host page styles.

**CORS:** The Flask server sets `Access-Control-Allow-Private-Network: true` (required for Chrome Private Network Access when fetching from content scripts to localhost).

After modifying any extension file, reload the extension at `chrome://extensions`.

The backend URL defaults to `http://127.0.0.1:5000` and can be overridden via the extension's options page (stored in `chrome.storage.sync` under key `apiBase`).
