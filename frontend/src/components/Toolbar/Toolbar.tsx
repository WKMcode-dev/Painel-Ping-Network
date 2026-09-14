import { RefreshCw, Search } from 'lucide-react'
import type { HostStatus } from '../../types/monitor'
import styles from './Toolbar.module.css'

export type StatusFilter = 'all' | HostStatus

interface ToolbarProps {
  query: string
  filter: StatusFilter
  total: number
  onQueryChange: (value: string) => void
  onFilterChange: (value: StatusFilter) => void
  onRefresh: () => void
  refreshing: boolean
  canRefresh: boolean
}

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'online', label: 'On-line' },
  { value: 'offline', label: 'Off-line' },
  { value: 'unknown', label: 'Verificando' },
]

export function Toolbar({ query, filter, total, onQueryChange, onFilterChange, onRefresh, refreshing, canRefresh }: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.title}><strong>Dispositivos monitorados</strong><span>{total} exibidos</span></div>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Buscar dispositivo</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar nome, IP ou local…" />
      </label>
      <div className={styles.filters} aria-label="Filtrar por status">
        {filters.map((item) => <button key={item.value} className={filter === item.value ? styles.active : ''} onClick={() => onFilterChange(item.value)} type="button">{item.label}</button>)}
      </div>
      <button className={styles.refresh} onClick={onRefresh} disabled={!canRefresh || refreshing} type="button" title="Verificar agora">
        <RefreshCw size={16} className={refreshing ? styles.spinning : ''} />
        <span>Atualizar</span>
      </button>
    </div>
  )
}
