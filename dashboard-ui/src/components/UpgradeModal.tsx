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
