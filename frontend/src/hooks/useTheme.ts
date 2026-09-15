import { useEffect, useState } from 'react'
import { applyAppearance, defaults, loadColors, validColor, type ColorKey, type Theme } from '../theme/palette'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [colors, setColors] = useState(loadColors)
  useEffect(() => {
    applyAppearance(theme, colors[theme])
    try {
      localStorage.setItem('painel-ping:theme', theme)
      localStorage.setItem('painel-ping:colors', JSON.stringify(colors))
    } catch { /* Appearance remains usable without storage. */ }
  }, [theme, colors])
  const setColor = (key: ColorKey, color: string) => {
    if (validColor(color)) setColors((previous) => ({ ...previous, [theme]: { ...previous[theme], [key]: color } }))
  }
  const resetColors = () => setColors((previous) => ({ ...previous, [theme]: {} }))
  return { theme, setTheme, colors: { ...defaults[theme], ...colors[theme] }, setColor, resetColors }
}
