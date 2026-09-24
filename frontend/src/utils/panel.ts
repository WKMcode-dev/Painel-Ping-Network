import type { HostSnapshot, StatusEvent } from '../types/monitor'

export function currentHost(host: HostSnapshot, live: boolean, now: number, intervalMs = 5000): HostSnapshot {
  if (host.suspended) return host
  if (!live || !host.lastCheckedAt || now - Date.parse(host.lastCheckedAt) > Math.max(30000, intervalMs * 3)) {
    return { ...host, status: 'unknown', suspended: 'Sem atualização', latencyMs: null }
  }
  return { ...host, currentDowntimeMs: host.status === 'offline' && host.lastOfflineAt ? Math.max(0, now - Date.parse(host.lastOfflineAt)) : 0 }
}

/** Never infer a recovery when observation was paused or the address was changed. */
export function incidentRows(events: StatusEvent[]) {
  const ordered = [...events].reverse().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  const rows: { id: string; start: string; end: string | null; duration: number | null; interrupted: boolean }[] = []
  const open = new Map<string, (typeof rows)[number]>()
  for (const event of ordered) {
    if (event.type === 'down') {
      const row = { id: event.id, start: event.timestamp, end: null, duration: null, interrupted: false }
      rows.push(row); open.set(event.hostId, row)
    } else {
      const row = open.get(event.hostId)
      if (row) { row.end = event.timestamp; row.duration = event.durationMs; row.interrupted = event.type === 'interrupted'; open.delete(event.hostId) }
    }
  }
  return rows.reverse()
}
