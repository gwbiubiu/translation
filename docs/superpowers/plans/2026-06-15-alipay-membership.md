# 支付宝会员付款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在 dashboard-ui 自助扫码支付宝购买 Pro 会员（¥9.9/月），后端自动激活并记录到期时间。

**Architecture:** `translation-server` 新增 `payment.py` Blueprint 处理订单创建/回调/查询，`database.py` 扩展 orders 表和 users.membership_expires_at，`dashboard-ui` 新增 `UpgradeModal` 弹窗渲染二维码并轮询支付状态。

**Tech Stack:** `alipay-sdk-python3`（RSA2 签名），`python-dateutil`（月份计算），`qrcode.react`（前端二维码渲染）

---

## 文件地图

| 操作 | 路径 | 职责 |
|------|------|------|
| Modify | `translation-server/app/config.py` | 新增 `AlipayConfig` 模型 |
| Modify | `translation-server/config.example.yaml` | 新增 alipay 配置占位 |
| Modify | `translation-server/app/database.py` | 扩展 `init_db()`；新增订单 CRUD 函数 |
| Create | `translation-server/app/payment.py` | 支付 Blueprint（3 个路由） |
| Modify | `translation-server/app/__init__.py` | 注册 `payment_bp` |
| Modify | `translation-server/app/user.py` | `/api/user/me` 返回 `membership_expires_at`，惰性到期判断 |
| Modify | `dashboard-ui/src/lib/api.ts` | 扩展 `User` 类型；新增 `createOrder`/`queryOrder` |
| Create | `dashboard-ui/src/components/UpgradeModal.tsx` | 支付弹窗（二维码 + 轮询） |
| Modify | `dashboard-ui/src/pages/Dashboard.tsx` | ProfileCard 加「升级」按钮，集成弹窗 |
| Modify | `dashboard-ui/src/App.tsx` | 传 `onRefreshUser` 回调给 Dashboard |

---

## Task 1: 安装依赖

**Files:**
- Modify: `translation-server/pyproject.toml`（uv 自动更新）
- Modify: `dashboard-ui/package.json`（npm 自动更新）

- [ ] **Step 1: 安装后端依赖**

```bash
cd /Users/gewei/python/translation/translation-server
uv add alipay-sdk-python3 python-dateutil
```

Expected: 输出 `Resolved ... packages` 并更新 `pyproject.toml`

- [ ] **Step 2: 验证后端依赖可 import**

```bash
cd /Users/gewei/python/translation/translation-server
uv run python -c "from alipay import AliPay; from dateutil.relativedelta import relativedelta; print('ok')"
```

Expected: 输出 `ok`

- [ ] **Step 3: 安装前端依赖**

```bash
cd /Users/gewei/python/translation/dashboard-ui
npm install qrcode.react
```

Expected: `added 1 package` 类似输出，`package.json` 新增 `qrcode.react`

- [ ] **Step 4: Commit**

```bash
cd /Users/gewei/python/translation
git add translation-server/pyproject.toml translation-server/uv.lock dashboard-ui/package.json dashboard-ui/package-lock.json
git commit -m "chore: add alipay-sdk-python3, python-dateutil, qrcode.react deps"
```

---

## Task 2: 配置 — AlipayConfig

**Files:**
- Modify: `translation-server/app/config.py`
- Modify: `translation-server/config.example.yaml`

- [ ] **Step 1: 在 config.py 新增 AlipayConfig 并挂到 AppConfig**

打开 `translation-server/app/config.py`，在 `MySQLConfig` 之后、`AppConfig` 之前插入：

```python
class AlipayConfig(BaseModel):
    app_id: str = ""
    private_key: str = ""
    public_key: str = ""
    notify_url: str = ""
    sandbox: bool = True
```

再在 `AppConfig` 里新增字段（已有字段保持不动）：

```python
class AppConfig(BaseModel):
    ai: AIConfig
    port: int = 5000
    session_secret: str = "change-me-please-use-a-random-string"
    google: GoogleConfig = GoogleConfig()
    mysql: MySQLConfig = MySQLConfig()
    alipay: AlipayConfig = AlipayConfig()
```

- [ ] **Step 2: 验证配置加载不报错**

```bash
cd /Users/gewei/python/translation/translation-server
uv run python -c "from app.config import config; print(config.alipay)"
```

Expected: 输出 `app_id='' private_key='' ...` 类型的 AlipayConfig 对象

- [ ] **Step 3: 在 config.example.yaml 新增 alipay 节**

打开 `translation-server/config.example.yaml`，在文件末尾追加：

```yaml
alipay:
  app_id: "YOUR_ALIPAY_APP_ID"
  private_key: |
    -----BEGIN RSA PRIVATE KEY-----
    YOUR_RSA2_PRIVATE_KEY_HERE
    -----END RSA PRIVATE KEY-----
  public_key: |
    -----BEGIN PUBLIC KEY-----
    YOUR_ALIPAY_RSA2_PUBLIC_KEY_HERE
    -----END PUBLIC KEY-----
  notify_url: "https://yourdomain.com/api/payment/notify"
  sandbox: true
```

- [ ] **Step 4: Commit**

```bash
cd /Users/gewei/python/translation
git add translation-server/app/config.py translation-server/config.example.yaml
git commit -m "feat: add AlipayConfig to translation-server config"
```

---

## Task 3: 数据库 — 扩展 schema 与订单函数

**Files:**
- Modify: `translation-server/app/database.py`

- [ ] **Step 1: 在 init_db() 里添加 schema 迁移**

找到 `init_db()` 中 `conn.commit()` 前（即创建 `translation_history` 表之后），追加以下代码：

```python
                # 新增 membership_expires_at（幂等，已存在则忽略）
                try:
                    cur.execute("""
                        ALTER TABLE users
                        ADD COLUMN membership_expires_at DATETIME NULL DEFAULT NULL
                    """)
                except Exception:
                    pass  # 列已存在

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS orders (
                        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        out_trade_no    VARCHAR(64) UNIQUE NOT NULL,
                        user_id         BIGINT UNSIGNED NOT NULL,
                        amount          DECIMAL(10,2) NOT NULL,
                        months          TINYINT NOT NULL DEFAULT 1,
                        status          VARCHAR(16) DEFAULT 'pending',
                        alipay_trade_no VARCHAR(64) DEFAULT '',
                        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                        paid_at         DATETIME NULL,
                        INDEX idx_user (user_id),
                        INDEX idx_out_trade_no (out_trade_no)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
```

- [ ] **Step 2: 在文件末尾追加订单 CRUD 函数**

```python
def create_order(user_id: int, out_trade_no: str, amount: float, months: int = 1) -> dict:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO orders (out_trade_no, user_id, amount, months) VALUES (%s, %s, %s, %s)",
                (out_trade_no, user_id, amount, months),
            )
            cur.execute("SELECT * FROM orders WHERE out_trade_no=%s", (out_trade_no,))
            return cur.fetchone()


def get_order(out_trade_no: str) -> dict | None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM orders WHERE out_trade_no=%s", (out_trade_no,))
            return cur.fetchone()


def update_order_paid(
    out_trade_no: str,
    alipay_trade_no: str,
    user_id: int,
    new_expiry,
) -> None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE orders SET status='paid', alipay_trade_no=%s, paid_at=NOW() "
                "WHERE out_trade_no=%s",
                (alipay_trade_no, out_trade_no),
            )
            cur.execute(
                "UPDATE users SET membership='pro', membership_expires_at=%s WHERE id=%s",
                (new_expiry, user_id),
            )
```

- [ ] **Step 3: 验证 import 正常**

```bash
cd /Users/gewei/python/translation/translation-server
uv run python -c "from app.database import create_order, get_order, update_order_paid; print('ok')"
```

Expected: 输出 `ok`

- [ ] **Step 4: Commit**

```bash
cd /Users/gewei/python/translation
git add translation-server/app/database.py
git commit -m "feat: extend database with orders table and membership_expires_at"
```

---

## Task 4: 后端 — 创建 payment.py Blueprint

**Files:**
- Create: `translation-server/app/payment.py`

- [ ] **Step 1: 创建 payment.py**

新建文件 `translation-server/app/payment.py`，内容如下：

```python
import uuid
from datetime import datetime, timezone

from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request, session

from .config import config
from .database import create_order, get_order, get_user_by_id, update_order_paid
from .user import login_required

payment_bp = Blueprint("payment", __name__)

PRICE = 9.90


def _alipay_client():
    from alipay import AliPay
    from alipay import AliPayConfig as SDKConfig

    cfg = config.alipay
    return AliPay(
        appid=cfg.app_id,
        app_notify_url=cfg.notify_url,
        app_private_key_string=cfg.private_key,
        alipay_public_key_string=cfg.public_key,
        sign_type="RSA2",
        config=SDKConfig(timeout=15),
        debug=cfg.sandbox,
    )


@payment_bp.route("/api/payment/create", methods=["POST"])
@login_required
def create():
    cfg = config.alipay
    if not cfg.app_id or not cfg.private_key:
        return jsonify({"error": "支付功能暂未配置，请联系管理员"}), 503

    user_id = session["user_id"]
    out_trade_no = uuid.uuid4().hex

    try:
        result = _alipay_client().api_alipay_trade_precreate(
            subject="智能翻译 Pro 会员（1个月）",
            out_trade_no=out_trade_no,
            total_amount=str(PRICE),
        )
    except Exception as e:
        return jsonify({"error": f"创建支付订单失败: {e}"}), 500

    if result.get("code") != "10000":
        return jsonify({"error": result.get("sub_msg", "支付宝下单失败")}), 500

    create_order(user_id, out_trade_no, PRICE, months=1)
    return jsonify({"qr_code_url": result["qr_code"], "out_trade_no": out_trade_no})


@payment_bp.route("/api/payment/notify", methods=["POST"])
def notify():
    data = request.form.to_dict()
    signature = data.pop("sign", None)

    try:
        valid = _alipay_client().verify(data, signature)
    except Exception:
        return "fail", 400

    if not valid:
        return "fail", 400

    trade_status = data.get("trade_status", "")
    out_trade_no = data.get("out_trade_no", "")

    # 金额防篡改校验
    try:
        if round(float(data.get("total_amount", "0")), 2) != PRICE:
            return "fail", 400
    except ValueError:
        return "fail", 400

    if trade_status != "TRADE_SUCCESS":
        return "success"

    order = get_order(out_trade_no)
    if not order or order["status"] == "paid":
        return "success"  # 幂等

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user = get_user_by_id(order["user_id"])
    current_expiry = user.get("membership_expires_at") if user else None
    base = current_expiry if (current_expiry and current_expiry > now) else now
    new_expiry = base + relativedelta(months=int(order["months"]))

    update_order_paid(
        out_trade_no=out_trade_no,
        alipay_trade_no=data.get("trade_no", ""),
        user_id=order["user_id"],
        new_expiry=new_expiry,
    )
    return "success"


@payment_bp.route("/api/payment/query/<out_trade_no>", methods=["GET"])
@login_required
def query(out_trade_no):
    order = get_order(out_trade_no)
    if not order or order["user_id"] != session["user_id"]:
        return jsonify({"error": "订单不存在"}), 404
    return jsonify({"status": order["status"]})
```

- [ ] **Step 2: 验证 import 正常**

```bash
cd /Users/gewei/python/translation/translation-server
uv run python -c "from app.payment import payment_bp; print('ok')"
```

Expected: 输出 `ok`

- [ ] **Step 3: Commit**

```bash
cd /Users/gewei/python/translation
git add translation-server/app/payment.py
git commit -m "feat: add payment blueprint with create/notify/query routes"
```

---

## Task 5: 注册 Blueprint + 更新 /api/user/me

**Files:**
- Modify: `translation-server/app/__init__.py`
- Modify: `translation-server/app/user.py`

- [ ] **Step 1: 在 __init__.py 注册 payment_bp**

打开 `translation-server/app/__init__.py`，在现有 import 后追加：

```python
from .payment import payment_bp
```

并在 `app.register_blueprint(user_bp)` 之后追加：

```python
    app.register_blueprint(payment_bp)
```

完整 `create_app()` 函数应如下所示：

```python
from flask import Flask

from .auth import auth_bp
from .config import config
from .database import init_db
from .payment import payment_bp
from .routes import bp
from .user import user_bp


def create_app() -> Flask:
    app = Flask(__name__, template_folder="../templates")
    app.secret_key = config.session_secret

    init_db()

    app.register_blueprint(bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(payment_bp)

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    return app
```

- [ ] **Step 2: 更新 user.py 的 /api/user/me**

打开 `translation-server/app/user.py`，在顶部 import 区追加：

```python
from datetime import datetime, timezone
```

将 `/api/user/me` 路由函数替换为：

```python
@user_bp.route("/api/user/me")
@login_required
def me():
    user = get_user_by_id(session["user_id"])
    if not user:
        return jsonify({"error": "not found"}), 404

    membership = user["membership"]
    expires_at = user.get("membership_expires_at")
    if membership == "pro" and expires_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires_at <= now:
            membership = "free"

    return jsonify({
        "id": user["id"],
        "nickname": user["nickname"],
        "avatar_url": user["avatar_url"],
        "membership": membership,
        "membership_expires_at": expires_at.isoformat() if expires_at else None,
    })
```

- [ ] **Step 3: 验证服务器启动正常**

```bash
cd /Users/gewei/python/translation/translation-server
uv run python -c "from app import create_app; app = create_app(); print([str(r) for r in app.url_map.iter_rules() if 'payment' in str(r)])"
```

Expected: 输出包含 `/api/payment/create`、`/api/payment/notify`、`/api/payment/query/<out_trade_no>`

- [ ] **Step 4: Commit**

```bash
cd /Users/gewei/python/translation
git add translation-server/app/__init__.py translation-server/app/user.py
git commit -m "feat: register payment blueprint and add membership_expires_at to /api/user/me"
```

---

## Task 6: 前端 — 扩展 api.ts

**Files:**
- Modify: `dashboard-ui/src/lib/api.ts`

- [ ] **Step 1: 将 api.ts 完整替换为以下内容**

```typescript
export interface User {
  id: number
  nickname: string
  avatar_url: string
  membership: 'free' | 'pro'
  membership_expires_at: string | null
}

export interface HistoryItem {
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  created_at: string
}

export interface UserStats {
  total: number
  history: HistoryItem[]
}

export interface CreateOrderResult {
  qr_code_url: string
  out_trade_no: string
}

export interface OrderStatus {
  status: 'pending' | 'paid' | 'failed'
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  me: () => request<User>('/api/user/me'),
  stats: () => request<UserStats>('/api/user/stats'),
  logout: () =>
    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/login'
    }),
  createOrder: () =>
    request<CreateOrderResult>('/api/payment/create', { method: 'POST' }),
  queryOrder: (outTradeNo: string) =>
    request<OrderStatus>(`/api/payment/query/${outTradeNo}`),
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gewei/python/translation
git add dashboard-ui/src/lib/api.ts
git commit -m "feat: extend api.ts with createOrder/queryOrder and membership_expires_at"
```

---

## Task 7: 前端 — UpgradeModal 组件

**Files:**
- Create: `dashboard-ui/src/components/UpgradeModal.tsx`

- [ ] **Step 1: 创建 UpgradeModal.tsx**

新建文件 `dashboard-ui/src/components/UpgradeModal.tsx`：

```typescript
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../lib/api'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Phase = 'loading' | 'ready' | 'paid' | 'error'

export default function UpgradeModal({ onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [qrUrl, setQrUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tradeNoRef = useRef('')

  useEffect(() => {
    api.createOrder()
      .then(({ qr_code_url, out_trade_no }) => {
        setQrUrl(qr_code_url)
        tradeNoRef.current = out_trade_no
        setPhase('ready')
        pollRef.current = setInterval(() => {
          api.queryOrder(out_trade_no).then(({ status }) => {
            if (status === 'paid') {
              clearInterval(pollRef.current!)
              setPhase('paid')
              setTimeout(onSuccess, 800)
            }
          }).catch(() => {})
        }, 3000)
      })
      .catch((e) => {
        setErrorMsg(e.message || '网络错误')
        setPhase('error')
      })

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-8 w-[340px] flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xl font-bold text-gray-900">升级 Pro 会员</div>

        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-amber-600">¥9.9</div>
          <div className="text-sm text-amber-500 mt-0.5">/ 月</div>
          <ul className="mt-3 text-sm text-gray-500 space-y-1 text-left list-disc list-inside">
            <li>无限翻译次数</li>
            <li>词汇表历史不限</li>
          </ul>
        </div>

        {phase === 'loading' && (
          <div className="w-[180px] h-[180px] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {phase === 'ready' && (
          <>
            <div className="border border-gray-100 rounded-xl p-2">
              <QRCodeSVG value={qrUrl} size={180} />
            </div>
            <p className="text-sm text-gray-400 text-center">
              请用支付宝扫码完成支付
              <br />
              <span className="text-xs">正在等待支付结果...</span>
            </p>
          </>
        )}

        {phase === 'paid' && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">✅</div>
            <div className="text-green-600 font-medium">支付成功！正在激活...</div>
          </div>
        )}

        {phase === 'error' && (
          <>
            <div className="text-red-500 text-sm text-center">{errorMsg}</div>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-indigo-500 underline"
            >
              重试
            </button>
          </>
        )}

        {phase !== 'paid' && (
          <button
            onClick={handleClose}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer bg-transparent border-none"
          >
            取消
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gewei/python/translation
git add dashboard-ui/src/components/UpgradeModal.tsx
git commit -m "feat: add UpgradeModal component with QR code and polling"
```

---

## Task 8: 前端 — Dashboard 集成 + App.tsx 刷新回调

**Files:**
- Modify: `dashboard-ui/src/App.tsx`
- Modify: `dashboard-ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: 在 App.tsx 添加 refreshUser 并传给 Dashboard**

将 `dashboard-ui/src/App.tsx` 完整替换为：

```typescript
import { useEffect, useState } from 'react'
import { api, type User, type UserStats } from './lib/api'
import Dashboard from './pages/Dashboard'

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; user: User; stats: UserStats }
  | { phase: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    Promise.all([api.me(), api.stats()])
      .then(([user, stats]) => setState({ phase: 'ready', user, stats }))
      .catch((e) => {
        if (e.message !== 'Unauthorized') {
          setState({ phase: 'error', message: e.message })
        }
      })
  }, [])

  const refreshUser = () => {
    api.me().then((user) =>
      setState((s) => (s.phase === 'ready' ? { ...s, user } : s))
    ).catch(() => {})
  }

  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="text-gray-500 text-sm">加载失败: {state.message}</div>
      </div>
    )
  }

  return (
    <Dashboard
      user={state.user}
      stats={state.stats}
      onLogout={api.logout}
      onRefreshUser={refreshUser}
    />
  )
}
```

- [ ] **Step 2: 更新 Dashboard.tsx 集成弹窗**

将 `dashboard-ui/src/pages/Dashboard.tsx` 完整替换为：

```typescript
import { useState } from 'react'
import type { User, UserStats, HistoryItem } from '../lib/api'
import UpgradeModal from '../components/UpgradeModal'

const LANG: Record<string, string> = { zh: '中文', en: '英语' }
const lang = (code: string) => LANG[code] || code

interface Props {
  user: User
  stats: UserStats
  onLogout: () => void
  onRefreshUser: () => void
}

export default function Dashboard({ user, stats, onLogout, onRefreshUser }: Props) {
  const [showUpgrade, setShowUpgrade] = useState(false)

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <Navbar onLogout={onLogout} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <ProfileCard user={user} onUpgrade={() => setShowUpgrade(true)} />
        <StatsRow total={stats.total} recentCount={stats.history.length} membership={user.membership} />
        <HistorySection items={stats.history} />
      </main>
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onSuccess={() => {
            setShowUpgrade(false)
            onRefreshUser()
          }}
        />
      )}
    </div>
  )
}

/* ── Navbar ─────────────────────────────────────────────────────── */
function Navbar({ onLogout }: { onLogout: () => void }) {
  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <TranslateIcon />
          </div>
          <span className="text-[15px] font-semibold text-gray-900">智能翻译</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-indigo-500 transition-colors no-underline">
            翻译
          </a>
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-lg hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer bg-transparent"
          >
            退出登录
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ── Profile ─────────────────────────────────────────────────────── */
function ProfileCard({ user, onUpgrade }: { user: User; onUpgrade: () => void }) {
  const initial = (user.nickname || '用')[0]
  return (
    <div className="bg-white rounded-2xl shadow-sm p-7 flex items-center gap-6">
      <div className="w-[72px] h-[72px] rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="头像" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </div>
      <div className="flex-1">
        <div className="text-xl font-bold text-gray-900 mb-1.5">{user.nickname || '用户'}</div>
        <div className="flex items-center gap-3">
          {user.membership === 'pro' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              ⭐ Pro 会员
            </span>
          ) : (
            <>
              <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                免费版
              </span>
              <button
                onClick={onUpgrade}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer border-none"
              >
                升级 Pro ¥9.9/月
              </button>
            </>
          )}
          {user.membership === 'pro' && user.membership_expires_at && (
            <span className="text-xs text-gray-400">
              到期：{user.membership_expires_at.slice(0, 10)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Stats ───────────────────────────────────────────────────────── */
function StatsRow({ total, recentCount, membership }: { total: number; recentCount: number; membership: string }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard value={total} label="累计翻译次数" />
      <StatCard value={recentCount} label="最近记录条数" />
      <StatCard value={membership === 'pro' ? '⭐ Pro' : '免费'} label="会员状态" small={membership === 'pro'} />
    </div>
  )
}

function StatCard({ value, label, small }: { value: string | number; label: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 text-center">
      <div className={`font-bold text-indigo-600 mb-1 ${small ? 'text-xl pt-1.5' : 'text-3xl'}`}>
        {value}
      </div>
      <div className="text-[13px] text-gray-400">{label}</div>
    </div>
  )
}

/* ── History ─────────────────────────────────────────────────────── */
function HistorySection({ items }: { items: HistoryItem[] }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-gray-800 mb-3">最近翻译记录</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            暂无记录，使用插件或网页翻译后会显示在这里
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 font-medium border-b border-gray-100">
                <th className="text-left px-5 py-3 w-[38%]">原文</th>
                <th className="text-left px-5 py-3 w-[38%]">译文</th>
                <th className="text-left px-5 py-3 w-[14%]">语言</th>
                <th className="text-right px-5 py-3 w-[10%]">时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <HistoryRow key={i} item={item} last={i === items.length - 1} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function HistoryRow({ item, last }: { item: HistoryItem; last: boolean }) {
  return (
    <tr className={`hover:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-50'}`}>
      <td className="px-5 py-3.5 text-gray-800 max-w-0">
        <div className="truncate">{item.source_text}</div>
      </td>
      <td className="px-5 py-3.5 text-indigo-600 max-w-0">
        <div className="truncate">{item.translated_text}</div>
      </td>
      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">
        {lang(item.source_lang)} → {lang(item.target_lang)}
      </td>
      <td className="px-5 py-3.5 text-gray-300 text-right whitespace-nowrap text-xs">
        {item.created_at}
      </td>
    </tr>
  )
}

/* ── Icon ────────────────────────────────────────────────────────── */
function TranslateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
    </svg>
  )
}
```

- [ ] **Step 3: 检查 TypeScript 编译无报错**

```bash
cd /Users/gewei/python/translation/dashboard-ui
npx tsc --noEmit
```

Expected: 无输出（0 错误）

- [ ] **Step 4: Commit**

```bash
cd /Users/gewei/python/translation
git add dashboard-ui/src/App.tsx dashboard-ui/src/pages/Dashboard.tsx
git commit -m "feat: integrate UpgradeModal into Dashboard with payment flow"
```

---

## 验收检查清单

完成所有任务后，逐项确认：

- [ ] `uv run python -c "from app import create_app; create_app()"` 无报错
- [ ] `npx tsc --noEmit` 无报错
- [ ] `/api/payment/create`（未配置支付宝时）返回 503 + 中文错误信息
- [ ] `/api/user/me` 响应包含 `membership_expires_at` 字段
- [ ] `dashboard-ui` 免费用户 ProfileCard 显示「升级 Pro ¥9.9/月」按钮
- [ ] Pro 用户 ProfileCard 显示到期日期
- [ ] 点击升级按钮弹出 UpgradeModal，未配置时显示错误提示
