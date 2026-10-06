import styles from './NetworkMap.module.css'

const swatches = [
  '#243d81',
  '#005fb8',
  '#e36100',
  '#7da642',
  '#137d46',
  '#c64449',
  '#784aa7',
  '#303237',
]
export function ColorControl({
  label,
  value,
  fallback,
  onChange,
  onClear,
  presets = false,
}: {
  label: string
  value?: string
  fallback: string
  onChange: (hex: string) => void
  onClear: () => void
  presets?: boolean
}) {
  return (
    <div className={styles.colorControl}>
      <label>
        {label}
        <span className={styles.colorPicker}>
          <input
            type="color"
            aria-label={label}
            value={value ?? fallback}
            onChange={(e) => onChange(e.target.value)}
          />
          <code>{value ?? 'Tema'}</code>
        </span>
      </label>
      {presets && (
        <div className={styles.swatches} aria-label={`Cores prontas para ${label}`}>
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              className={styles.swatch}
              style={{ backgroundColor: hex }}
              title={hex}
              aria-label={`${label}: ${hex}`}
              onClick={() => onChange(hex)}
            />
          ))}
        </div>
      )}
      {value && (
        <button type="button" onClick={onClear}>
          Usar cor padrão
        </button>
      )}
    </div>
  )
}
