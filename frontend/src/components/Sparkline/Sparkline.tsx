import { useId } from 'react'
import type { HistoryPoint } from '../../types/monitor'
import styles from './Sparkline.module.css'

interface SparklineProps {
  points: HistoryPoint[]
  offline?: boolean
}

export function Sparkline({ points, offline = false }: SparklineProps) {
  const gradientId = useId().replace(/:/g, '')
  const values = points.flatMap((point) => point.latencyMs ?? [])
  const max = Math.max(...values, 1)
  const coordinates = points
    .map((point, index) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100
      const y = point.latencyMs === null ? 36 : 36 - (point.latencyMs / max) * 30
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg className={`${styles.chart} ${offline ? styles.offline : ''}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Histórico recente de latência">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="36" x2="100" y2="36" className={styles.guide} />
      {coordinates ? <>
        <polygon points={`0,40 ${coordinates} 100,40`} fill={`url(#${gradientId})`} />
        <polyline points={coordinates} className={styles.line} />
      </> : null}
    </svg>
  )
}
