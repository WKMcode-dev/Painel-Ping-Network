import type { HostSnapshot } from '../../types/monitor.js'

/** Métricas da janela ICMP válida: erro do coletor não deve entrar nesta amostra. */
export function updateSampleMetrics(host: HostSnapshot): void {
  const successful = host.history.filter((point) => point.online)
  const latencies = successful.flatMap((point) => point.latencyMs ?? [])
  const total = host.history.length

  host.packetLossPct = total ? ((total - successful.length) / total) * 100 : 0
  host.responsePct = total ? (successful.length / total) * 100 : 0
  host.sampleCount = total
  host.sampleWindowStart = host.history[0]?.timestamp ?? null
  host.sampleWindowEnd = host.history.at(-1)?.timestamp ?? null
  const sorted = [...latencies].sort((a, b) => a - b)
  host.p95LatencyMs = sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!
    : null
  host.jitterMs =
    latencies.length > 1
      ? latencies.slice(1).reduce((sum, value, i) => sum + Math.abs(value - latencies[i]!), 0) /
        (latencies.length - 1)
      : null
  host.averageLatencyMs = latencies.length
    ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
    : null
  host.minLatencyMs = latencies.length ? Math.min(...latencies) : null
  host.maxLatencyMs = latencies.length ? Math.max(...latencies) : null
}
