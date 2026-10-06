export interface SnmpConfig {
  profile: string
  port: number
  interfaces: number[]
}
export interface NetworkAttachment {
  hostId: string
  interfaceIndex: number
}
export interface SnmpInterface {
  index: number
  name: string
  adminStatus: number | null
  operStatus: number | null
}
export interface SnmpResult {
  status: 'available' | 'unknown'
  checkedAt: string
  uptimeTicks?: number
  interfaces: SnmpInterface[]
  error?: string
}
export interface IncidentEvidence {
  source: 'icmp' | 'tcp' | 'http' | 'snmp'
  message: string
  checkedAt: string
}
export interface IncidentReport {
  id: string
  hostId: string
  deviceName?: string
  protocol: 'icmp' | 'tcp' | 'http' | 'snmp'
  subject: string
  state: 'active' | 'resolved' | 'interrupted'
  firstObservedAt: string
  confirmedAt: string
  endedAt: string | null
  observedFailure: string
  cause: string
  certainty: 'verified' | 'unidentified'
  evidence: IncidentEvidence[]
}
