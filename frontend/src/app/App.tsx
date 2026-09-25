import { Activity, Gauge, Server, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DashboardHeader } from '../components/DashboardHeader/DashboardHeader'
import { HostDetails } from '../components/HostDetails/HostDetails'
import { NetworkMap } from '../components/NetworkMap/NetworkMap'
import { DeviceManager } from '../components/DeviceManager/DeviceManager'
import { SummaryCard } from '../components/SummaryCard/SummaryCard'
import { currentHost } from '../utils/panel'
import { usePanel } from '../hooks/usePanel'
import { TvControls } from '../components/TvControls/TvControls'
import { useMonitor } from '../hooks/useMonitor'
import { formatLatency, formatPercent } from '../utils/formatters'
import { Settings } from '../components/Settings/Settings'
import styles from './App.module.css'

export default function App() {
  const { snapshot, connection } = useMonitor()
  const panel = usePanel(snapshot, connection === 'live')
  const [tv, setTv] = useState(false)
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setTv(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleTv = async () => {
    if (tv) { setTv(false); if (document.fullscreenElement) await document.exitFullscreen(); return }
    setTv(true)
    try { await document.getElementById('infrastructure-map')?.requestFullscreen() }
    catch { /* The map-only TV layout still works when fullscreen is unavailable. */ }
  }
  const [group, setGroup] = useState('')
  const groups = useMemo(() => [...new Set(snapshot.hosts.filter(h => !panel.preferences.hidden.includes(h.id)).map(h => h.group))].sort(), [snapshot.hosts, panel.preferences.hidden])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const currentHosts = useMemo(() => snapshot.hosts.map(h => currentHost(h, connection === 'live', panel.now, snapshot.intervalMs)), [snapshot.hosts, snapshot.intervalMs, connection, panel.now])
  const online = currentHosts.filter(h => h.status === 'online').length
  const offline = currentHosts.filter(h => h.status === 'offline').length
  const available = online + offline ? online / (online + offline) * 100 : 0
  const latencies = currentHosts.filter(h => h.status === 'online').flatMap(h => h.latencyMs ?? [])
  const average = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
  const visibleHosts = currentHosts.filter(h => !panel.preferences.hidden.includes(h.id) && (!group || !groups.includes(group) || h.group === group))

  const selectedHost = currentHosts.find((host) => host.id === selectedId) ?? null
  return (
    <div className={`${styles.shell} ${tv ? styles.tv : ''}`}>
      {!tv && <DashboardHeader connection={connection} onSettings={() => setSettingsOpen(true)} onDevices={() => setDevicesOpen(true)} onTv={() => void toggleTv()} />}
      <main className={styles.main}>
        {!tv && connection !== 'live' && <p role="status" className={styles.notice}>{snapshot.generatedAt ? 'Conexão interrompida. Os dados abaixo são da última atualização; não representam o estado atual da rede.' : 'Aguardando o servidor de monitoramento. Nenhum resultado recebido ainda.'}</p>}
        {!tv && <section className={styles.summary} aria-label="Resumo da rede">
          <SummaryCard label="Dispositivos" value={snapshot.summary.total} detail={`${online} respondendo agora`} icon={Server} />
          <SummaryCard label="On-line" value={online} detail={`${formatPercent(available)} dos estados confirmados`} icon={Activity} tone="success" />
          <SummaryCard label="Incidentes ativos" value={offline} detail={offline ? 'Requer atenção' : 'Nenhum incidente confirmado'} icon={ShieldAlert} tone={offline ? 'danger' : 'success'} />
          <SummaryCard label="Latência média" value={formatLatency(average)} detail="Entre hosts disponíveis" icon={Gauge} tone="accent" />
        </section>}

        <div className={styles.tvBar}><TvControls tv={tv} onToggle={() => void toggleTv()} group={groups.includes(group) ? group : ''} groups={groups} onGroup={setGroup} seconds={panel.preferences.rotateSeconds} paused={settingsOpen || devicesOpen || Boolean(selectedId)} /></div>
        {!tv && panel.preferences.alerts && <div className={styles.notice}>
          <span>{panel.preferences.mutedUntil > panel.now ? 'Alertas silenciados por 15 minutos' : 'Alertas ativos para os dispositivos deste painel'}</span>{' '}
          <button onClick={() => panel.setPreferences({ ...panel.preferences, mutedUntil: panel.preferences.mutedUntil > panel.now ? 0 : Date.now() + 900000 })}>{panel.preferences.mutedUntil > panel.now ? 'Reativar' : 'Silenciar 15 min'}</button>{' '}
          {panel.preferences.sound && <button onClick={() => void panel.enableAudio()}>{panel.audioReady ? 'Áudio ativado' : 'Ativar áudio'}</button>}
          {panel.alerts.length > 0 && <div role="status">{panel.alerts.map((message, i) => <p key={i}>{message}</p>)}<button onClick={panel.clearAlerts}>Dispensar avisos</button></div>}
        </div>}
        <NetworkMap hosts={currentHosts} visibleIds={visibleHosts.map(h => h.id)} ready={Boolean(snapshot.generatedAt)} tv={tv} onDetails={setSelectedId} onDevices={() => setDevicesOpen(true)} onExitTv={() => void toggleTv()} />
      </main>

      <Settings preferences={panel.preferences} onPreferences={panel.setPreferences} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DeviceManager preferences={panel.preferences} onPreferences={panel.setPreferences} hosts={currentHosts} open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <HostDetails host={selectedHost} events={snapshot.recentEvents} onClose={() => setSelectedId(null)} />
    </div>
  )
}
