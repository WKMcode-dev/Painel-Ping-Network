import { randomUUID } from 'node:crypto'
import type { HostSnapshot, PingResult, StatusEvent } from '../../types/monitor.js'

/** Contrato mínimo de eventos; o domínio não conhece o formato de armazenamento. */
interface IncidentEventSink {
  add: (event: StatusEvent) => void
}

/** Mantém sequências de falha e incidentes confirmados durante uma sessão de coleta.
 * Interrupções do coletor fecham continuidade com duração desconhecida. */
export class IncidentTracker {
  private readonly openIncidents = new Map<string, string>()
  private readonly firstFailures = new Map<string, string>()
  private readonly failureBounds = new Map<string, string | null>()
  constructor(
    private readonly historyRepository: IncidentEventSink,
    private readonly now: () => number,
  ) {}
  resetFailures(id: string) {
    this.firstFailures.delete(id)
    this.failureBounds.delete(id)
  }
  recordReply(host: HostSnapshot, result: PingResult, previousCheck: string | null) {
    if (!result.alive && !host.consecutiveFailures) {
      this.firstFailures.set(host.id, result.checkedAt)
      this.failureBounds.set(host.id, host.history.at(-1)?.online ? previousCheck : null)
    }
    if (result.alive) this.resetFailures(host.id)
  }
  interrupt(host: HostSnapshot, message: string, unknownDuration = false) {
    const since = this.openIncidents.get(host.id)
    if (since)
      this.historyRepository.add({
        id: randomUUID(),
        hostId: host.id,
        type: 'interrupted',
        timestamp: new Date(this.now()).toISOString(),
        durationMs: unknownDuration ? null : Math.max(0, this.now() - Date.parse(since)),
        message,
      })
    this.openIncidents.delete(host.id)
  }
  recordTransition(host: HostSnapshot, result: PingResult, previousStatus: HostSnapshot['status']) {
    const openSince = this.openIncidents.get(host.id)
    if (host.status === 'offline' && !openSince) {
      this.openIncidents.set(host.id, result.checkedAt)
      host.lastOfflineAt = result.checkedAt
      host.firstFailureAt = this.firstFailures.get(host.id) ?? result.checkedAt
      host.downConfirmedAt = result.checkedAt
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({
        id: randomUUID(),
        hostId: host.id,
        type: 'down',
        timestamp: result.checkedAt,
        firstFailureAt: host.firstFailureAt ?? result.checkedAt,
        confirmedAt: result.checkedAt,
        previousCheckAt: this.failureBounds.get(host.id) ?? null,
        durationMs: null,
        message: `${host.name} parou de responder`,
      })
    } else if (host.status === 'online' && openSince) {
      this.openIncidents.delete(host.id)
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({
        id: randomUUID(),
        hostId: host.id,
        type: 'recovery',
        timestamp: result.checkedAt,
        durationMs: Math.max(0, Date.parse(result.checkedAt) - Date.parse(openSince)),
        message: `${host.name} voltou a responder`,
      })
    } else if (host.status === 'online' && previousStatus === 'unknown') {
      host.lastTransitionAt = result.checkedAt
    }
  }
}
