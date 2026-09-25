import { useEffect, useState } from 'react'
import { configurationRequest } from '../../services/monitor-api'
import type { MonitorConfig, PanelPreferences } from '../../types/config'
import styles from './Operations.module.css'

export function MonitorRules({ preferences, onPreferences }: { preferences: PanelPreferences; onPreferences: (p: PanelPreferences) => void }) {
  const [config, setConfig] = useState<MonitorConfig | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void configurationRequest().then(setConfig).catch(e => setError(String(e))) }, [])
  const save = async () => {
    if (!config) return
    setBusy(true); setMessage(''); setError('')
    try { setConfig(await configurationRequest(config)); setMessage('Regras salvas no servidor.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar regras') }
    finally { setBusy(false) }
  }
  return <section className={styles.section}>
    <h3>Regras de monitoramento</h3>
    <p>As confirmações de queda e retorno valem para todos os dispositivos. Cadastre e edite endereços pelo botão <strong>Dispositivos</strong> no topo do painel.</p>
    {config && <div className={styles.fields}>
      <label>Falhas para confirmar queda<input type="number" min="1" max="20" value={config.failureThreshold} onChange={e => setConfig({ ...config, failureThreshold: Number(e.target.value) })} /></label>
      <label>Respostas para confirmar retorno<input type="number" min="1" max="20" value={config.recoveryThreshold} onChange={e => setConfig({ ...config, recoveryThreshold: Number(e.target.value) })} /></label>
      <button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar regras'}</button>
    </div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <h3>TV e alertas neste navegador</h3>
    <div className={styles.fields}>
      <label>Rotação dos setores (segundos; 0 desativa)<input type="number" min="0" max="300" value={preferences.rotateSeconds} onChange={e => onPreferences({ ...preferences, rotateSeconds: Math.min(300, Math.max(0, Number(e.target.value))) })} /></label>
      <label><input type="checkbox" checked={preferences.alerts} onChange={e => onPreferences({ ...preferences, alerts: e.target.checked })} /> Alertas visuais para quedas e retornos confirmados</label>
      <label><input type="checkbox" checked={preferences.sound} onChange={e => onPreferences({ ...preferences, sound: e.target.checked })} /> Som de alerta</label>
    </div>
  </section>
}
