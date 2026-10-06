import { randomUUID } from 'node:crypto'
import type {
  HostDefinition,
  HostSnapshot,
  HistoryPoint,
  PingResult,
  StatusEvent,
} from '../../types/monitor.js'
import type { ObservationAccounting } from './observation-accounting.js'
import type { IncidentTracker } from './incident-tracker.js'
import { updateSampleMetrics } from './sample-metrics.js'
interface Context {
  now: () => number
  suspension: (host: HostDefinition) => string | undefined
  accounting: ObservationAccounting
  incidents: IncidentTracker
  recordEvent: (event: StatusEvent) => void
  clearGap: (id: string) => void
  policy: () => { recoveryThreshold: number; failureThreshold: number; historyLimit: number }
}
/** Aplica respostas válidas e confirma transições. Não agenda probes nem escreve arquivos.
 * Ordem temporal e confirmação permanecem separadas de erro de execução do coletor. */
export class HostResultProcessor {
  private readonly successes = new Map<string, number>()
  constructor(private readonly context: Context) {}
  resetSuccesses(id: string) {
    this.successes.delete(id)
  }
  apply(host: HostSnapshot, result: PingResult): boolean {
    if (this.context.suspension(host)) {
      this.context.incidents.interrupt(host, this.context.suspension(host)!)
      host.status = 'unknown'
      host.consecutiveFailures = 0
      this.successes.delete(host.id)
      return false
    }
    const parsedTime = Date.parse(result.checkedAt)
    if (
      !Number.isFinite(parsedTime) ||
      parsedTime > this.context.now() + 1000 ||
      (host.lastCheckedAt && parsedTime < Date.parse(host.lastCheckedAt))
    )
      return false
    this.context.accounting.advance(host, this.context.now())
    if (
      result.resolvedAddress &&
      host.resolvedAddress &&
      result.resolvedAddress !== host.resolvedAddress
    ) {
      this.context.incidents.interrupt(host, 'IP resolvido alterado', true)
      this.context.recordEvent({
        id: randomUUID(),
        hostId: host.id,
        type: 'dns_change',
        timestamp: result.checkedAt,
        durationMs: null,
        message: `DNS: ${host.resolvedAddress} → ${result.resolvedAddress}`,
      })
      host.history = []
      host.status = 'unknown'
      host.consecutiveFailures = 0
      this.successes.delete(host.id)
      this.context.incidents.resetFailures(host.id)
    }
    if (result.resolvedAddress) host.resolvedAddress = result.resolvedAddress
    const previousCheck = host.lastCheckedAt
    const previousStatus = host.status
    host.lastCheckedAt = result.checkedAt
    host.lastError = result.error ?? null
    host.ttl = result.ttl
    host.latencyMs = result.latencyMs
    if (result.probeError) {
      this.context.incidents.interrupt(
        host,
        'Verificação indisponível; continuidade desconhecida',
        true,
      )
      host.dataQuality = 'collector-error'
      host.latencyMs = null
      host.ttl = null
      this.context.incidents.resetFailures(host.id)
      host.status = 'unknown'
      host.consecutiveFailures = 0
      this.successes.delete(host.id)
      this.context.accounting.advance(host, this.context.now())
      return true // A collector failure is not a lost network packet.
    }
    host.dataQuality = 'fresh'
    this.context.clearGap(host.id)
    this.context.incidents.recordReply(host, result, previousCheck)
    host.consecutiveFailures = result.alive ? 0 : host.consecutiveFailures + 1

    const successes = result.alive ? (this.successes.get(host.id) ?? 0) + 1 : 0
    this.successes.set(host.id, successes)
    if (result.alive && successes >= this.context.policy().recoveryThreshold) {
      host.status = 'online'
      host.lastOnlineAt = result.checkedAt
    } else if (host.consecutiveFailures >= this.context.policy().failureThreshold) {
      host.status = 'offline'
    }

    const point: HistoryPoint = {
      timestamp: result.checkedAt,
      online: result.alive,
      latencyMs: result.latencyMs,
    }
    host.history = [...host.history, point].slice(-this.context.policy().historyLimit)
    updateSampleMetrics(host)

    this.context.incidents.recordTransition(host, result, previousStatus)
    this.context.accounting.advance(host, this.context.now())
    return true
  }
}
