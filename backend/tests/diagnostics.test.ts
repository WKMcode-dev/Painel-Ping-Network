import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IncidentDiagnostics, observedFailures } from '../src/domain/diagnostics/incident-diagnostics.js'
import { IncidentRepository } from '../src/repositories/incident.repository.js'
import { validatedStoredConfigSchema } from '../src/validation/config.schema.js'
import type { HostSnapshot } from '../src/types/monitor.js'
import type { IncidentReport } from '../src/types/snmp.js'

const at = (ms: number) => new Date(ms).toISOString()
const now = Date.now()
function host(id = 'camera'): HostSnapshot {
  return { id, name: id, address: '127.0.0.1', group: 'TI', location: '',
    status: 'offline', latencyMs: null, averageLatencyMs: null, minLatencyMs: null,
    maxLatencyMs: null, packetLossPct: 100, availabilityPct: 0, ttl: null,
    lastCheckedAt: at(now), lastError: null, lastOnlineAt: null, lastOfflineAt: at(now),
    lastTransitionAt: at(now), currentDowntimeMs: 0, consecutiveFailures: 2, history: [],
    dataQuality: 'fresh' }
}
function store() {
  const reports = new Map<string, IncidentReport>()
  return { upsert: (r: IncidentReport) => { reports.set(r.id, structuredClone(r)) },
    getAll: () => [...reports.values()] }
}
function parent(admin = 1, oper = 2) {
  return { ...host('switch'), status: 'online' as const,
    snmp: { profile: 'TEST', port: 161, interfaces: [7] },
    snmpResult: { status: 'available' as const, checkedAt: at(now),
      interfaces: [{ index: 7, name: 'port7', adminStatus: admin, operStatus: oper }] } }
}
test('diagnosis uses only the explicitly attached port and distinguishes state from physical cause', () => {
  const h = { ...host(), attachment: { hostId: 'switch', interfaceIndex: 7 } }
  let result = observedFailures([h, parent()], now, 30000).find(r => r.hostId === h.id)!
  assert.equal(result.cause, 'Causa não identificada')
  assert.match(result.observedFailure, /sem link/)
  assert.equal(result.certainty, 'unidentified')
  result = observedFailures([h, parent(2)], now, 30000).find(r => r.hostId === h.id)!
  assert.match(result.cause, /administrativamente/)
  assert.equal(result.certainty, 'verified')
  assert.equal(result.evidence.length, 2)
  h.attachment.interfaceIndex = 8
  result = observedFailures([h, parent(2)], now, 30000).find(r => r.hostId === h.id)!
  assert.equal(result.evidence.length, 1)
  assert.equal(result.certainty, 'unidentified')
})
test('stale or paused parent cannot supply a cause; failed collector is not failed device', () => {
  const h = { ...host(), attachment: { hostId: 'switch', interfaceIndex: 7 } }
  const p = parent(2)
  p.snmpResult.checkedAt = at(now - 31000)
  assert.equal(observedFailures([h, p], now, 30000)[0]!.certainty, 'unidentified')
  h.dataQuality = 'collector-error'
  assert.equal(observedFailures([h], now, 30000).length, 0)
  h.snmpResult = parent(2).snmpResult
  assert.equal(observedFailures([h], now, 30000)[0]!.protocol, 'snmp')
  h.suspended = 'Pausado'
  assert.equal(observedFailures([h], now, 30000).length, 0)
})
test('HTTP incidents keep the actual response without inventing a cause', () => {
  const h = { ...host(), status: 'online' as const, serviceChecks: [{
    id: 'api', type: 'http' as const, status: 'unavailable' as const,
    checkedAt: at(now), latencyMs: 5, statusCode: 503 }] }
  const failure = observedFailures([h], now, 30000)[0]!
  assert.equal(failure.observedFailure, 'HTTP retornou status 503')
  assert.equal(failure.cause, 'Causa não identificada')
})
test('repeated snapshots do not confirm one SNMP sample twice; actual success resolves', () => {
  const s = store(), diagnostics = new IncidentDiagnostics(s), p = parent()
  diagnostics.update([p], now, 30000, 2)
  diagnostics.update([p], now + 1000, 30000, 2)
  assert.equal(s.getAll().length, 0)
  p.snmpResult.checkedAt = at(now + 2000)
  diagnostics.update([p], now + 2000, 30000, 2)
  assert.equal(s.getAll()[0]!.state, 'active')
  p.snmpResult.interfaces[0]!.operStatus = 1
  p.snmpResult.checkedAt = at(now + 3000)
  diagnostics.update([p], now + 3000, 30000, 2)
  assert.equal(s.getAll()[0]!.state, 'resolved')
  assert.equal(s.getAll()[0]!.firstObservedAt, at(now))
})
test('a monitoring gap interrupts instead of asserting recovery', () => {
  const s = store(), diagnostics = new IncidentDiagnostics(s), h = host()
  diagnostics.update([h], now, 30000)
  diagnostics.update([h], now + 31000, 30000)
  assert.equal(s.getAll()[0]!.state, 'interrupted')
  h.status = 'online'; h.lastCheckedAt = at(now + 32000)
  diagnostics.update([h], now + 32000, 30000)
  assert.equal(s.getAll()[0]!.state, 'interrupted')
})
test('persistent reports survive restart without false recovery or mutable references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-incidents-'))
  try {
    const path = join(dir, 'reports.json'), repo = new IncidentRepository(path)
    await repo.initialize()
    new IncidentDiagnostics(repo).update([host()], now, 30000)
    await repo.flush()
    const id = repo.getAll()[0]!.id
    repo.getAll()[0]!.cause = 'Alteração externa'
    assert.equal(repo.getAll()[0]!.cause, 'Causa não identificada')
    const restarted = new IncidentRepository(path)
    await restarted.initialize(); await restarted.flush()
    assert.equal(restarted.getAll()[0]!.id, id)
    assert.equal(restarted.getAll()[0]!.state, 'interrupted')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('configuration rejects missing, self-referenced or unpolled access ports', () => {
  const config = { hosts: [host(), parent()], failureThreshold: 2, recoveryThreshold: 2 }
  config.hosts[0]!.attachment = { hostId: 'switch', interfaceIndex: 7 }
  assert.equal(validatedStoredConfigSchema.safeParse(config).success, true)
  for (const [hostId, interfaceIndex] of [['missing', 7], ['camera', 7], ['switch', 8]] as const) {
    config.hosts[0]!.attachment = { hostId, interfaceIndex }
    assert.equal(validatedStoredConfigSchema.safeParse(config).success, false)
  }
})
