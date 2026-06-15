# 支付宝会员付款功能设计

**日期：** 2026-06-15  
**状态：** 已批准  
**范围：** `translation-server` + `dashboard-ui`

---

## 背景

当前 `users.membership` 字段已有 `free`/`pro` 两个值，管理员可手动修改。本设计为用户提供自助付款升级 Pro 会员的能力，付款方式为支付宝，¥9.9/月包月。

---

## 数据库变更

### `users` 表新增字段

```sql
ALTER TABLE users
  ADD COLUMN membership_expires_at DATETIME NULL DEFAULT NULL;
```

- `NULL`：从未购买，免费用户
- 值存在且 `> NOW()`：Pro 有效
- 值存在且 `<= NOW()`：已过期，视为 free（读取时判断，无需定时任务）

### 新增 `orders` 表

```sql
CREATE TABLE orders (
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
);
```

`status` 取值：`pending` / `paid` / `failed`

---

## 后端设计（translation-server）

### 新增文件

**`app/payment.py`** — 支付 Blueprint，挂载在 `/api/payment/`

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/payment/create` | POST | 需登录 | 创建订单，返回支付宝扫码 URL |
| `/api/payment/notify` | POST | 无（支付宝回调） | 接收异步通知，验签后更新订单和会员 |
| `/api/payment/query/<out_trade_no>` | GET | 需登录 | 前端轮询订单状态 |

### 支付流程

```
用户点击「升级 Pro」
  → POST /api/payment/create
      → 生成 out_trade_no（uuid4）
      → 写 orders（status=pending）
      → 调支付宝「当面付」扫码下单
      → 返回 { qr_code_url, out_trade_no }
  → 前端渲染二维码，每 3 秒轮询 /query
  → 用户扫码付款
  → 支付宝 POST /api/payment/notify
      → 验签（RSA2）
      → 幂等检查（已 paid 直接返回 success）
      → orders.status = paid，orders.alipay_trade_no = 流水号
      → users.membership = pro
      → users.membership_expires_at = NOW() + 1个月（若已有未过期时间则在此基础上续期）
  → 前端轮询拿到 paid → 关弹窗 → 刷新用户信息
```

### 续期逻辑

```python
# 若当前会员未过期，在原到期时间基础上加 1 个月；否则从当前时间加 1 个月
new_expiry = max(current_expires_at or now, now) + relativedelta(months=months)
```

### 配置（`config.yaml` / `config.example.yaml`）

```yaml
alipay:
  app_id: "YOUR_ALIPAY_APP_ID"
  private_key: "YOUR_RSA2_PRIVATE_KEY_PEM"
  public_key: "YOUR_ALIPAY_RSA2_PUBLIC_KEY_PEM"
  notify_url: "https://yourdomain.com/api/payment/notify"
  sandbox: true
```

### 新增配置类（`app/config.py`）

```python
class AlipayConfig(BaseModel):
    app_id: str = ""
    private_key: str = ""
    public_key: str = ""
    notify_url: str = ""
    sandbox: bool = True
```

`AppConfig` 新增字段：`alipay: AlipayConfig = AlipayConfig()`

### 依赖

```
uv add alipay-sdk-python3 python-dateutil
```

---

## 前端设计（dashboard-ui）

### 新增文件

**`src/components/UpgradeModal.tsx`** — 支付弹窗

### 改动文件

- `src/pages/Dashboard.tsx`：`ProfileCard` 免费用户显示「升级 Pro ¥9.9/月」按钮，点击打开弹窗
- `src/lib/api.ts`：新增 `createOrder()` 和 `queryOrder()` 方法

### 弹窗 UI

```
┌────────────────────────────────┐
│  升级 Pro 会员                 │
│                                │
│  ¥9.9 / 月                     │
│  · 无限翻译次数                 │
│  · 词汇表历史不限               │
│                                │
│  ┌──────────────────────────┐  │
│  │   支付宝二维码            │  │
│  │   (180×180px qrcode)     │  │
│  └──────────────────────────┘  │
│                                │
│  请用支付宝扫码完成支付          │
│  正在等待支付... ⏳             │
│                                │
│            [取消]              │
└────────────────────────────────┘
```

### 交互状态

| 状态 | 显示 |
|------|------|
| 加载中 | 旋转 spinner |
| 二维码已生成 | 二维码图 + 轮询提示 |
| paid | 自动关闭弹窗，刷新用户信息 |
| 网络错误 | 红色错误提示，可重试 |

### 轮询策略

- 打开弹窗后立即开始，每 3 秒请求一次 `/api/payment/query/:out_trade_no`
- 拿到 `paid` 或关闭弹窗时停止（`clearInterval`）

### 新增依赖

```
npm install qrcode.react
```

---

## `/api/user/me` 会员状态返回

返回中新增 `membership_expires_at` 字段，供前端显示到期时间：

```json
{
  "id": 1,
  "nickname": "张三",
  "membership": "pro",
  "membership_expires_at": "2026-07-15T12:00:00"
}
```

后端在返回前判断：若 `membership_expires_at <= now`，则将 `membership` 响应值降为 `"free"`（不改库，惰性判断）。

---

## 安全考虑

- **回调验签**：使用支付宝 RSA2 公钥验证每条 notify，拒绝签名不合法的请求
- **幂等**：`out_trade_no` 唯一索引 + 状态检查，防止重复激活
- **notify 无需登录**：支付宝服务器直接 POST，不走 session，但必须验签
- **金额校验**：notify 处理时校验 `total_amount == 9.90`，防止篡改金额

---

## 不在本次范围内

- 退款
- 多月套餐
- 微信支付
- admin-ui 订单流水视图
- 邮件通知
