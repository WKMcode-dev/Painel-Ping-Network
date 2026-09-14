import { Activity, Gauge, Server, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DashboardHeader } from '../components/DashboardHeader/DashboardHeader'
import { HostDetails } from '../components/HostDetails/HostDetails'
import { HostGrid } from '../components/HostGrid/HostGrid'
import { SummaryCard } from '../components/SummaryCard/SummaryCard'
import { Toolbar, type StatusFilter } from '../components/Toolbar/Toolbar'
import { useMonitor } from '../hooks/useMonitor'
import { formatLatency, formatPercent } from '../utils/formatters'
import { Settings } from '../components/Settings/Settings'
import styles from './App.module.css'

export default function App() {
  const { snapshot, connection, refresh } = useMonitor()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const visibleHosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    return snapshot.hosts.filter((host) => {
      const matchesStatus = filter === 'all' || host.status === filter
      const searchable = `${host.name} ${host.address} ${host.location} ${host.group}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [filter, query, snapshot.hosts])

  const selectedHost = snapshot.hosts.find((host) => host.id === selectedId) ?? null
  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError('')
    try { await refresh() } catch { setRefreshError('Não foi possível atualizar. Verifique a conexão com o servidor.') } finally { setRefreshing(false) }
  }

  return (
    <div className={styles.shell}>
      <DashboardHeader connection={connection} onSettings={() => setSettingsOpen(true)} />
      <main className={styles.main}>
        <div className={styles.overview}>
          <div><span className={styles.eyebrow}>VISÃO GERAL DA REDE</span><h1>Disponibilidade em tempo real</h1><p>Atualizações automáticas{snapshot.intervalMs ? ` a cada ${snapshot.intervalMs / 1000} segundos` : ''}</p></div>
          <span className={styles.protocol}>ICMP • {connection === 'live' ? 'CONECTADO' : 'SEM ATUALIZAÇÕES'}</span>
        </div>

        {connection !== 'live' && <p role="status" className={styles.notice}>{snapshot.generatedAt ? 'Conexão interrompida. Os dados abaixo são da última atualização; não representam o estado atual da rede.' : 'Aguardando o servidor de monitoramento. Nenhum resultado recebido ainda.'}</p>}
        {refreshError && <p role="alert" className={styles.notice}>{refreshError}</p>}
        <section className={styles.summary} aria-label="Resumo da rede">
          <SummaryCard label="Dispositivos" value={snapshot.summary.total} detail={`${snapshot.summary.online} respondendo agora`} icon={Server} />
          <SummaryCard label="On-line" value={snapshot.summary.online} detail={`${formatPercent(snapshot.summary.availabilityPct)} da rede`} icon={Activity} tone="success" />
          <SummaryCard label="Incidentes ativos" value={snapshot.summary.activeIncidents} detail={snapshot.summary.activeIncidents ? 'Requer atenção' : 'Nenhuma indisponibilidade'} icon={ShieldAlert} tone={snapshot.summary.activeIncidents ? 'danger' : 'success'} />
          <SummaryCard label="Latência média" value={formatLatency(snapshot.summary.averageLatencyMs)} detail="Entre hosts disponíveis" icon={Gauge} tone="accent" />
        </section>

        <Toolbar query={query} filter={filter} total={visibleHosts.length} onQueryChange={setQuery} onFilterChange={setFilter} onRefresh={() => void handleRefresh()} refreshing={refreshing} canRefresh={connection === 'live'} />
        <HostGrid hosts={visibleHosts} onSelect={(host) => setSelectedId(host.id)} />
      </main>

      <footer className={styles.footer}><span>PAINEL PING • CENTRAL DE MONITORAMENTO</span><span>Disponibilidade observada por ICMP</span></footer>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HostDetails host={selectedHost} events={snapshot.recentEvents} onClose={() => setSelectedId(null)} />
    </div>
  )
}
