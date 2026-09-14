import { SearchX } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import { HostCard } from '../HostCard/HostCard'
import styles from './HostGrid.module.css'

interface HostGridProps {
  hosts: HostSnapshot[]
  onSelect: (host: HostSnapshot) => void
}

export function HostGrid({ hosts, onSelect }: HostGridProps) {
  if (!hosts.length) {
    return <div className={styles.empty}><SearchX size={28} /><strong>Nenhum dispositivo encontrado</strong><span>Ajuste a busca ou o filtro de status.</span></div>
  }
  return <div className={styles.grid}>{hosts.map((host) => <HostCard key={host.id} host={host} onSelect={onSelect} />)}</div>
}
