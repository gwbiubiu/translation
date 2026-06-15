import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const showMock = import.meta.env.VITE_SHOW_MOCK_LOGIN === 'true'

  useEffect(() => {
    api.me()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div
          className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin"
          role="status"
          aria-label="加载中"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm px-10 py-12">

          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-12 h-12 rounded-[12px] bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200 mb-4"
              aria-hidden="true"
            >
              <TranslateIcon />
            </div>
            <h1 className="text-[22px] font-bold text-gray-900 mb-1">智能翻译</h1>
            <p className="text-sm text-gray-400">AI 驱动的中英文翻译助手</p>
          </div>

          {/* Benefit hints */}
          <div className="flex items-center justify-center gap-3 mb-8">
            {['翻译历史', '会员权益', '多端同步'].map((text) => (
              <span
                key={text}
                className="text-xs text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full font-medium"
              >
                {text}
              </span>
            ))}
          </div>

          {/* Google login */}
          <a
            href="/auth/google"
            className="flex items-center justify-center gap-3 w-full py-3.5 px-5 bg-white border border-gray-200 rounded-xl text-[15px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-200 no-underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
          >
            <GoogleIcon />
            使用 Google 账号登录
          </a>

          {/* Dev mock login */}
          {showMock && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">或</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <a
                href="/auth/mock-login"
                className="flex items-center justify-center w-full py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors duration-150 no-underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
              >
                测试账号登录（开发用）
              </a>
            </>
          )}

          {/* Terms hint */}
          <p className="text-xs text-gray-300 text-center mt-6 leading-relaxed">
            登录即表示同意服务条款与隐私政策
          </p>
        </div>

        {/* Back link — outside card */}
        <div className="text-center mt-5">
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-indigo-500 transition-colors duration-150 no-underline focus:outline-none focus:underline"
            aria-label="返回翻译页"
          >
            ← 返回翻译
          </a>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="flex-shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function TranslateIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
    </svg>
  )
}
