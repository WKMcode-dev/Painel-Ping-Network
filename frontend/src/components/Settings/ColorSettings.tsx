import { useEffect, useState } from 'react'
import { presets, validColor, type ColorKey, type Theme } from '../../theme/palette'
import styles from './Settings.module.css'

interface Props {
  theme: Theme
  colors: Record<ColorKey, string>
  onChange: (key: ColorKey, color: string) => void
  onReset: () => void
}
const labels: Record<ColorKey, string> = {
  accent: 'Destaque', success: 'On-line', danger: 'Off-line', warning: 'Avisos', background: 'Fundo do painel', surface: 'Fundo dos cartões',
}
function ColorField({ name, color, onChange }: { name: string; color: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(color)
  useEffect(() => { setDraft(color) }, [color])
  const invalid = !validColor(draft)
  return <div className={styles.colorRow}>
    <span>{name}</span>
    <input type="color" aria-label={`Escolher cor: ${name}`} value={color} onChange={(e) => onChange(e.target.value)} />
    <input aria-label={`HEX: ${name}`} aria-invalid={invalid} value={draft} maxLength={7} spellCheck={false}
      onChange={(e) => { setDraft(e.target.value); if (validColor(e.target.value)) onChange(e.target.value) }}
      onBlur={() => { if (invalid) setDraft(color) }} />
  </div>
}
export function ColorSettings({ theme, colors, onChange, onReset }: Props) {
  return <section className={styles.section}>
    <h3>Cores</h3>
    <p>Paleta inspirada no Notion. Personalize o tema {theme === 'light' ? 'claro' : 'escuro'}; cada tema guarda suas próprias cores.</p>
    <fieldset className={styles.presets}><legend>Cor de destaque predefinida</legend>
      {presets.map((preset) => <button key={preset.name} type="button" aria-pressed={colors.accent === preset[theme]} onClick={() => onChange('accent', preset[theme])}>
        <span style={{ backgroundColor: preset[theme] }} />{preset.name}
      </button>)}
    </fieldset>
    <p>Ou escolha qualquer cor pelo seletor ou código HEX (#RRGGBB).</p>
    {Object.entries(labels).map(([key, label]) => <ColorField key={`${theme}-${key}`} name={label} color={colors[key as ColorKey]} onChange={(value) => onChange(key as ColorKey, value)} />)}
    <button className={styles.reset} type="button" onClick={onReset}>Restaurar paleta deste tema</button>
  </section>
}
