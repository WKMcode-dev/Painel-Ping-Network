import type { LucideIcon } from 'lucide-react'
import styles from './SummaryCard.module.css'

interface SummaryCardProps {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
  tone?: 'neutral' | 'success' | 'danger' | 'accent'
}

export function SummaryCard({ label, value, detail, icon: Icon, tone = 'neutral' }: SummaryCardProps) {
  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.topline}>
        <span>{label}</span>
        <span className={styles.icon}><Icon size={18} strokeWidth={1.8} /></span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}
