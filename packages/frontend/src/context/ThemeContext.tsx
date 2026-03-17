import { useState, useEffect, type ReactNode } from 'react'
import { ThemeContext, THEMES, type ThemeId } from './useTheme'

const STORAGE_KEY = '1delta-vaults-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId
    return 'bitcoin'
  })

  const setTheme = (t: ThemeId) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
