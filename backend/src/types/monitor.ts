export type HostStatus = 'online' | 'offline' | 'unknown'

export interface HostDefinition {
  id: string
  name: string
  address: string
  location: string
  group: string
  description?: string
}

export interface PingResult {
  alive: boolean
  latencyMs: number | null
  ttl: number | null
  checkedAt: string
  probeError?: boolean
  error?: string
}

export interface HistoryPoint {
  timestamp: string
  online: boolean
  latencyMs: number | null
}

export interface StatusEvent {
  id: string
  hostId: string
  type: 'down' | 'recovery'
  timestamp: string
  durationMs: number | null
  message: string
}

export interface HostSnapshot extends HostDefinition {
  status: HostStatus
  latencyMs: number | null
  averageLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
  packetLossPct: number
  availabilityPct: number
  ttl: number | null
  lastCheckedAt: string | null
  lastError: string | null
  lastOnlineAt: string | null
  lastOfflineAt: string | null
  lastTransitionAt: string | null
  currentDowntimeMs: number
  consecutiveFailures: number
  history: HistoryPoint[]
}

export interface DashboardSnapshot {
  intervalMs?: number
  generatedAt: string
  summary: {
    total: number
    online: number
    offline: number
    unknown: number
    availabilityPct: number
    averageLatencyMs: number | null
    activeIncidents: number
  }
  hosts: HostSnapshot[]
  recentEvents: StatusEvent[]
}
