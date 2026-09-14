import type { HostStatus } from '../../types/monitor'
import styles from './StatusBadge.module.css'

const labels: Record<HostStatus, string> = {
  online: 'On-line',
  offline: 'Off-line',
  unknown: 'Verificando',
}

interface StatusBadgeProps {
  status: HostStatus
  compact?: boolean
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]} ${compact ? styles.compact : ''}`}>
      <span className={styles.dot} aria-hidden="true" />
      {compact ? <span className="sr-only">{labels[status]}</span> : labels[status]}
    </span>
  )
}
