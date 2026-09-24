import { Activity, Gauge, Server, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DashboardHeader } from '../components/DashboardHeader/DashboardHeader'
import { HostDetails } from '../components/HostDetails/HostDetails'
import { HostGrid } from '../components/HostGrid/HostGrid'
import { SummaryCard } from '../components/SummaryCard/SummaryCard'
import { Toolbar, type StatusFilter } from '../components/Toolbar/Toolbar'
import { currentHost } from '../utils/panel'
import { usePanel } from '../hooks/usePanel'
import { TvControls } from '../components/Toolbar/TvControls'
import { useMonitor } from '../hooks/useMonitor'
import { formatLatency, formatPercent } from '../utils/formatters'
import { Settings } from '../components/Settings/Settings'
import styles from './App.module.css'

export default function App() {
  const { snapshot, connection, refresh } = useMonitor()
  const panel = usePanel(snapshot, connection === 'live')
  const [tv, setTv] = useState(false)
  const [group, setGroup] = useState('')
  const groups = useMemo(() => [...new Set(snapshot.hosts.filter(h => !panel.preferences.hidden.includes(h.id)).map(h => h.group))].sort(), [snapshot.hosts, panel.preferences.hidden])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const currentHosts = useMemo(() => snapshot.hosts.map(h => currentHost(h, connection === 'live', panel.now, snapshot.intervalMs)), [snapshot.hosts, snapshot.intervalMs, connection, panel.now])
  const online = currentHosts.filter(h => h.status === 'online').length
  const offline = currentHosts.filter(h => h.status === 'offline').length
  const available = online + offline ? online / (online + offline) * 100 : 0
  const latencies = currentHosts.filter(h => h.status === 'online').flatMap(h => h.latencyMs ?? [])
  const average = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
  const visibleHosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    return currentHosts.filter(h => !panel.preferences.hidden.includes(h.id) && (!group || !groups.includes(group) || h.group === group)).filter((host) => {
      const matchesStatus = filter === 'all' || host.status === filter
      const searchable = `${host.name} ${host.address} ${host.location} ${host.group}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery))
    }).sort((a, b) => {
      const priority = (h: typeof a) => h.suspended === 'Sem atualização' ? 1 : h.suspended ? 4 : h.status === 'offline' ? 0 : h.status === 'unknown' ? 2 : 3
      return priority(a) - priority(b) || a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [filter, query, currentHosts, group, groups, panel.preferences.hidden])

  const selectedHost = currentHosts.find((host) => host.id === selectedId) ?? null
  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError('')
    try { await refresh() } catch { setRefreshError('Não foi possível atualizar. Verifique a conexão com o servidor.') } finally { setRefreshing(false) }
  }

  return (
    <div className={`${styles.shell} ${tv ? styles.tv : ''}`}>
      <DashboardHeader connection={connection} onSettings={() => setSettingsOpen(true)} />
      <main className={styles.main}>
        <div className={styles.overview}>
          <div><span className={styles.eyebrow}>VISÃO GERAL DA REDE</span><h1>Disponibilidade em tempo real</h1><p>Atualizações automáticas{snapshot.intervalMs ? ` a cada ${snapshot.intervalMs / 1000} segundos` : ''}</p></div>
          <span className={styles.protocol}>ICMP • {connection === 'live' ? 'CONECTADO' : 'SEM ATUALIZAÇÕES'}</span>
        </div>

        {connection !== 'live' && <p role="status" className={styles.notice}>{snapshot.generatedAt ? 'Conexão interrompida. Os dados abaixo são da última atualização; não representam o estado atual da rede.' : 'Aguardando o servidor de monitoramento. Nenhum resultado recebido ainda.'}</p>}
        {refreshError && <p role="alert" className={styles.notice}>{refreshError}</p>}
        <section className={styles.summary} aria-label="Resumo da rede">
          <SummaryCard label="Dispositivos" value={snapshot.summary.total} detail={`${online} respondendo agora`} icon={Server} />
          <SummaryCard label="On-line" value={online} detail={`${formatPercent(available)} dos estados confirmados`} icon={Activity} tone="success" />
          <SummaryCard label="Incidentes ativos" value={offline} detail={offline ? 'Requer atenção' : 'Nenhum incidente confirmado'} icon={ShieldAlert} tone={offline ? 'danger' : 'success'} />
          <SummaryCard label="Latência média" value={formatLatency(average)} detail="Entre hosts disponíveis" icon={Gauge} tone="accent" />
        </section>

        <TvControls tv={tv} onTv={setTv} group={groups.includes(group) ? group : ''} groups={groups} onGroup={setGroup} seconds={panel.preferences.rotateSeconds} paused={settingsOpen || Boolean(selectedId)} />
        {panel.preferences.alerts && <div className={styles.notice}>
          <span>{panel.preferences.mutedUntil > panel.now ? 'Alertas silenciados por 15 minutos' : 'Alertas ativos para os dispositivos deste painel'}</span>{' '}
          <button onClick={() => panel.setPreferences({ ...panel.preferences, mutedUntil: panel.preferences.mutedUntil > panel.now ? 0 : Date.now() + 900000 })}>{panel.preferences.mutedUntil > panel.now ? 'Reativar' : 'Silenciar 15 min'}</button>{' '}
          {panel.preferences.sound && <button onClick={() => void panel.enableAudio()}>{panel.audioReady ? 'Áudio ativado' : 'Ativar áudio'}</button>}
          {panel.alerts.length > 0 && <div role="status">{panel.alerts.map((message, i) => <p key={i}>{message}</p>)}<button onClick={panel.clearAlerts}>Dispensar avisos</button></div>}
        </div>}
        <p>Resumo acima: todos os dispositivos cadastrados. Lista abaixo: seleção e filtros deste painel.</p>
        <Toolbar query={query} filter={filter} total={visibleHosts.length} onQueryChange={setQuery} onFilterChange={setFilter} onRefresh={() => void handleRefresh()} refreshing={refreshing} canRefresh={connection === 'live'} />
        <HostGrid hosts={visibleHosts} onSelect={(host) => setSelectedId(host.id)} />
      </main>

      <footer className={styles.footer}><span>PAINEL PING • CENTRAL DE MONITORAMENTO</span><span>Disponibilidade observada por ICMP</span></footer>
      <Settings preferences={panel.preferences} onPreferences={panel.setPreferences} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HostDetails host={selectedHost} events={snapshot.recentEvents} onClose={() => setSelectedId(null)} />
    </div>
  )
}
