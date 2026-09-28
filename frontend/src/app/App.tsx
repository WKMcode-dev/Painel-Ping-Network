import { Activity, Gauge, Server, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DashboardHeader } from '../components/DashboardHeader/DashboardHeader'
import { HostDetails } from '../components/HostDetails/HostDetails'
import { NetworkMap } from '../components/NetworkMap/NetworkMap'
import { DeviceManager } from '../components/DeviceManager/DeviceManager'
import { SummaryCard } from '../components/SummaryCard/SummaryCard'
import { HostGrid } from '../components/HostGrid/HostGrid'
import { Toolbar, type StatusFilter } from '../components/Toolbar/Toolbar'
import { Sidebar, type DashboardView } from '../components/Sidebar/Sidebar'
import { currentHost } from '../utils/panel'
import { usePanel } from '../hooks/usePanel'
import { TvControls } from '../components/TvControls/TvControls'
import { useMonitor } from '../hooks/useMonitor'
import { formatLatency, formatPercent } from '../utils/formatters'
import { Settings } from '../components/Settings/Settings'
import styles from './App.module.css'

export default function App() {
  const { snapshot, connection, refresh } = useMonitor()
  const panel = usePanel(snapshot, connection === 'live')
  const [view, setView] = useState<DashboardView>('cards')
  const [mapVisited, setMapVisited] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('painel-ping-sidebar') === 'collapsed')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [tv, setTv] = useState(false)
  const changeView = (next: DashboardView) => { if (next === 'map') setMapVisited(true); setView(next) }
  const toggleSidebar = () => setCollapsed(previous => { localStorage.setItem('painel-ping-sidebar', previous ? 'expanded' : 'collapsed'); return !previous })
  const refreshCards = async () => {
    setRefreshing(true); setRefreshError('')
    try { await refresh() }
    catch { setRefreshError('Não foi possível atualizar os dispositivos. Aguarde a próxima verificação automática.') }
    finally { setRefreshing(false) }
  }
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setTv(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleTv = async () => {
    if (tv) { setTv(false); if (document.fullscreenElement) await document.exitFullscreen(); return }
    // Enter fullscreen on the active section; keep that section mounted while presenting.
    const target = document.getElementById(view === 'cards' ? 'monitor-cards' : 'infrastructure-map')
    setTv(true)
    try { await target?.requestFullscreen() }
    catch { /* The section-only TV layout remains available without browser fullscreen. */ }
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
  const term = query.trim().toLocaleLowerCase('pt-BR')
  const cardHosts = visibleHosts.filter(h => (filter === 'all' || h.status === filter) && (!term || `${h.name} ${h.address} ${h.group} ${h.location}`.toLocaleLowerCase('pt-BR').includes(term)))
    .sort((a, b) => (a.status === 'offline' ? 0 : a.status === 'unknown' ? 1 : 2) - (b.status === 'offline' ? 0 : b.status === 'unknown' ? 1 : 2) || a.name.localeCompare(b.name, 'pt-BR'))

  const selectedHost = currentHosts.find((host) => host.id === selectedId) ?? null
  return (
    <div className={`${styles.shell} ${tv ? styles.tv : ''}`}>
      {!tv && <DashboardHeader connection={connection} onSettings={() => setSettingsOpen(true)} onDevices={() => setDevicesOpen(true)} onTv={() => void toggleTv()} />}
      <div className={styles.workspace} data-collapsed={collapsed}>
      {!tv && <Sidebar view={view} onView={changeView} collapsed={collapsed} onToggle={toggleSidebar} />}
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
        {view === 'cards' && <section id="monitor-cards" className={styles.cards} data-tv={tv} aria-label="Cartões dos dispositivos">
          {!tv && <Toolbar query={query} filter={filter} total={cardHosts.length} onQueryChange={setQuery} onFilterChange={setFilter} onRefresh={() => void refreshCards()} refreshing={refreshing} canRefresh={connection === 'live'} />}
          {!tv && refreshError && <p role="alert" className={styles.notice}>{refreshError}</p>}
          {tv && <div className={styles.tvExitBar}><button type="button" className={styles.exitTv} onClick={() => void toggleTv()}>Sair do modo TV</button></div>}
          <HostGrid hosts={cardHosts} onSelect={host => setSelectedId(host.id)} readOnly={tv} />
        </section>}
        {mapVisited && <div hidden={view !== 'map'}><NetworkMap hosts={currentHosts} visibleIds={visibleHosts.map(h => h.id)} ready={Boolean(snapshot.generatedAt)} tv={tv} onDetails={setSelectedId} onDevices={() => setDevicesOpen(true)} onExitTv={() => void toggleTv()} /></div>}
      </main>
      </div>

      <Settings preferences={panel.preferences} onPreferences={panel.setPreferences} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DeviceManager preferences={panel.preferences} onPreferences={panel.setPreferences} hosts={currentHosts} open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <HostDetails host={selectedHost} events={snapshot.recentEvents} onClose={() => setSelectedId(null)} />
    </div>
  )
}
