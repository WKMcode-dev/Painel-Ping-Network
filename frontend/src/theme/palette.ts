export type Theme = 'light' | 'dark'
export const colorKeys = ['accent', 'success', 'danger', 'warning', 'background', 'surface'] as const
export type ColorKey = typeof colorKeys[number]
export type Colors = Partial<Record<ColorKey, string>>
export const presets = [
  { name: 'Grafite', light: '#37352f', dark: '#d4d4d4' },
  { name: 'Marrom', light: '#906542', dark: '#c9a88a' },
  { name: 'Laranja', light: '#ad5700', dark: '#e5a36b' },
  { name: 'Amarelo', light: '#896300', dark: '#d3b66c' },
  { name: 'Verde', light: '#427558', dark: '#8db69b' },
  { name: 'Azul', light: '#3375a3', dark: '#83b2d2' },
  { name: 'Roxo', light: '#8055a0', dark: '#b69bcc' },
  { name: 'Rosa', light: '#a74679', dark: '#d293b6' },
  { name: 'Vermelho', light: '#b34b45', dark: '#de928d' },
]
export const defaults: Record<Theme, Record<ColorKey, string>> = {
  light: { accent: '#37352f', success: '#427558', danger: '#b34b45', warning: '#896300', background: '#ffffff', surface: '#f7f7f5' },
  dark: { accent: '#d4d4d4', success: '#8db69b', danger: '#de928d', warning: '#d3b66c', background: '#191919', surface: '#202020' },
}
export const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
export function readableText(color: string): string {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  return .2126 * r + .7152 * g + .0722 * b > .179 ? '#202020' : '#f5f5f5'
}
export function loadColors(): Record<Theme, Colors> {
  const result: Record<Theme, Colors> = { light: {}, dark: {} }
  try {
    const saved = JSON.parse(localStorage.getItem('painel-ping:colors') ?? '{}')
    for (const theme of ['light', 'dark'] as const) for (const key of colorKeys) {
      if (validColor(saved?.[theme]?.[key])) result[theme][key] = saved[theme][key]
    }
  } catch { /* Invalid or blocked storage falls back to defaults. */ }
  return result
}
export function applyAppearance(theme: Theme, colors: Colors) {
  const root = document.documentElement
  root.dataset.theme = theme
  const resolved = { ...defaults[theme], ...colors }
  for (const key of colorKeys) root.style.setProperty(`--${key}`, resolved[key])
  root.style.setProperty('--text', readableText(resolved.surface))
  root.style.setProperty('--page-text', readableText(resolved.background))
  root.style.setProperty('--accent-ink', readableText(resolved.accent))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved.background)
}
