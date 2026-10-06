import type { HostSnapshot, StatusEvent } from '../../types/monitor'
import { formatDateTime, formatDuration } from '../../utils/formatters'
import { incidentRows } from '../../utils/panel'
import styles from './HostDetails.module.css'
interface Props {
  host: HostSnapshot
  hostEvents: StatusEvent[]
  eventError: boolean
}
/** Tabela e linha do tempo recebem eventos já carregados; não fazem consultas próprias. */
export function HostIncidentHistory({ host, hostEvents, eventError }: Props) {
  const incidents = incidentRows(hostEvents)
  return (
    <section>
      <h3>Quedas e retornos</h3>
      <p>
        Histórico retido no servidor. Durações são observadas; períodos sem coleta não comprovam
        indisponibilidade contínua.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.incidentTable}>
          <caption className="sr-only">
            Registro de quedas e retornos do dispositivo {host.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Situação</th>
              <th scope="col">Primeira falha</th>
              <th scope="col">Queda confirmada</th>
              <th scope="col">Retorno / encerramento</th>
              <th scope="col">Duração observada</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((row) => (
              <tr key={row.id}>
                <td>
                  <span
                    className={styles.incidentTag}
                    data-state={
                      row.interrupted ? 'administrative' : row.end ? 'recovered' : 'active'
                    }
                  >
                    {row.interrupted ? 'Encerrado' : row.end ? 'Restabelecido' : 'Em andamento'}
                  </span>
                </td>
                <td>{formatDateTime(row.firstFailureAt ?? row.start)}</td>
                <td>
                  <time dateTime={row.start}>{formatDateTime(row.start)}</time>
                </td>
                <td>
                  {row.end ? (
                    <time dateTime={row.end}>{formatDateTime(row.end)}</time>
                  ) : (
                    'Aguardando retorno'
                  )}
                </td>
                <td>
                  {row.duration != null
                    ? formatDuration(row.duration)
                    : !row.end && !row.interrupted && host.status === 'offline'
                      ? formatDuration(host.currentDowntimeMs)
                      : '—'}
                </td>
              </tr>
            ))}
            {!incidents.length && (
              <tr>
                <td colSpan={5} className={styles.emptyRow}>
                  Nenhuma queda registrada no período retido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3>Histórico de eventos</h3>
      {eventError && <p role="status">Não foi possível carregar o histórico completo.</p>}
      <div className={styles.timeline}>
        {hostEvents.length ? (
          hostEvents.map((event) => (
            <div key={event.id} className={styles.event} data-type={event.type}>
              <span className={styles.eventDot} />
              <div>
                <strong>
                  {
                    {
                      down: 'Queda confirmada',
                      recovery: 'Conexão restabelecida',
                      interrupted: 'Observação do incidente encerrada',
                      gap: 'Período sem coleta',
                      dns_change: 'Alteração de DNS',
                      paused: 'Monitoramento pausado',
                      maintenance: 'Manutenção programada',
                    }[event.type]
                  }
                </strong>
                <p>{event.message}</p>
                <small>
                  {formatDateTime(event.timestamp)}
                  {event.durationMs != null
                    ? ` • indisponível por ${formatDuration(event.durationMs)}`
                    : ''}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className={styles.noEvents}>Nenhuma mudança de estado no histórico retido.</p>
        )}
      </div>
    </section>
  )
}
