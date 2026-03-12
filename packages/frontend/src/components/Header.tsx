import { useState, useRef, useEffect } from 'react'
import { useWallet } from '../context/WalletContext'
import { useTheme, THEMES, type ThemeId } from '../context/ThemeContext'
import staultLogo from '../assets/stault.png'

/** SVG icons for each theme — small, crisp, and distinct */
function ThemeIcon({ id, className = 'w-4 h-4' }: { id: ThemeId; className?: string }) {
  switch (id) {
    case 'bitcoin':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M14.24 10.56c-.31 1.24-2.24.73-2.88.58l.55-2.18c.64.16 2.67.47 2.33 1.6zm-1.31 3.43c-.36 1.46-2.74.87-3.51.69l.62-2.49c.77.19 3.28.57 2.89 1.8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.93 9.67c-.17 1.15-1.04 1.7-2.24 1.91 1.53.47 2.2 1.42 1.74 2.97-.56 1.9-2.41 2.07-4.61 1.57l-.37 1.49-.9-.22.37-1.47c-.23-.06-.47-.12-.72-.19l-.37 1.48-.9-.22.37-1.5c-.21-.05-.42-.1-.63-.16l-1.24-.31.46-1.06s.66.17.65.16c.36.09.53-.15.59-.3l.58-2.31.1.03-.1-.02.8-3.23c.03-.26-.04-.58-.51-.7.02-.01-.65-.16-.65-.16l.24-.96 1.31.32c.22.06.44.11.66.16l.37-1.47.9.22-.36 1.43c.24.06.49.11.73.17l.36-1.42.9.22-.37 1.47c1.9.45 3.19 1.09 2.96 2.61z" />
        </svg>
      )
    case 'midnight':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z" />
          <path d="M19 3v4M21 5h-4" />
        </svg>
      )
    case 'light':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )
    case 'forest':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L7 9h3l-4 7h4l-5 8h14l-5-8h4l-4-7h3z" />
        </svg>
      )
    case 'sunset':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41" />
          <path d="M17.66 17.66A8 8 0 006.34 17.66" />
          <path d="M2 22h20" />
        </svg>
      )
    case 'ocean':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12c1.5-2 3.5-3 5.5-1.5S11 13 12.5 11s3-3 5.5-1.5S22 12 22 12" />
          <path d="M2 17c1.5-2 3.5-3 5.5-1.5S11 18 12.5 16s3-3 5.5-1.5S22 17 22 17" />
          <path d="M2 7c1.5-2 3.5-3 5.5-1.5S11 8 12.5 6s3-3 5.5-1.5S22 7 22 7" />
        </svg>
      )
  }
}

export function Header() {
  const { connected, stxAddress, connecting, connect, disconnect } = useWallet()
  const { theme, setTheme } = useTheme()
  const [themeOpen, setThemeOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const truncated = stxAddress
    ? `${stxAddress.slice(0, 6)}...${stxAddress.slice(-4)}`
    : ''

  const currentTheme = THEMES.find((t) => t.id === theme)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setThemeOpen(false)
      }
    }
    if (themeOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [themeOpen])

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/60 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <img src={staultLogo} alt="1delta Vaults" className="w-9 h-9 rounded-xl object-contain drop-shadow-lg" />
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-primary via-accent-purple to-accent-blue bg-clip-text text-transparent">
            1delta Vaults
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Theme switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-alt hover:bg-surface-hover border border-border text-text-muted hover:text-text transition-all duration-200"
            title="Switch theme"
          >
            <ThemeIcon id={theme} className="w-3.5 h-3.5" />
            <svg className={`w-3 h-3 transition-transform duration-200 ${themeOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {themeOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-surface border border-border shadow-xl shadow-black/20 overflow-hidden z-50 py-1">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id)
                    setThemeOpen(false)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all duration-150 ${
                    t.id === theme
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-muted hover:text-text hover:bg-surface-hover'
                  }`}
                >
                  {/* Color swatch */}
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/10"
                    style={{ backgroundColor: t.color }}
                  />
                  <ThemeIcon id={t.id} className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.label}</span>
                  {t.id === theme && (
                    <svg className="w-3 h-3 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wallet */}
        {connected ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-alt border border-border">
              <span className="w-2 h-2 rounded-full bg-positive animate-pulse" />
              <span className="text-xs text-text-muted font-mono">{truncated}</span>
            </div>
            <button
              onClick={disconnect}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-surface-alt hover:bg-surface-hover border border-border text-text-muted hover:text-text transition-all duration-200"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="px-5 py-2.5 text-sm rounded-lg bg-gradient-to-r from-primary to-primary-hover text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:hover:shadow-none disabled:hover:translate-y-0"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
