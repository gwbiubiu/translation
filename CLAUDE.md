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

## 前端设计规范

> **强制要求：** 每次新增或修改页面/组件前，必须先调用 `ui-ux-pro-max:ui-ux-pro-max` skill 进行 UI/UX 优化设计，再进入实现阶段。

### 技术栈
- React + TypeScript + Vite
- Tailwind CSS（不引入额外 CSS 框架）
- 图标：SVG inline（不引入 icon 库）

### 色彩系统

| 用途 | Token |
|------|-------|
| 页面背景 | `bg-[#f0f2f5]` |
| 卡片背景 | `bg-white` |
| 主色（按钮/链接/数值） | `indigo-500 / indigo-600` |
| Pro 会员徽章 | `amber-50` 背景 + `amber-700` 文字 + `amber-200` 边框 |
| 主文字 | `gray-900` |
| 次要文字 | `gray-400 / gray-500` |
| 分割线/边框 | `gray-100` |
| 危险/退出 hover | `red-500` |

### 卡片 & 圆角
- 大卡片：`rounded-2xl shadow-sm p-7`
- 小卡片/统计块：`rounded-xl shadow-sm p-5`
- 标签/徽章：`rounded-full px-3 py-1 text-xs`
- 按钮：`rounded-lg`（普通）/ `rounded-full`（标签式）
- 导航栏图标容器：`rounded-[9px]`

### 排版
- 页面标题：`text-xl font-bold text-gray-900`
- 区块标题：`text-[15px] font-semibold text-gray-800`
- 正文：`text-sm text-gray-500`
- 辅助说明：`text-xs text-gray-400`
- 大数字（统计）：`text-3xl font-bold text-indigo-600`

### 导航栏
- 高度 `h-14`，`sticky top-0 z-10`，`bg-white border-b border-gray-100`
- 最大宽度 `max-w-4xl mx-auto px-4`，左侧 Logo + 产品名，右侧操作区

### 内容区
- 最大宽度 `max-w-4xl mx-auto px-4 py-8`
- 各区块竖向间距 `space-y-5`

### 交互状态
- Loading：`animate-spin` 圆形边框旋转（`border-t-indigo-500`）
- Hover：颜色 transition，`transition-colors` 过渡
- 弹窗遮罩：`bg-black/40`，弹窗体 `rounded-2xl shadow-xl`
- 错误提示：`text-red-500`
- 成功提示：`text-green-600`

---

## chrome-extension

Manifest V3 extension. After any file change, reload at `chrome://extensions`.

| File | Context | Role |
|------|---------|------|
| `popup.js` | Extension page | Manual translate UI + vocab tab |
| `content.js` | Content script | Selection dot + translation card overlay |
| `background.js` | Service worker | Context menu right-click translate |

Backend URL defaults to `https://translation.gwbiubiu.com`, overridable via options page (`chrome.storage.sync` key `apiBase`).
