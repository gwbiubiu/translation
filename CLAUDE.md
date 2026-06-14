# CLAUDE.md

This file provides guidance to Claude Code when working with this monorepo.

## Project Structure

```
translation/                  ← monorepo root
├── translation-server/       ← Main Flask translation service (port 15001)
├── admin-server/             ← Admin management Flask service (port 15002)
├── dashboard-ui/             ← User dashboard (Vite + React, port 5173)
├── admin-ui/                 ← Admin UI (Vite + React, port 5174)
└── chrome-extension/         ← Chrome MV3 extension
```

Each service is independent — its own `config.yaml` (gitignored), its own `uv` environment.

---

## translation-server

Flask + Claude AI translation service. Managed by uv.

```bash
cd translation-server

uv run python main.py          # start server (port from config.yaml)
uv sync                        # install / sync deps
uv add <package>               # add dependency
```

### Architecture

```
translation-server/
├── main.py                    # entry point
├── pyproject.toml             # uv project
├── config.yaml                # gitignored — copy from config.example.yaml
├── app/
│   ├── __init__.py            # create_app() factory
│   ├── config.py              # AppConfig (Pydantic) — port, ai, wechat, mysql
│   ├── models.py              # VocabItem, TranslationResponse
│   ├── translator.py          # ChatOpenAI + translate()
│   ├── routes.py              # GET / · POST /translate
│   ├── auth.py                # WeChat OAuth + mock login
│   ├── user.py                # /dashboard · /api/user/*
│   ├── database.py            # MySQL helpers (graceful if unavailable)
│   └── logger.py              # TimedRotatingFileHandler → logs/app.log
└── templates/
    ├── index.html             # web translation UI
    ├── login.html             # WeChat / mock login
    └── dashboard.html         # Jinja fallback for user center
```

**Translation flow:** `POST /translate` → `translator.translate()` → Claude via LangChain `ChatOpenAI` → `{translated, from, to, vocab[]}`.

---

## admin-server

Admin management Flask service. Managed by uv.

```bash
cd admin-server

uv run python main.py          # start server (port from config.yaml)
uv sync
uv add <package>
```

### Architecture

```
admin-server/
├── main.py
├── pyproject.toml
├── config.yaml                # gitignored — copy from config.example.yaml
└── app/
    ├── __init__.py
    ├── config.py              # AdminAppConfig — port, admin credentials, mysql
    ├── auth.py                # POST /admin/login · POST /admin/logout · GET /admin/me
    ├── routes.py              # GET /admin/api/stats · GET /admin/api/users · PATCH /admin/api/users/:id
    └── database.py            # MySQL: user list, stats, membership update
```

---

## dashboard-ui

User personal center. Vite + React + Tailwind.

```bash
cd dashboard-ui
npm run dev        # port 5173, proxies /api /auth → localhost:15001
npm run build      # output → dist/ (served by Nginx at /dashboard)
```

---

## admin-ui

Admin console. Vite + React + Tailwind + Recharts.

```bash
cd admin-ui
npm run dev        # port 5174, proxies /admin → localhost:15002
npm run build      # output → dist/
```

---

## chrome-extension

Manifest V3 extension. After any file change, reload at `chrome://extensions`.

| File | Context | Role |
|------|---------|------|
| `popup.js` | Extension page | Manual translate UI + vocab tab |
| `content.js` | Content script | Selection dot + translation card overlay |
| `background.js` | Service worker | Context menu right-click translate |

Backend URL defaults to `https://translation.gwbiubiu.com`, overridable via options page (`chrome.storage.sync` key `apiBase`).
