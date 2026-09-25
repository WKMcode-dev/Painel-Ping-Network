import { Clock3, Expand, RadioTower, Settings, Network } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConnectionState } from '../../types/monitor'
import styles from './DashboardHeader.module.css'

interface DashboardHeaderProps { connection: ConnectionState; onSettings: () => void; onDevices: () => void; onTv: () => void }

const connectionLabels: Record<ConnectionState, string> = {
  connecting: 'Conectando',
  live: 'Monitoramento ao vivo',
  demo: 'Dados demonstrativos',
  reconnecting: 'Reconectando',
}

export function DashboardHeader({ connection, onSettings, onDevices, onTv }: DashboardHeaderProps) {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

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
        <button onClick={onDevices} type="button" title="Gerenciar dispositivos" aria-label="Gerenciar dispositivos"><Network size={18} /><span>Dispositivos</span></button>
        <button onClick={onSettings} type="button" title="Configurações" aria-label="Abrir configurações"><Settings size={18} /></button>
        <button onClick={onTv} type="button" title="Modo TV: apenas mapa em tela cheia"><Expand size={17} /><span className="sr-only">Modo TV em tela cheia</span></button>
      </div>
    </header>
  )
}
