import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ObservationAccounting } from '../src/domain/monitoring/observation-accounting.js'
import { IncidentTracker } from '../src/domain/monitoring/incident-tracker.js'
import type { HostSnapshot, PingResult, StatusEvent } from '../src/types/monitor.js'

function host(): HostSnapshot {
  return {
    id: 'server', name: 'Servidor', address: '127.0.0.1', group: 'TI', location: '',
    status: 'online', latencyMs: 5, averageLatencyMs: null, minLatencyMs: null,
    maxLatencyMs: null, packetLossPct: 0, availabilityPct: 0, ttl: null,
    lastCheckedAt: null, lastError: null, lastOnlineAt: null, lastOfflineAt: null,
    lastTransitionAt: null, currentDowntimeMs: 0, consecutiveFailures: 0, history: [],
  }
}
const timestamp = (ms: number) => new Date(ms).toISOString()
const reply = (alive: boolean, ms: number): PingResult => ({
  alive, checkedAt: timestamp(ms), latencyMs: alive ? 5 : null, ttl: null,
})

test('projecting availability is repeatable without accumulating time until advance', () => {
  const h = host(), accounting = new ObservationAccounting(() => 30000, () => undefined)
  accounting.advance(h, 1000)
  assert.equal(accounting.totals(h, 6000).observedMs, 5000)
  assert.equal(accounting.totals(h, 6000).observedMs, 5000)
  assert.equal(h.observedMs, 0)
  accounting.advance(h, 6000)
  h.status = 'offline'
  accounting.advance(h, 6000)
  const totals = accounting.totals(h, 9000)
  assert.equal(totals.onlineObservedMs, 5000)
  assert.equal(totals.offlineObservedMs, 3000)
  assert.equal(totals.observedMs, 8000)
})

test('maintenance boundaries and stale gaps stay outside the observed denominator', () => {
  const h = host(), accounting = new ObservationAccounting(() => 30000, () => undefined)
  h.maintenanceStart = timestamp(3000)
  h.maintenanceEnd = timestamp(7000)
  accounting.advance(h, 1000)
  const totals = accounting.totals(h, 11000)
  assert.equal(totals.maintenanceMs, 4000)
  assert.equal(totals.onlineObservedMs, 6000)
  const stale = accounting.totals(h, 41000)
  assert.equal(stale.maintenanceMs, 4000)
  assert.equal(stale.unknownMs, 36000)
  assert.equal(stale.observedMs, 0)
})

test('an interrupted incident cannot become a recovery with invented continuity', () => {
  const events: StatusEvent[] = []
  let now = 1000
  const tracker = new IncidentTracker({ add: event => { events.push(event) } }, () => now)
  const h = host()
  tracker.recordReply(h, reply(false, now), null)
  h.consecutiveFailures = 1
  now = 2000
  h.status = 'offline'
  tracker.recordTransition(h, reply(false, now), 'online')
  assert.equal(events[0]?.firstFailureAt, timestamp(1000))
  assert.equal(events[0]?.confirmedAt, timestamp(2000))
  now = 40000
  tracker.interrupt(h, 'Coletor reiniciado', true)
  tracker.resetFailures(h.id)
  h.status = 'online'
  tracker.recordReply(h, reply(true, now), h.lastCheckedAt)
  tracker.recordTransition(h, reply(true, now), 'unknown')
  assert.deepEqual(events.map(event => event.type), ['down', 'interrupted'])
  assert.equal(events[1]?.durationMs, null)
})
