import { Activity, MapPin, Network } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import { formatDateTime, formatDuration, formatLatency, formatPercent } from '../../utils/formatters'
import { Sparkline } from '../Sparkline/Sparkline'
import { StatusBadge } from '../StatusBadge/StatusBadge'
import styles from './HostCard.module.css'

interface HostCardProps {
  host: HostSnapshot
  onSelect: (host: HostSnapshot) => void
}

export function HostCard({ host, onSelect }: HostCardProps) {
  const isOffline = host.status === 'offline'

  return (
    <button className={`${styles.card} ${styles[host.status]}`} onClick={() => onSelect(host)} type="button">
      <span className={styles.accent} aria-hidden="true" />
      <span className={styles.header}>
        <span className={styles.deviceIcon}><Network size={20} strokeWidth={1.7} /></span>
        <span className={styles.identity}>
          <strong>{host.name}</strong>
          <span>{host.address}</span>
        </span>
        <StatusBadge status={host.status} />
      </span>

      <span className={styles.location}><MapPin size={13} /> {host.location}<i />{host.group}</span>

      <span className={styles.metrics}>
        <span><small>{isOffline ? 'Indisponível há' : 'Latência'}</small><b>{isOffline ? formatDuration(host.currentDowntimeMs) : formatLatency(host.latencyMs)}</b></span>
        <span><small>Perda</small><b>{formatPercent(host.packetLossPct)}</b></span>
        <span><small>Respostas na janela</small><b>{formatPercent(host.availabilityPct)}</b></span>
      </span>

      <span className={styles.chart}>
        <Sparkline points={host.history} offline={isOffline} />
      </span>
      <span className={styles.footer}>
        <span><Activity size={13} /> Última verificação {formatDateTime(host.lastCheckedAt)}</span>
        <span>Ver detalhes →</span>
      </span>
    </button>
  )
}
