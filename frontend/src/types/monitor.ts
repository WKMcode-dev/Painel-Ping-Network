import type { SnmpConfig, NetworkAttachment, SnmpResult, IncidentReport } from './snmp'
export interface ServiceCheck {
  id: string
  type: 'tcp' | 'http'
  port?: number
  url?: string
  expectedStatus?: number
}
export interface ServiceResult {
  id: string
  type: 'tcp' | 'http'
  status: 'available' | 'unavailable' | 'unknown'
  checkedAt: string
  latencyMs: number | null
  error?: string
  statusCode?: number
  resolvedAddress?: string
}

export type HostStatus = 'online' | 'offline' | 'unknown'

export interface HistoryPoint {
  timestamp: string
  online: boolean
  latencyMs: number | null
}

export interface StatusEvent {
  id: string
  hostId: string
  type: 'down' | 'recovery' | 'interrupted' | 'gap' | 'dns_change' | 'paused' | 'maintenance'
  timestamp: string
  durationMs: number | null
  message: string
  firstFailureAt?: string
  confirmedAt?: string
  previousCheckAt?: string | null
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
  checks?: ServiceCheck[]
  snmp?: SnmpConfig
  attachment?: NetworkAttachment
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
  resolvedAddress?: string | null
  dataQuality?: 'fresh' | 'stale' | 'collector-error' | 'paused' | 'maintenance' | 'checking'
  checkAgeMs?: number | null
  p95LatencyMs?: number | null
  jitterMs?: number | null
  sampleCount?: number
  sampleWindowStart?: string | null
  sampleWindowEnd?: string | null
  observedMs?: number
  onlineObservedMs?: number
  offlineObservedMs?: number
  unknownMs?: number
  pausedMs?: number
  maintenanceMs?: number
  responsePct?: number
  firstFailureAt?: string | null
  downConfirmedAt?: string | null
  serviceChecks?: ServiceResult[]
  snmpResult?: SnmpResult
  history: HistoryPoint[]
}

export interface DashboardSnapshot {
  staleAfterMs?: number
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
  incidentReports?: IncidentReport[]
  recentEvents: StatusEvent[]
}

export type ConnectionState = 'connecting' | 'live' | 'demo' | 'reconnecting'
