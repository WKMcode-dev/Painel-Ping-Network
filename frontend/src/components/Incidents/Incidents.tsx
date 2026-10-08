import { useEffect, useState } from 'react'
import type { IncidentReport } from '../../types/snmp'
import type { HostSnapshot } from '../../types/monitor'
import { privateLabel } from '../../utils/privacy'
import { formatDateTime, formatDuration } from '../../utils/formatters'
import styles from './Incidents.module.css'
interface Props {
  hosts: HostSnapshot[]
  group: string
  tv: boolean
  onExitTv: () => void
  generatedAt: string
  live: boolean
  onDetails: (id: string) => void
}
/** Apresenta fatos e evidências; não gera listas de hipóteses para o operador. */
export function Incidents({ hosts, group, tv, onExitTv, generatedAt, live, onDetails }: Props) {
  const [reports, setReports] = useState<IncidentReport[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState('active')
  const [page, setPage] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
    fetch(`${base}/api/monitor/incidents`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível consultar os incidentes')
        return response.json() as Promise<IncidentReport[]>
      })
      .then((data) => {
        setReports(data)
        setError('')
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message)
      })
    return () => abort.abort()
  }, [generatedAt])
  const hostMap = new Map(hosts.map((host) => [host.id, host]))
  const filtered = reports.filter(
    (report) =>
      (!group || hostMap.get(report.hostId)?.group === group) &&
      (state === 'all' || report.state === state) &&
      `${hostMap.get(report.hostId)?.name ?? report.deviceName ?? report.hostId} ${report.subject} ${report.observedFailure}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 30)),
    current = Math.min(page, pages - 1)
  return (
    <section
      id="monitor-incidents"
      className={styles.incidents}
      data-tv={tv}
      aria-label="Incidentes da rede"
    >
      {tv && (
        <div className={styles.exitBar}>
          <button type="button" onClick={onExitTv}>
            Sair do modo TV
          </button>
        </div>
      )}
      <div className={styles.controls}>
        <input
          aria-label="Buscar incidentes"
          placeholder="Buscar dispositivo ou ocorrência"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
        />
        <select
          aria-label="Situação dos incidentes"
          value={state}
          onChange={(e) => {
            setState(e.target.value)
            setPage(0)
          }}
        >
          <option value="active">Ativos</option>
          <option value="resolved">Resolvidos</option>
          <option value="interrupted">Interrompidos</option>
          <option value="all">Todos</option>
        </select>
        <span>{filtered.length} ocorrência(s)</span>
      </div>
      {!live && (
        <p role="status">
          Sem atualização do coletor. Os incidentes exibidos são os últimos registros disponíveis.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={styles.scroll}>
        <table>
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Ocorrência</th>
              <th>Causa</th>
              <th>Início / confirmação</th>
              <th>Fim / duração</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 30, (current + 1) * 30).map((report) => (
              <tr key={report.id}>
                <td>
                  <button
                    disabled={tv || !hostMap.has(report.hostId)}
                    onClick={() => onDetails(report.hostId)}
                  >
                    {privateLabel(
                      hostMap.get(report.hostId)?.name ??
                        report.deviceName ??
                        'Dispositivo removido',
                    )}
                  </button>
                  <small>{privateLabel(report.subject)}</small>
                </td>
                <td>
                  {privateLabel(report.observedFailure)}
                  <details>
                    <summary>Evidências</summary>
                    {report.evidence.map((e, i) => (
                      <p key={i}>
                        {e.source.toUpperCase()} · {formatDateTime(e.checkedAt)} ·{' '}
                        {privateLabel(e.message)}
                      </p>
                    ))}
                  </details>
                </td>
                <td>
                  {privateLabel(report.cause)}
                  {report.certainty === 'verified' && <small>Estado verificado</small>}
                </td>
                <td>
                  {formatDateTime(report.firstObservedAt)}
                  <small>Confirmado: {formatDateTime(report.confirmedAt)}</small>
                </td>
                <td>
                  {formatDateTime(report.endedAt)}
                  <small>
                    {report.state === 'interrupted'
                      ? 'Continuidade desconhecida'
                      : formatDuration(
                          Math.max(
                            0,
                            Date.parse(report.endedAt ?? generatedAt) -
                              Date.parse(report.confirmedAt),
                          ),
                        )}
                  </small>
                </td>
                <td>
                  {
                    { active: 'Ativo', resolved: 'Resolvido', interrupted: 'Interrompido' }[
                      report.state
                    ]
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p>Nenhum incidente nesta seleção.</p>}
      </div>
      <div className={styles.controls}>
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Anterior
        </button>
        <span>
          {current + 1} / {pages}
        </span>
        <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
          Próxima
        </button>
      </div>
    </section>
  )
}
