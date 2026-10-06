import type { HostDefinition, HostSnapshot } from '../../types/monitor.js'

type Account = {
  at: number
  status: 'online' | 'offline' | 'unknown'
  category: 'normal' | 'paused' | 'maintenance'
}

/** Conta somente tempo observado. Pausa, manutenção e lacunas nunca entram no SLA.
 * A projeção não altera o host; advance materializa a projeção antes de mudar o estado. */
export class ObservationAccounting {
  private readonly accounts = new Map<string, Account>()
  constructor(
    private readonly staleAfterMs: () => number,
    private readonly suspension: (host: HostDefinition) => string | undefined,
  ) {}
  delete(id: string) {
    this.accounts.delete(id)
  }
  markUnknown(id: string, at: number) {
    this.accounts.set(id, { at, status: 'unknown', category: 'normal' })
  }
  totals(host: HostSnapshot, now: number) {
    const totals = {
      onlineObservedMs: host.onlineObservedMs ?? 0,
      offlineObservedMs: host.offlineObservedMs ?? 0,
      unknownMs: host.unknownMs ?? 0,
      pausedMs: host.pausedMs ?? 0,
      maintenanceMs: host.maintenanceMs ?? 0,
    }
    const account = this.accounts.get(host.id)
    if (!account || now <= account.at)
      return { ...totals, observedMs: totals.onlineObservedMs + totals.offlineObservedMs }
    const start = host.maintenanceStart ? Date.parse(host.maintenanceStart) : NaN
    const end = host.maintenanceEnd ? Date.parse(host.maintenanceEnd) : NaN
    const boundaries = [
      account.at,
      ...[start, end].filter((t) => t > account.at && t < now),
      now,
    ].sort((a, b) => a - b)
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]!,
        to = boundaries[i]!,
        midpoint = (from + to) / 2
      const key =
        account.category === 'paused'
          ? 'pausedMs'
          : midpoint >= start && midpoint < end
            ? 'maintenanceMs'
            : account.category === 'maintenance' ||
                now - account.at > this.staleAfterMs() ||
                account.status === 'unknown'
              ? 'unknownMs'
              : account.status === 'online'
                ? 'onlineObservedMs'
                : 'offlineObservedMs'
      totals[key] += to - from
    }
    return { ...totals, observedMs: totals.onlineObservedMs + totals.offlineObservedMs }
  }
  advance(host: HostSnapshot, now: number) {
    Object.assign(host, this.totals(host, now))
    const suspended = this.suspension(host)
    this.accounts.set(host.id, {
      at: now,
      status: host.status,
      category: suspended ? (host.enabled === false ? 'paused' : 'maintenance') : 'normal',
    })
  }
}
