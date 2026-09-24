import { Activity, Clock, MapPin, Network, ShieldCheck, TimerReset, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { HostSnapshot, StatusEvent } from '../../types/monitor'
import { formatDateTime, formatDuration, formatLatency, formatPercent } from '../../utils/formatters'
import { Sparkline } from '../Sparkline/Sparkline'
import { StatusBadge } from '../StatusBadge/StatusBadge'
import { incidentRows } from '../../utils/panel'
import { fetchHostEvents } from '../../services/monitor-api'
import styles from './HostDetails.module.css'

interface HostDetailsProps {
  host: HostSnapshot | null
  events: StatusEvent[]
  onClose: () => void
}

export function HostDetails({ host, events, onClose }: HostDetailsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = Boolean(host)
  useEffect(() => {
    if (visible) dialog.current?.showModal()
  }, [visible])

  const [loaded, setLoaded] = useState<{ id: string; events: StatusEvent[] } | null>(null)
  const [eventError, setEventError] = useState(false)
  const hostId = host?.id
  useEffect(() => {
    if (!hostId) return
    const controller = new AbortController()
    setEventError(false)
    void fetchHostEvents(hostId, controller.signal).then((items) => setLoaded({ id: hostId, events: items }))
      .catch(() => { if (!controller.signal.aborted) setEventError(true) })
    return () => controller.abort()
  }, [hostId, events])
  if (!host) return null
  const hostEvents = loaded?.id === host.id ? loaded.events : events.filter((event) => event.hostId === host.id)

  return (
    <dialog ref={dialog} className={styles.backdrop} onClose={onClose} aria-labelledby="host-details-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.icon}><Network size={22} /></div>
          <div><small>{host.group}</small><h2 id="host-details-title">{host.name}</h2><span>{host.address}</span></div>
          {host.suspended ? <span>{host.suspended}</span> : <StatusBadge status={host.status} />}
          <button onClick={onClose} type="button" title="Fechar detalhes"><X size={19} /><span className="sr-only">Fechar</span></button>
        </div>

        <div className={styles.content}>
          {host.status === 'offline' ? <div className={styles.incident}><span><Activity size={18} /></span><div><small>Incidente ativo</small><strong>Sem resposta há {formatDuration(host.currentDowntimeMs)}</strong><p>{host.lastError ?? `Primeira confirmação em ${formatDateTime(host.lastOfflineAt)}`}</p></div></div> : null}

          <section>
            <h3>Desempenho recente <span>últimas {host.history.length} verificações</span></h3>
            <div className={styles.largeChart}><Sparkline points={host.history} offline={host.status === 'offline'} /></div>
            <div className={styles.metrics}>
              <Metric label="Atual" value={formatLatency(host.latencyMs)} />
              <Metric label="Média" value={formatLatency(host.averageLatencyMs)} />
              <Metric label="Mínima" value={formatLatency(host.minLatencyMs)} />
              <Metric label="Máxima" value={formatLatency(host.maxLatencyMs)} />
              <Metric label="Perda" value={formatPercent(host.packetLossPct)} />
              <Metric label="Respostas na janela" value={formatPercent(host.availabilityPct)} />
            </div>
          </section>

          {host.lastError && host.status !== 'offline' && <p role="status">{host.lastError}</p>}
          <section>
            <h3>Informações do dispositivo</h3>
            <dl className={styles.info}>
              <Info icon={MapPin} label="Local" value={host.location} />
              <Info icon={ShieldCheck} label="TTL recebido" value={host.ttl?.toString() ?? '—'} />
              <Info icon={Clock} label="Última verificação" value={formatDateTime(host.lastCheckedAt)} />
              <Info icon={TimerReset} label="Última transição" value={formatDateTime(host.lastTransitionAt)} />
            </dl>
          </section>

          <section>
            <h3>Quedas e retornos</h3>
            <p>Histórico retido no servidor. Durações são observadas; períodos sem coleta não comprovam indisponibilidade contínua.</p>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left' }}>
              <thead><tr><th>Queda confirmada</th><th>Retorno / encerramento</th><th>Duração observada</th></tr></thead>
              <tbody>{incidentRows(hostEvents).map(row => <tr key={row.id}>
                <td>{formatDateTime(row.start)}</td><td>{row.end ? formatDateTime(row.end) : 'Sem encerramento registrado'}{row.interrupted ? ' (administrativo)' : ''}</td>
                <td>{row.duration != null ? formatDuration(row.duration) : host.status === 'offline' ? `${formatDuration(host.currentDowntimeMs)} (em andamento)` : '—'}</td>
              </tr>)}</tbody>
            </table></div>
            <h3>Histórico de eventos</h3>
            {eventError && <p role="status">Não foi possível carregar o histórico completo.</p>}
            <div className={styles.timeline}>
              {hostEvents.length ? hostEvents.map((event) => (
                <div key={event.id} className={styles.event} data-type={event.type}>
                  <span className={styles.eventDot} />
                  <div><strong>{event.type === 'down' ? 'Queda detectada' : event.type === 'recovery' ? 'Conexão restabelecida' : 'Incidente encerrado administrativamente'}</strong><small>{formatDateTime(event.timestamp)}{event.durationMs != null ? ` • indisponível por ${formatDuration(event.durationMs)}` : ''}</small></div>
                </div>
              )) : <p className={styles.noEvents}>Nenhuma mudança de estado no histórico retido.</p>}
            </div>
          </section>
        </div>
      </aside>
    </dialog>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div><dt><Icon size={15} />{label}</dt><dd>{value}</dd></div>
}
