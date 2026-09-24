export type HostStatus = 'online' | 'offline' | 'unknown'

export interface HistoryPoint {
  timestamp: string
  online: boolean
  latencyMs: number | null
}

export interface StatusEvent {
  id: string
  hostId: string
  type: 'down' | 'recovery' | 'interrupted'
  timestamp: string
  durationMs: number | null
  message: string
}

export interface HostSnapshot {
  id: string
  name: string
  address: string
  location: string
  group: string
  enabled?: boolean
  maintenanceStart?: string | null
  maintenanceEnd?: string | null
  suspended?: string
  description?: string
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

export type ConnectionState = 'connecting' | 'live' | 'demo' | 'reconnecting'
