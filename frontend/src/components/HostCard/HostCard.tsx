import { privateLabel } from '../../utils/privacy'
import { Activity, MapPin, Network } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import {
  formatDateTime,
  formatDuration,
  formatLatency,
  formatPercent,
} from '../../utils/formatters'
import { Sparkline } from '../Sparkline/Sparkline'
import { StatusBadge } from '../StatusBadge/StatusBadge'
import styles from './HostCard.module.css'

interface HostCardProps {
  host: HostSnapshot
  onSelect: (host: HostSnapshot) => void
  readOnly?: boolean
}

export function HostCard({ host, onSelect, readOnly = false }: HostCardProps) {
  const isOffline = host.status === 'offline'

  return (
    <button
      className={`${styles.card} ${styles[host.status]}`}
      onClick={() => onSelect(host)}
      type="button"
      disabled={readOnly}
    >
      <span className={styles.accent} aria-hidden="true" />
      <span className={styles.header}>
        <span className={styles.deviceIcon}>
          <Network size={20} strokeWidth={1.7} />
        </span>
        <span className={styles.identity}>
          <strong>{privateLabel(host.name, host.address)}</strong>
          <span>Dispositivo monitorado</span>
        </span>
        {host.suspended ? <span>{host.suspended}</span> : <StatusBadge status={host.status} />}
      </span>

      <span className={styles.location}>
        <MapPin size={13} /> {privateLabel(host.location, host.address)}
        <i />
        {privateLabel(host.group, host.address)}
      </span>

      <span className={styles.metrics}>
        <span>
          <small>{isOffline ? 'Indisponível há' : 'Latência'}</small>
          <b>
            {isOffline ? formatDuration(host.currentDowntimeMs) : formatLatency(host.latencyMs)}
          </b>
        </span>
        <span>
          <small>Perda</small>
          <b>{host.history.length ? formatPercent(host.packetLossPct) : '—'}</b>
        </span>
        <span>
          <small>Respostas na janela</small>
          <b>
            {host.history.length ? formatPercent(host.responsePct ?? host.availabilityPct) : '—'}
          </b>
        </span>
      </span>

      {!!host.serviceChecks?.length && (
        <span className={styles.location}>
          Serviços: {host.serviceChecks.filter((check) => check.status === 'available').length}/
          {host.serviceChecks.length} disponíveis
          {host.serviceChecks.some((check) => check.status === 'unknown')
            ? ' · há verificações indisponíveis'
            : ''}
        </span>
      )}
      <span className={styles.chart}>
        <Sparkline points={host.history} offline={isOffline} />
      </span>
      <span className={styles.footer}>
        <span>
          <Activity size={13} /> Última verificação {formatDateTime(host.lastCheckedAt)}
        </span>
        {!readOnly && <span>Ver detalhes →</span>}
      </span>
    </button>
  )
}
