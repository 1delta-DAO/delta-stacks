import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export const THEMES = [
  { id: 'bitcoin', label: 'Bitcoin', color: '#f7931a' },
  { id: 'midnight', label: 'Midnight', color: '#6366f1' },
  { id: 'light', label: 'Light', color: '#6366f1' },
  { id: 'forest', label: 'Forest', color: '#34d399' },
  { id: 'sunset', label: 'Sunset', color: '#f59e0b' },
  { id: 'ocean', label: 'Ocean', color: '#3b82f6' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'bitcoin',
  setTheme: () => {},
})

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

export function useTheme() {
  return useContext(ThemeContext)
}
