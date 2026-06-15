# 前端 SPA 迁移设计

**日期：** 2026-06-15
**状态：** 已批准
**范围：** `dashboard-ui` + `translation-server`

---

## 背景

`translation-server` 目前通过 Jinja 模板提供三个 HTML 页面（`index.html`、`login.html`、`dashboard.html`）。`dashboard.html` 已被 React 版 `dashboard-ui` 完全替代。本次迁移将剩余两个模板也移入 `dashboard-ui`，实现彻底的前后端分离，Flask 只保留 API 路由。

---

## 前端路由（React Router）

新增 `react-router-dom`，`App.tsx` 改为路由容器：

| 路径 | 组件 | 认证要求 |
|------|------|---------|
| `/` | `Translation` | 无 |
| `/login` | `Login` | 已登录跳 `/dashboard` |
| `/dashboard` | `Dashboard`（已有） | 未登录跳 `/login` |

### App.tsx 结构

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/"          element={<Translation />} />
    <Route path="/login"     element={<Login />} />
    <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
  </Routes>
</BrowserRouter>
```

### AuthGuard 组件

新增 `src/components/AuthGuard.tsx`：
- 挂载时调 `api.me()`
- 成功 → 渲染子组件
- 401 → `<Navigate to="/login" replace />`
- 加载中 → 全屏 spinner

AuthGuard **只负责认证跳转**，不持有 user 状态。

### Dashboard 状态自管

当前 `App.tsx` 持有的 `user`、`stats`、`refreshUser` 状态整体移入 `Dashboard.tsx` 内部（`useState` + `useEffect`），`Dashboard` 不再接收这些 props，自己调 `api.me()` + `api.stats()` 加载数据。`App.tsx` 只做路由，无业务状态。

---

## 翻译页（`/`）

**新增文件：** `src/pages/Translation.tsx`

### 布局

```
┌───────────────────────────────────────────────┐
│ Navbar: 智能翻译 logo     [翻译(active)] [个人中心/登录] │
├───────────────────────────────────────────────┤
│  lang-bar: 中文 → 英文                         │
├───────────────────┬───────────────────────────┤
│  textarea（输入）  │  output div（结果）        │
│  280px 高          │  280px 高                 │
├───────────────────┼───────────────────────────┤
│  N 字符  [清空]    │              [复制]        │
└───────────────────┴───────────────────────────┘
```

### 交互逻辑

- 输入后 600ms debounce 自动调 `POST /translate`
- 语言检测：含汉字 → 中→英，否则 英→中
- 翻译中：输出区显示 spinner
- 翻译完成：显示结果 + 复制按钮
- 复制成功：按钮文字短暂变为「已复制」
- 右上角 Navbar：调 `api.me()`，成功显示「个人中心」链接，401 显示「登录」链接（静默失败，不跳转）

### 样式

遵循 CLAUDE.md 设计规范（`bg-[#f0f2f5]` 背景，白色卡片 `rounded-2xl shadow-sm`，indigo 主色）。实现前使用 `ui-ux-pro-max:ui-ux-pro-max` skill 优化 UI 细节。

---

## 登录页（`/login`）

**新增文件：** `src/pages/Login.tsx`

### 布局

居中卡片，`w-[380px]`：
- Logo 图标（indigo 渐变圆角方块）
- 产品名「智能翻译」+ 副标题
- Google 登录按钮 → `href="/auth/google"`
- （开发模式）Mock 登录按钮 → `href="/auth/mock-login"`
- 「← 返回翻译」链接 → `/`

### 逻辑

- 页面加载调 `api.me()`，已登录直接 `<Navigate to="/dashboard" />`
- Google 按钮直接跳 Flask OAuth 路由，无 fetch 调用
- OAuth 回调失败 → Flask `redirect("/login")` → 用户看到正常登录页，自行重试（不展示错误信息）
- Mock 登录按钮：仅当 `import.meta.env.VITE_SHOW_MOCK_LOGIN === 'true'` 时渲染

### 样式

同上，实现前使用 `ui-ux-pro-max:ui-ux-pro-max` skill 优化。

---

## 后端变更（translation-server）

### 删除文件

- `templates/index.html`
- `templates/login.html`
- `templates/dashboard.html`

### routes.py

删除 `GET /` 路由和 `render_template` 导入（如无其他用途）。

### auth.py

所有 `render_template("login.html", ...)` 调用替换为 `redirect("/login")`：

| 原代码 | 替换为 |
|--------|--------|
| `render_template("login.html", has_google=False, db_unavailable=True)` | `redirect("/login")` |
| `render_template("login.html", has_google=has_google, db_unavailable=False)` | `redirect("/login")` |
| `render_template("login.html", has_google=True, error="...")` | `redirect("/login")` |

`GET /login` 路由整体删除（React Router 接管）。

### user.py

删除 `GET /dashboard` 路由及 `render_template` 调用。

---

## Vite 代理变更

更新 `dashboard-ui/vite.config.ts`：

```ts
proxy: {
  '/api':       'http://127.0.0.1:15001',
  '/auth':      'http://127.0.0.1:15001',
  '/translate': 'http://127.0.0.1:15001',
  // 移除 '/login'（React Router 处理）
}
```

---

## 新增依赖

```bash
cd dashboard-ui
npm install react-router-dom
```

---

## 不在本次范围内

- 翻译页的用户登录态持久化（词汇表、历史记录展示）
- 登录页的详细错误展示
- admin-ui 的任何改动
