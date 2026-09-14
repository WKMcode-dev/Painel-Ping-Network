import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const storageKey = 'painel-ping:theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080b10' : '#f3f6fa')
    try { localStorage.setItem(storageKey, theme) } catch { /* Still usable without browser storage. */ }
  }, [theme])

  return { theme, setTheme }
}
