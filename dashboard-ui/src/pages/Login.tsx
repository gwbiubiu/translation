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
          className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin motion-reduce:animate-none"
          role="status"
          aria-label="加载中"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm px-10 py-12 w-full max-w-[380px] text-center">
        {/* Logo */}
        <div
          className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-sm shadow-indigo-200"
          aria-hidden="true"
        >
          <TranslateIcon />
        </div>

        <h1 className="text-[22px] font-bold text-gray-900 mb-1.5">智能翻译</h1>
        <p className="text-sm text-gray-400 mb-9">登录后可查看翻译历史与会员状态</p>

        {/* Google login */}
        <a
          href="/auth/google"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-white border border-gray-200 rounded-xl text-[15px] font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all duration-150 no-underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
        >
          <GoogleIcon />
          使用 Google 账号登录
        </a>

        {/* Dev mock login */}
        {showMock && (
          <a
            href="/auth/mock-login"
            className="flex items-center justify-center w-full mt-3 py-3 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors duration-150 no-underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
          >
            测试账号登录（开发用）
          </a>
        )}

        <a
          href="/"
          className="inline-block mt-8 text-sm text-gray-400 hover:text-indigo-500 transition-colors duration-150 no-underline focus:outline-none focus:underline"
          aria-label="返回翻译页"
        >
          ← 返回翻译
        </a>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
      width="26"
      height="26"
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
