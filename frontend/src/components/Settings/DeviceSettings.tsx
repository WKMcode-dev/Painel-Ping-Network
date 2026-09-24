import { useEffect, useState } from 'react'
import { configurationRequest } from '../../services/monitor-api'
import type { MonitorConfig, DeviceConfig, PanelPreferences } from '../../types/config'
import styles from './Operations.module.css'

const localDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const utcDate = (value: string) => value ? new Date(value).toISOString() : null

export function DeviceSettings({ preferences, onPreferences }: {
  preferences: PanelPreferences; onPreferences: (p: PanelPreferences) => void
}) {
  const [config, setConfig] = useState<MonitorConfig | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => { setError(''); void configurationRequest().then(setConfig).catch(e => setError(String(e))) }
  useEffect(load, [])
  const change = (id: string, patch: Partial<DeviceConfig>) => {
    setMessage(''); setConfig(c => c && ({ ...c, hosts: c.hosts.map(h => h.id === id ? { ...h, ...patch } : h) }))
  }
  const save = async () => {
    if (!config) return
    setBusy(true); setError(''); setMessage('')
    try { setConfig(await configurationRequest(config)); setMessage('Configuração salva no servidor.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar') }
    finally { setBusy(false) }
  }
  return <section className={styles.section}>
    <h3>Dispositivos e monitoramento</h3>
    <p>Após editar o cadastro, clique em “Salvar cadastro e regras” antes de fechar esta janela.</p>
    <p>Cadastro, confirmações e manutenção valem para todos os painéis. A seleção para TV e os alertas ficam neste navegador.</p>
    {error && <p role="alert">{error}</p>}
    {!config ? <button type="button" onClick={load}>Recarregar cadastro</button> : <>
      <fieldset disabled={busy} className={styles.fields}>
        <label>Falhas para confirmar queda<input type="number" min="1" max="20" value={config.failureThreshold} onChange={e => setConfig({ ...config, failureThreshold: Number(e.target.value) })} /></label>
        <label>Respostas para confirmar retorno<input type="number" min="1" max="20" value={config.recoveryThreshold} onChange={e => setConfig({ ...config, recoveryThreshold: Number(e.target.value) })} /></label>
        {config.hosts.map(host => <fieldset className={styles.device} key={host.id}>
          <legend>{host.name || 'Novo dispositivo'}</legend>
          <div className={styles.fields}>
            {(['name', 'address', 'group', 'location'] as const).map((key, i) => <label key={key}>{['Nome', 'IP ou hostname', 'Setor', 'Local'][i]}<input maxLength={key === 'address' ? 253 : 100} value={host[key]} onChange={e => change(host.id, { [key]: e.target.value })} /></label>)}
            <label>Início da manutenção<input type="datetime-local" value={localDate(host.maintenanceStart)} onChange={e => change(host.id, { maintenanceStart: utcDate(e.target.value) })} /></label>
            <label>Fim da manutenção<input type="datetime-local" value={localDate(host.maintenanceEnd)} onChange={e => change(host.id, { maintenanceEnd: utcDate(e.target.value) })} /></label>
          </div>
          <label><input type="checkbox" checked={host.enabled} onChange={e => change(host.id, { enabled: e.target.checked })} /> Monitoramento ativo</label>
          <label><input type="checkbox" checked={!preferences.hidden.includes(host.id)} onChange={e => onPreferences({ ...preferences, hidden: e.target.checked ? preferences.hidden.filter(id => id !== host.id) : [...preferences.hidden, host.id] })} /> Exibir neste painel / TV</label>
          <div className={styles.actions}><button type="button" onClick={() => change(host.id, { maintenanceStart: null, maintenanceEnd: null })}>Limpar manutenção</button>
          <button type="button" onClick={() => { if (window.confirm(`Remover ${host.name}? O histórico será preservado pelo período de retenção.`)) setConfig({ ...config, hosts: config.hosts.filter(h => h.id !== host.id) }) }}>Remover dispositivo</button></div>
        </fieldset>)}
        <div className={styles.actions}><button type="button" onClick={() => setConfig({ ...config, hosts: [...config.hosts, { id: `device-${Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')}`, name: '', address: '', group: 'Geral', location: '', enabled: true }] })}>Adicionar dispositivo</button>
        <button type="button" onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar cadastro e regras'}</button></div>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </>}
    <h3>TV e alertas deste navegador</h3>
    <div className={styles.fields}>
      <label>Rotação dos setores (segundos; 0 desativa)<input type="number" min="0" max="300" value={preferences.rotateSeconds} onChange={e => onPreferences({ ...preferences, rotateSeconds: Math.min(300, Math.max(0, Number(e.target.value))) })} /></label>
      <label><input type="checkbox" checked={preferences.alerts} onChange={e => onPreferences({ ...preferences, alerts: e.target.checked })} /> Alertas visuais para novas quedas e retornos confirmados</label>
      <label><input type="checkbox" checked={preferences.sound} onChange={e => onPreferences({ ...preferences, sound: e.target.checked })} /> Som de alerta (ative o áudio no painel)</label>
    </div>
    <p>Horários de manutenção usam o fuso deste computador. Durante a pausa ou manutenção, não são feitas sondagens nem gerados novos incidentes.</p>
  </section>
}
