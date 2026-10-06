import type { HostSnapshot } from '../../types/monitor'
import { formatLatency, formatPercent } from '../../utils/formatters'
import { Sparkline } from '../Sparkline/Sparkline'
import styles from './HostDetails.module.css'
/** Métricas e gráfico usam a mesma janela de amostras enviada pelo backend. */
export function HostPerformance({ host }: { host: HostSnapshot }) {
  return (
    <section>
      <h3>
        Desempenho recente <span>últimas {host.history.length} verificações</span>
      </h3>
      <div className={styles.largeChart}>
        <Sparkline points={host.history} offline={host.status === 'offline'} />
      </div>
      <div className={styles.metrics}>
        <Metric label="Atual" value={formatLatency(host.latencyMs)} />
        <Metric label="Média" value={formatLatency(host.averageLatencyMs)} />
        <Metric label="Mínima" value={formatLatency(host.minLatencyMs)} />
        <Metric label="Máxima" value={formatLatency(host.maxLatencyMs)} />
        <Metric label="p95" value={formatLatency(host.p95LatencyMs ?? null)} />
        <Metric label="Variação (jitter)" value={formatLatency(host.jitterMs ?? null)} />
        <Metric
          label="Disponibilidade observada"
          value={host.observedMs ? formatPercent(host.availabilityPct) : '—'}
        />
        <Metric
          label="Perda"
          value={host.history.length ? formatPercent(host.packetLossPct) : '—'}
        />
        <Metric
          label="Respostas na janela"
          value={
            host.history.length ? formatPercent(host.responsePct ?? host.availabilityPct) : '—'
          }
        />
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}
