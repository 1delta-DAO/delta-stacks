import { createContext, useContext } from 'react'

export const THEMES = [
  { id: 'bitcoin', label: 'Bitcoin', color: '#f7931a' },
  { id: 'midnight', label: 'Midnight', color: '#6366f1' },
  { id: 'light', label: 'Light', color: '#6366f1' },
  { id: 'forest', label: 'Forest', color: '#34d399' },
  { id: 'sunset', label: 'Sunset', color: '#f59e0b' },
  { id: 'ocean', label: 'Ocean', color: '#3b82f6' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'bitcoin',
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}
