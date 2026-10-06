import { HostPerformance } from './HostPerformance'
import { HostIncidentHistory } from './HostIncidentHistory'
import { Activity, Clock, MapPin, Network, ShieldCheck, TimerReset, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { HostSnapshot, StatusEvent } from '../../types/monitor'
import { formatDateTime, formatDuration, formatLatency } from '../../utils/formatters'
import { StatusBadge } from '../StatusBadge/StatusBadge'
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
    void fetchHostEvents(hostId, controller.signal)
      .then((items) => setLoaded({ id: hostId, events: items }))
      .catch(() => {
        if (!controller.signal.aborted) setEventError(true)
      })
    return () => controller.abort()
  }, [hostId, events])
  if (!host) return null
  const hostEvents =
    loaded?.id === host.id ? loaded.events : events.filter((event) => event.hostId === host.id)

  return (
    <dialog
      ref={dialog}
      className={styles.backdrop}
      onClose={onClose}
      aria-labelledby="host-details-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.icon}>
            <Network size={22} />
          </div>
          <div>
            <small>{host.group}</small>
            <h2 id="host-details-title">{host.name}</h2>
            <span>{host.address}</span>
          </div>
          {host.suspended ? <span>{host.suspended}</span> : <StatusBadge status={host.status} />}
          <button onClick={onClose} type="button" title="Fechar detalhes">
            <X size={19} />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <div className={styles.content}>
          {host.status === 'offline' ? (
            <div className={styles.incident}>
              <span>
                <Activity size={18} />
              </span>
              <div>
                <small>Incidente ativo</small>
                <strong>Sem resposta há {formatDuration(host.currentDowntimeMs)}</strong>
                <p>
                  {host.lastError ??
                    `Primeira confirmação em ${formatDateTime(host.lastOfflineAt)}`}
                </p>
              </div>
            </div>
          ) : null}

          <HostPerformance host={host} />
          <p>
            Janela ICMP: {host.sampleCount ?? host.history.length} amostras válidas, de{' '}
            {formatDateTime(host.sampleWindowStart ?? null)} até{' '}
            {formatDateTime(host.sampleWindowEnd ?? null)}. Indicadores de tempo desde o início
            desta sessão de coleta.
          </p>
          {host.serviceChecks?.length ? (
            <section>
              <h3>Serviços — independentes do ICMP</h3>
              {host.serviceChecks.map((check) => (
                <p key={check.id}>
                  <strong>
                    {check.type.toUpperCase()}{' '}
                    {host.checks?.find((item) => item.id === check.id)?.port ??
                      host.checks?.find((item) => item.id === check.id)?.url}
                  </strong>{' '}
                  ·{' '}
                  {
                    {
                      available: 'Disponível',
                      unavailable: 'Indisponível',
                      unknown: 'Sem verificação',
                    }[check.status]
                  }{' '}
                  · {formatLatency(check.latencyMs)} · {formatDateTime(check.checkedAt)}
                  {check.error && ` · ${check.error}`}
                </p>
              ))}
            </section>
          ) : null}
          {host.lastError && host.status !== 'offline' && <p role="status">{host.lastError}</p>}
          <section>
            <h3>Informações do dispositivo</h3>
            <dl className={styles.info}>
              <Info
                icon={Network}
                label="IP efetivamente verificado"
                value={host.resolvedAddress ?? '—'}
              />
              <Info
                icon={Clock}
                label="Idade da verificação"
                value={host.checkAgeMs == null ? '—' : formatDuration(host.checkAgeMs)}
              />
              <Info
                icon={Clock}
                label="Tempo observado"
                value={formatDuration(host.observedMs ?? 0)}
              />
              <Info
                icon={Clock}
                label="Tempo desconhecido"
                value={formatDuration(host.unknownMs ?? 0)}
              />
              <Info
                icon={Clock}
                label="Pausa / manutenção"
                value={`${formatDuration(host.pausedMs ?? 0)} / ${formatDuration(host.maintenanceMs ?? 0)}`}
              />
              <Info icon={MapPin} label="Local" value={host.location} />
              <Info icon={ShieldCheck} label="TTL recebido" value={host.ttl?.toString() ?? '—'} />
              <Info
                icon={Clock}
                label="Última verificação"
                value={formatDateTime(host.lastCheckedAt)}
              />
              <Info
                icon={TimerReset}
                label="Última transição"
                value={formatDateTime(host.lastTransitionAt)}
              />
            </dl>
          </section>

          {host.snmp && (
            <section>
              <h3>SNMP</h3>
              <p>
                {host.snmpResult?.status === 'available'
                  ? 'Disponível'
                  : (host.snmpResult?.error ?? 'Aguardando coleta')}
              </p>
              {host.snmpResult?.interfaces.map((item) => (
                <p key={item.index}>
                  Interface {item.index}: administrativo {item.adminStatus ?? '—'} / operacional{' '}
                  {item.operStatus ?? '—'}
                </p>
              ))}
            </section>
          )}
          <HostIncidentHistory host={host} hostEvents={hostEvents} eventError={eventError} />
        </div>
      </aside>
    </dialog>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div>
      <dt>
        <Icon size={15} />
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  )
}
