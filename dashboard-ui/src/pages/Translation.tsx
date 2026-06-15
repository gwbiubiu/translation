import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

const LANG_NAME: Record<string, string> = { zh: '中文', en: '英文' }

function detectLang(text: string): 'zh' | 'en' {
  return /[一-鿿]/.test(text) ? 'zh' : 'en'
}

export default function Translation() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [fromLang, setFromLang] = useState('')
  const [toLang, setToLang] = useState('')
  const [translating, setTranslating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTextRef = useRef('')

  useEffect(() => {
    api.me().then(() => setLoggedIn(true)).catch(() => setLoggedIn(false))
  }, [])

  const doTranslate = async (text: string) => {
    if (text === lastTextRef.current) return
    lastTextRef.current = text
    setTranslating(true)
    setOutput('')
    try {
      const res = await fetch('/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'include',
      })
      const data = await res.json()
      setTranslating(false)
      if (data.translated) {
        setOutput(data.translated)
        setFromLang(data.from || '')
        setToLang(data.to || '')
      }
    } catch {
      setTranslating(false)
    }
  }

  const handleInput = (text: string) => {
    setInput(text)
    if (!text.trim()) {
      lastTextRef.current = ''
      setOutput('')
      setFromLang('')
      setToLang('')
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    const from = detectLang(text)
    setFromLang(from)
    setToLang(from === 'zh' ? 'en' : 'zh')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doTranslate(text), 600)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
              <TranslateIcon />
            </div>
            <span className="text-[15px] font-semibold text-gray-900">智能翻译</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-indigo-500">翻译</span>
            {loggedIn === true && (
              <Link
                to="/dashboard"
                className="text-sm text-gray-500 hover:text-indigo-500 transition-colors duration-150 no-underline"
              >
                个人中心
              </Link>
            )}
            {loggedIn === false && (
              <Link
                to="/login"
                className="text-sm text-gray-500 hover:text-indigo-500 transition-colors duration-150 no-underline"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Lang bar */}
          <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-100" style={{ padding: '10px 20px' }}>
            <span className="text-xs font-medium rounded-full bg-indigo-50 text-indigo-600" style={{ padding: '2px 12px' }}>
              {fromLang ? (LANG_NAME[fromLang] || fromLang) : '自动检测'}
            </span>
            <span className="text-gray-300 text-sm select-none">→</span>
            <span className="text-xs font-medium rounded-full bg-indigo-50 text-indigo-600" style={{ padding: '2px 12px' }}>
              {toLang ? (LANG_NAME[toLang] || toLang) : '目标语言'}
            </span>
          </div>

          {/* Two panels — side by side */}
          <div className="flex" style={{ minHeight: '320px' }}>
            {/* Input panel */}
            <div className="flex flex-col flex-1">
              <textarea
                className="flex-1 border-none outline-none resize-none text-gray-900 bg-transparent placeholder:text-gray-300 focus:ring-0 leading-relaxed"
                style={{ padding: '20px', fontSize: '15px', minHeight: '280px' }}
                placeholder="输入中文或英文，自动识别并翻译…"
                value={input}
                onChange={(e) => handleInput(e.target.value)}
                aria-label="输入文本"
              />
              <div className="flex items-center justify-between border-t border-gray-50" style={{ padding: '8px 16px', minHeight: '40px' }}>
                <span className="text-xs text-gray-300 tabular-nums">{input.length} 字符</span>
                {input && (
                  <button
                    onClick={() => handleInput('')}
                    className="text-xs text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer rounded-md hover:bg-gray-50 transition-colors duration-150"
                    style={{ padding: '4px 8px' }}
                    aria-label="清空输入"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* Vertical divider */}
            <div className="bg-gray-100" style={{ width: '1px', flexShrink: 0 }} />

            {/* Output panel */}
            <div className="flex flex-col flex-1">
              <div className="flex-1 overflow-y-auto leading-relaxed" style={{ padding: '20px', fontSize: '15px', minHeight: '280px' }}>
                {translating ? (
                  <div className="h-full flex items-center justify-center">
                    <div
                      className="border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin"
                      style={{ width: '20px', height: '20px' }}
                      role="status"
                      aria-label="翻译中"
                    />
                  </div>
                ) : output ? (
                  <span className="text-gray-900 whitespace-pre-wrap">{output}</span>
                ) : (
                  <span className="text-gray-300 select-none">翻译结果将显示在这里</span>
                )}
              </div>
              <div className="flex items-center justify-end border-t border-gray-50" style={{ padding: '8px 16px', minHeight: '40px' }}>
                {output && (
                  <button
                    onClick={handleCopy}
                    className="text-xs text-indigo-500 hover:text-indigo-700 bg-transparent border-none cursor-pointer rounded-md hover:bg-indigo-50 transition-colors duration-150 focus:outline-none"
                    style={{ padding: '4px 8px' }}
                    aria-label="复制翻译结果"
                  >
                    {copied ? '已复制 ✓' : '复制'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function TranslateIcon() {
  return (
    <svg
      width="16"
      height="16"
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
