import { useState } from 'react'

interface Props {
  email: string
  onClose: () => void
}

export default function UpgradeModal({ email, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const qrUrl   = import.meta.env.VITE_PAYMENT_QR_URL   || ''
  const contact = import.meta.env.VITE_PAYMENT_CONTACT  || ''

  const copyEmail = () => {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full flex flex-col"
        style={{ maxWidth: 400, padding: '28px 24px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <h2 className="text-xl font-bold text-gray-900">升级 Pro 会员</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer bg-transparent border-none text-lg leading-none"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 收款码 */}
        <div className="flex justify-center" style={{ marginBottom: 16 }}>
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="收款码"
              className="rounded-xl border border-gray-100"
              style={{ width: 200, height: 200, objectFit: 'cover' }}
            />
          ) : (
            <div
              className="rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400"
              style={{ width: 200, height: 200 }}
            >
              配置 VITE_PAYMENT_QR_URL
            </div>
          )}
        </div>

        {/* 邮箱备注提示 */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl" style={{ padding: '10px 14px', marginBottom: 16 }}>
          <p className="text-xs text-amber-700 font-medium" style={{ marginBottom: 4 }}>付款备注请填写你的邮箱</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900 flex-1 truncate">{email}</span>
            <button
              onClick={copyEmail}
              className="text-xs text-amber-600 border border-amber-200 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors cursor-pointer bg-white flex-shrink-0"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 说明 */}
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          付款后请{contact ? <>联系 <span className="text-gray-600">{contact}</span> 开通，</> : '联系管理员开通，'}
          或等待人工审核（通常 24h 内）
        </p>
      </div>
    </div>
  )
}
