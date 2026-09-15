import { useEffect, useRef } from 'react'
import { Moon, Sun, X } from 'lucide-react'
import { version } from '../../../package.json'
import { useTheme } from '../../hooks/useTheme'
import { ColorSettings } from './ColorSettings'
import styles from './Settings.module.css'

interface SettingsProps { open: boolean; onClose: () => void }

export function Settings({ open, onClose }: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { theme, setTheme, colors, setColor, resetColors } = useTheme()

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="settings-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }}>
      <header className={styles.header}>
        <h2 id="settings-title">Configurações</h2>
        <button type="button" onClick={onClose} aria-label="Fechar configurações"><X size={20} /></button>
      </header>
      <section className={styles.section}>
        <h3>Aparência</h3>
        <p>Escolha o tema do painel. A preferência fica salva neste navegador.</p>
        <fieldset className={styles.choices}>
          <legend className="sr-only">Tema do painel</legend>
          <label><input type="radio" name="theme" value="light" checked={theme === 'light'} onChange={() => setTheme('light')} /><Sun size={22} /><span>Claro<small>Padrão da aplicação</small></span></label>
          <label><input type="radio" name="theme" value="dark" checked={theme === 'dark'} onChange={() => setTheme('dark')} /><Moon size={22} /><span>Escuro<small>Ambientes com pouca luz</small></span></label>
        </fieldset>
      </section>
      <ColorSettings theme={theme} colors={colors} onChange={setColor} onReset={resetColors} />
      <section className={styles.section}>
        <h3>Sobre a aplicação</h3>
        <dl className={styles.about}><div><dt>Aplicação</dt><dd>Painel Ping</dd></div><div><dt>Versão</dt><dd>{version}</dd></div></dl>
      </section>
    </dialog>
  )
}
