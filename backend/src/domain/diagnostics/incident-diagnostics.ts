import { randomUUID } from 'node:crypto'
import type { HostSnapshot } from '../../types/monitor.js'
import type { IncidentReport, IncidentEvidence } from '../../types/snmp.js'
interface Store {
  upsert(report: IncidentReport): void
  getAll(): IncidentReport[]
}
interface Failure {
  key: string
  hostId: string
  protocol: IncidentReport['protocol']
  subject: string
  at: string
  observedFailure: string
  cause: string
  certainty: IncidentReport['certainty']
  evidence: IncidentEvidence[]
}
const fresh = (at: string, now: number, limit: number) =>
  Number.isFinite(Date.parse(at)) && Date.parse(at) <= now + 1000 && now - Date.parse(at) <= limit
/** Diagnóstico determinístico: estado de porta não é traduzido em cabo rompido ou falha de energia. */
export function observedFailures(
  hosts: HostSnapshot[],
  now: number,
  staleAfterMs: number,
): Failure[] {
  const failures: Failure[] = []
  for (const host of hosts) {
    if (host.suspended) continue
    if (
      host.status === 'offline' &&
      host.lastCheckedAt &&
      fresh(host.lastCheckedAt, now, staleAfterMs) &&
      host.dataQuality !== 'collector-error'
    ) {
      const evidence: IncidentEvidence[] = [
        {
          source: 'icmp',
          message: 'Dispositivo não respondeu às verificações ICMP confirmadas',
          checkedAt: host.lastCheckedAt,
        },
      ]
      let observedFailure = 'Sem resposta ICMP',
        cause = 'Causa não identificada',
        certainty: IncidentReport['certainty'] = 'unidentified'
      const parent = host.attachment && hosts.find((item) => item.id === host.attachment!.hostId)
      const telemetry = parent && !parent.suspended && parent.snmpResult
      const port =
        telemetry &&
        telemetry.status === 'available' &&
        fresh(telemetry.checkedAt, now, staleAfterMs) &&
        telemetry.interfaces.find((item) => item.index === host.attachment!.interfaceIndex)
      if (port && telemetry) {
        const name = `Interface ${port.index} de ${parent!.name}`
        if (port.adminStatus === 2) {
          observedFailure = 'Sem resposta ICMP; porta de acesso desativada'
          cause = 'Interface de acesso desativada administrativamente'
          certainty = 'verified'
          evidence.push({
            source: 'snmp',
            message: `${name}: ifAdminStatus=down`,
            checkedAt: telemetry.checkedAt,
          })
        } else if (port.operStatus === 2 || port.operStatus === 7) {
          observedFailure = 'Sem resposta ICMP; porta de acesso sem link operacional'
          evidence.push({
            source: 'snmp',
            message: `${name}: ifOperStatus=${port.operStatus === 7 ? 'lowerLayerDown' : 'down'}`,
            checkedAt: telemetry.checkedAt,
          })
        }
      }
      failures.push({
        key: `${host.id}:icmp`,
        hostId: host.id,
        protocol: 'icmp',
        subject: 'Conectividade',
        at: host.downConfirmedAt ?? host.lastCheckedAt,
        observedFailure,
        cause,
        certainty,
        evidence,
      })
    }
    for (const check of host.serviceChecks ?? [])
      if (check.status === 'unavailable' && fresh(check.checkedAt, now, staleAfterMs)) {
        failures.push({
          key: `${host.id}:${check.type}:${check.id}`,
          hostId: host.id,
          protocol: check.type,
          subject: `Serviço ${check.id}`,
          at: check.checkedAt,
          observedFailure:
            check.type === 'http' && check.statusCode
              ? `HTTP retornou status ${check.statusCode}`
              : `Verificação ${check.type.toUpperCase()} falhou`,
          cause: 'Causa não identificada',
          certainty: 'unidentified',
          evidence: [
            {
              source: check.type,
              message: check.statusCode
                ? `Status HTTP observado: ${check.statusCode}`
                : 'O serviço não respondeu à verificação',
              checkedAt: check.checkedAt,
            },
          ],
        })
      }
    const telemetry = host.snmpResult
    if (telemetry?.status === 'available' && fresh(telemetry.checkedAt, now, staleAfterMs))
      for (const port of telemetry.interfaces) {
        if (port.adminStatus !== 2 && port.operStatus !== 2 && port.operStatus !== 7) continue
        failures.push({
          key: `${host.id}:snmp:${port.index}`,
          hostId: host.id,
          protocol: 'snmp',
          subject: `Interface ${port.index}`,
          at: telemetry.checkedAt,
          observedFailure:
            port.adminStatus === 2
              ? 'Interface desativada administrativamente'
              : 'Interface sem link operacional',
          cause:
            port.adminStatus === 2
              ? 'Interface desativada administrativamente'
              : 'Causa não identificada',
          certainty: port.adminStatus === 2 ? 'verified' : 'unidentified',
          evidence: [
            {
              source: 'snmp',
              message: `ifAdminStatus=${port.adminStatus ?? 'unknown'}; ifOperStatus=${port.operStatus ?? 'unknown'}`,
              checkedAt: telemetry.checkedAt,
            },
          ],
        })
      }
  }
  return failures
}
/** Confirma serviços/portas em amostras consecutivas; lacunas interrompem, não resolvem. */
export class IncidentDiagnostics {
  private active = new Map<string, IncidentReport>()
  private pending = new Map<string, { at: string; count: number; first: string }>()
  constructor(private readonly store: Store) {}
  update(hosts: HostSnapshot[], now: number, staleAfterMs: number, threshold = 2) {
    const failures = observedFailures(hosts, now, staleAfterMs)
    const keys = new Set(failures.map((item) => item.key))
    for (const key of this.pending.keys()) if (!keys.has(key)) this.pending.delete(key)
    for (const [key, report] of this.active)
      if (!keys.has(key)) {
        const host = hosts.find((item) => item.id === report.hostId)
        const validHost = host && !host.suspended
        let recovered = false
        if (validHost && host) {
          if (report.protocol === 'icmp')
            recovered =
              host.status === 'online' &&
              Boolean(host.lastCheckedAt && fresh(host.lastCheckedAt, now, staleAfterMs)) &&
              host.dataQuality !== 'collector-error'
          else if (report.protocol === 'snmp') {
            const index = Number(key.split(':').at(-1)),
              snmp = host.snmpResult
            const port = snmp?.interfaces.find((item) => item.index === index)
            recovered =
              snmp?.status === 'available' &&
              fresh(snmp.checkedAt, now, staleAfterMs) &&
              port?.adminStatus === 1 &&
              port.operStatus === 1
          } else {
            const check = host.serviceChecks?.find(
              (item) => `${host.id}:${item.type}:${item.id}` === key,
            )
            recovered = check?.status === 'available' && fresh(check.checkedAt, now, staleAfterMs)
          }
        }
        this.store.upsert({
          ...report,
          state: recovered ? 'resolved' : 'interrupted',
          endedAt: new Date(now).toISOString(),
        })
        this.active.delete(key)
      }
    for (const failure of failures) {
      let report = this.active.get(failure.key)
      if (!report) {
        const pending = this.pending.get(failure.key) ?? { at: '', count: 0, first: failure.at }
        if (pending.at !== failure.at) {
          pending.count++
          pending.at = failure.at
        }
        this.pending.set(failure.key, pending)
        if (failure.protocol !== 'icmp' && pending.count < threshold) continue
        const host = hosts.find((item) => item.id === failure.hostId)!
        report = {
          id: randomUUID(),
          hostId: failure.hostId,
          deviceName: host.name,
          protocol: failure.protocol,
          subject: failure.subject,
          state: 'active',
          firstObservedAt:
            failure.protocol === 'icmp' ? (host.firstFailureAt ?? failure.at) : pending.first,
          confirmedAt: failure.at,
          endedAt: null,
          observedFailure: failure.observedFailure,
          cause: failure.cause,
          certainty: failure.certainty,
          evidence: failure.evidence,
        }
      } else if (
        report.observedFailure === failure.observedFailure &&
        report.cause === failure.cause
      )
        continue
      else
        report = {
          ...report,
          observedFailure: failure.observedFailure,
          cause: failure.cause,
          certainty: failure.certainty,
          evidence: failure.evidence,
        }
      this.active.set(failure.key, report)
      this.store.upsert(report)
    }
  }
  getAll() {
    return this.store.getAll()
  }
}
