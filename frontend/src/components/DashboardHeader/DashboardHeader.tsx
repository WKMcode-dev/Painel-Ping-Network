import { Clock3, Expand, RadioTower, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConnectionState } from '../../types/monitor'
import styles from './DashboardHeader.module.css'

interface DashboardHeaderProps { connection: ConnectionState; onSettings: () => void }

const connectionLabels: Record<ConnectionState, string> = {
  connecting: 'Conectando',
  live: 'Monitoramento ao vivo',
  demo: 'Dados demonstrativos',
  reconnecting: 'Reconectando',
}

export function DashboardHeader({ connection, onSettings }: DashboardHeaderProps) {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo}><RadioTower size={21} /></span>
        <span><strong>PAINEL PING</strong><small>Central de disponibilidade</small></span>
      </div>
      <div className={styles.status} data-state={connection}>
        <span className={styles.pulse} />{connectionLabels[connection]}
      </div>
      <div className={styles.actions}>
        <span className={styles.clock}><Clock3 size={15} /><strong>{clock.toLocaleTimeString('pt-BR')}</strong><small>{clock.toLocaleDateString('pt-BR')}</small></span>
        <button onClick={onSettings} type="button" title="Configurações" aria-label="Abrir configurações"><Settings size={18} /></button>
        <button onClick={toggleFullscreen} type="button" title="Alternar tela cheia"><Expand size={17} /><span className="sr-only">Alternar tela cheia</span></button>
      </div>
    </header>
  )
}
