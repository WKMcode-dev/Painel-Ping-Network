import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MonitorService } from '../src/services/monitor.service.js'
import { ConfigRepository, configSchema } from '../src/repositories/config.repository.js'
import { checkService } from '../src/services/service-check.service.js'
import { parsePing } from '../src/utils/ping-parser.js'
import { env } from '../src/config/env.js'
import type { PingResult, StatusEvent } from '../src/types/monitor.js'
import { currentHost, incidentRows } from '../../frontend/src/utils/panel.js'

const host = { id: 'a', name: 'A', address: '127.0.0.1', group: 'TI', location: 'Local' }
function fixture() {
  let now = Date.parse('2026-10-02T12:00:00Z'), alive = true, error = false, ip = '127.0.0.1'
  const events: StatusEvent[] = []
  const service = new MonitorService({ probe: async () => ({ alive, latencyMs: alive ? 10 : null, ttl: 64, checkedAt: new Date(now).toISOString(), probeError: error, resolvedAddress: ip }) },
    { async initialize() {}, async flush() {}, getAll: () => events, getByHost: id => events.filter(e => e.hostId === id), add: event => events.unshift(event) }, [host], () => now)
  return { service, events, tick: (ms: number) => { now += ms }, set: (value: boolean, collectorError = false) => { alive = value; error = collectorError }, ip: (value: string) => { ip = value }, now: () => now }
}

test('elapsed availability, unknown gaps and stale backend-connected data', async () => {
  const f = fixture(); await f.service.initialize(); await f.service.stop()
  f.tick(10000); f.set(false); await f.service.runCycle()
  f.tick(5000); await f.service.runCycle()
  f.tick(5000)
  let h = f.service.getSnapshot().hosts[0]!
  assert.equal(h.observedMs, 20000); assert.equal(h.availabilityPct, 75)
  assert.ok(Math.abs(h.responsePct! - 100 / 3) < 1e-9); assert.equal(h.sampleCount, 3)
  assert.equal(h.firstFailureAt, new Date(f.now() - 10000).toISOString())
  f.tick(31000)
  h = f.service.getSnapshot().hosts[0]!
  assert.equal(h.status, 'unknown'); assert.equal(h.dataQuality, 'stale')
  assert.equal(h.observedMs, 15000); assert.equal(h.unknownMs, 36000)
  assert.equal(f.events.filter(e => e.type === 'gap').length, 1)
  f.service.getSnapshot(); assert.equal(f.events.filter(e => e.type === 'gap').length, 1)
  assert.equal(f.events.find(e => e.type === 'interrupted')!.durationMs, null)
  assert.equal(currentHost(h, true, f.now(), 5000, 30000).status, 'unknown')
  f.tick(5000); f.set(true); await f.service.runCycle()
  assert.equal(f.service.getSnapshot().hosts[0]!.status, 'online')
  assert.equal(f.events.filter(e => e.type === 'recovery').length, 0)
})

test('collector failure does not count as packet loss or confirmed outage; DNS changes reset streaks', async () => {
  const f = fixture(); await f.service.initialize(); await f.service.stop()
  f.tick(5000); f.set(false, true); await f.service.runCycle()
  let h = f.service.getSnapshot().hosts[0]!
  assert.equal(h.status, 'unknown'); assert.equal(h.packetLossPct, 0); assert.equal(h.sampleCount, 1)
  assert.equal(currentHost(h, true, f.now()).suspended, 'Verificação indisponível')
  f.tick(5000); f.set(false); await f.service.runCycle()
  f.tick(5000); f.ip('127.0.0.2'); await f.service.runCycle()
  h = f.service.getSnapshot().hosts[0]!
  assert.equal(h.status, 'unknown'); assert.equal(h.consecutiveFailures, 1); assert.equal(h.sampleCount, 1)
  assert.equal(h.resolvedAddress, '127.0.0.2'); assert.equal(f.events[0]!.type, 'dns_change')
  assert.equal(f.events.filter(e => e.type === 'down').length, 0)
})

test('suspend gap is not included in observed availability even without a snapshot while suspended', async () => {
  const f = fixture(); await f.service.initialize(); await f.service.stop()
  f.tick(60000); await f.service.runCycle()
  const h = f.service.getSnapshot().hosts[0]!
  assert.equal(h.observedMs, 0); assert.equal(h.unknownMs, 60000)
  assert.equal(f.events[0]!.type, 'gap')
})

test('old and invalid timestamps cannot overwrite the latest result', async () => {
  let time = Date.now(), result: PingResult = { alive: true, latencyMs: 3, ttl: 64, checkedAt: new Date(time).toISOString() }
  const service = new MonitorService({ probe: async () => result }, { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [host])
  await service.initialize(); await service.stop()
  for (const timestamp of [new Date(time - 1000).toISOString(), 'broken', new Date(time + 60000).toISOString()]) {
    result = { ...result, alive: false, checkedAt: timestamp }; await service.runCycle()
    assert.equal(service.getSnapshot().hosts[0]!.history.length, 1)
    assert.equal(service.getSnapshot().hosts[0]!.status, 'online')
  }
})

for (const edit of ['address', 'pause', 'remove'] as const) test(`in-flight result is discarded before ${edit} mutation`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-generation-'))
  let release: ((value: PingResult) => void) | undefined, delayed = false
  const repository = new ConfigRepository(join(dir, 'config.json'))
  await repository.save({ hosts: [host], failureThreshold: 1, recoveryThreshold: 1 })
  const events: StatusEvent[] = []
  const service = new MonitorService({ probe: async () => delayed ? new Promise<PingResult>(resolve => { release = resolve }) : { alive: true, latencyMs: 2, ttl: 64, checkedAt: new Date().toISOString() } },
    { async initialize() {}, async flush() {}, getAll: () => events, getByHost: () => events, add: e => events.unshift(e) }, [])
  try {
    await service.configure(repository); await service.initialize(); await service.stop()
    delayed = true; const cycle = service.runCycle()
    while (!release) await new Promise(resolve => setImmediate(resolve))
    const saving = service.updateConfiguration(config => ({ ...config, hosts: edit === 'remove' ? [] : [{ ...host, ...(edit === 'address' ? { address: '::1' } : { enabled: false }) }] }))
    release({ alive: false, latencyMs: null, ttl: null, checkedAt: new Date().toISOString() })
    await Promise.all([cycle, saving])
    assert.equal(events.filter(e => e.type === 'down').length, 0)
    assert.equal(service.getSnapshot().hosts[0]?.status ?? 'removed', edit === 'remove' ? 'removed' : 'unknown')
  } finally { await service.stop(); await rm(dir, { recursive: true, force: true }) }
})

test('bounded hung collector returns unknown and leaves cycle available for retry', async () => {
  const original = env.PING_TIMEOUT_MS; env.PING_TIMEOUT_MS = 250
  const service = new MonitorService({ probe: () => new Promise(() => {}) }, { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [host])
  try {
    await service.initialize(); await service.stop()
    const h = service.getSnapshot().hosts[0]!
    assert.equal(h.status, 'unknown'); assert.equal(h.dataQuality, 'collector-error'); assert.equal(h.history.length, 0)
  } finally { env.PING_TIMEOUT_MS = original; await service.stop() }
})

test('TCP and HTTP probes are independent, enforce expected status and do not follow redirects', async () => {
  const server = createServer((request, response) => { response.statusCode = request.url === '/bad' ? 503 : request.url === '/redirect' ? 302 : 200; response.setHeader('Location', '/bad'); response.end('ok') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port, url = `http://127.0.0.1:${port}`
  try {
    assert.equal((await checkService('127.0.0.1', { id: 'tcp', type: 'tcp', port })).status, 'available')
    assert.equal((await checkService('127.0.0.1', { id: 'http', type: 'http', url })).status, 'available')
    assert.equal((await checkService('127.0.0.1', { id: 'http', type: 'http', url: url + '/bad' })).status, 'unavailable')
    assert.equal((await checkService('127.0.0.1', { id: 'http', type: 'http', url: url + '/redirect', expectedStatus: 302 })).status, 'available')
    assert.equal((await checkService('127.0.0.1', { id: 'http', type: 'http', url, expectedStatus: 204 })).status, 'unavailable')
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  assert.equal((await checkService('127.0.0.1', { id: 'tcp', type: 'tcp', port })).status, 'unavailable')
})

test('service validation rejects invalid URLs, credential URLs, duplicate IDs and missing ports', () => {
  for (const checks of [[{ id: 'a', type: 'tcp' }], [{ id: 'a', type: 'http', url: 'file:///etc/passwd' }], [{ id: 'a', type: 'http', url: 'http://user:pass@localhost' }], [{ id: 'a', type: 'tcp', port: 80 }, { id: 'a', type: 'tcp', port: 443 }]]) {
    assert.equal(configSchema.safeParse({ hosts: [{ ...host, checks }], failureThreshold: 2, recoveryThreshold: 1 }).success, false)
  }
})

for (const output of ['64 bytes from ::1: icmp_seq=1 hlim=64 time=0.12 ms', 'Antwort von ::1: Zeit<1ms', 'Réponse de ::1: temps=12 ms', 'Respuesta desde ::1: tiempo=12ms', 'Resposta de ::1: tempo=1ms', 'Reply from ::1: time=1ms']) test(`localized IPv6 timed reply: ${output}`, () => assert.equal(parsePing(output, 0, true).alive, true))
for (const output of ['Destination host unreachable.', 'Host de destino inacessível.', 'Reply from router: Destination host unreachable. time=1ms', '100% packet loss', 'unknown output']) test(`not an ICMP reply: ${output}`, () => assert.equal(parsePing(output, 0, true).alive, false))

test('non-incident events never masquerade as recoveries in the incident table', () => {
  const events = ['gap', 'dns_change', 'paused', 'maintenance', 'down'].map((type, i) => ({ id: String(i), type, hostId: 'a', timestamp: new Date(10000 - i * 1000).toISOString(), durationMs: null, message: '' })) as StatusEvent[]
  assert.equal(incidentRows(events)[0]!.end, null)
})

test('maintenance boundaries, pause and unknown intervals are excluded from availability', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-time-account-'))
  const start = Date.now(); let now = start
  const repository = new ConfigRepository(join(dir, 'config.json'))
  await repository.save({ hosts: [{ ...host, maintenanceStart: new Date(start + 10000).toISOString(), maintenanceEnd: new Date(start + 20000).toISOString() }], failureThreshold: 2, recoveryThreshold: 1 })
  const service = new MonitorService({ probe: async () => ({ alive: true, latencyMs: 2, ttl: 64, checkedAt: new Date(now).toISOString() }) },
    { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [], () => now)
  try {
    await service.configure(repository); await service.initialize(); await service.stop()
    now += 15000; await service.runCycle()
    let h = service.getSnapshot().hosts[0]!
    assert.equal(h.onlineObservedMs, 10000); assert.equal(h.maintenanceMs, 5000); assert.equal(h.status, 'unknown')
    now += 10000; await service.runCycle()
    h = service.getSnapshot().hosts[0]!
    assert.equal(h.observedMs, 10000); assert.equal(h.maintenanceMs, 10000); assert.equal(h.unknownMs, 5000); assert.equal(h.availabilityPct, 100)
    await service.updateConfiguration(config => ({ ...config, hosts: [{ ...host, enabled: false }] }))
    now += 60000; await service.runCycle()
    h = service.getSnapshot().hosts[0]!
    assert.equal(h.pausedMs, 60000); assert.equal(h.unknownMs, 5000); assert.equal(h.observedMs, 10000)
  } finally { await service.stop(); await rm(dir, { recursive: true, force: true }) }
})

test('latency percentiles and jitter use valid responses; failed probes do not become zero latency', async () => {
  let now = Date.now(), latency = 1, alive = true
  const service = new MonitorService({ probe: async () => ({ alive, latencyMs: alive ? latency : null, ttl: 64, checkedAt: new Date(now).toISOString() }) },
    { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [host], () => now)
  await service.initialize(); await service.stop()
  for (latency = 2; latency <= 20; latency++) { now += 5000; await service.runCycle() }
  alive = false; now += 5000; await service.runCycle()
  const h = service.getSnapshot().hosts[0]!
  assert.equal(h.p95LatencyMs, 19); assert.equal(h.jitterMs, 1); assert.equal(h.minLatencyMs, 1)
  assert.equal(h.sampleCount, 21); assert.ok(Math.abs(h.packetLossPct - 100 / 21) < 1e-9)
})

test('administrative and quality events never generate outage/recovery alerts', async () => {
  const { AlertTracker } = await import('../../frontend/src/utils/alerts.js')
  const { defaultPreferences } = await import('../../frontend/src/types/config.js')
  const f = fixture(); await f.service.initialize(); await f.service.stop()
  const tracker = new AlertTracker(), snapshot = f.service.getSnapshot()
  tracker.accept(snapshot, { ...defaultPreferences, alerts: true }, f.now())
  snapshot.recentEvents = ['gap', 'dns_change', 'paused', 'maintenance', 'interrupted'].map(type => ({ id: type, hostId: 'a', type, timestamp: new Date(f.now()).toISOString(), durationMs: null, message: type })) as StatusEvent[]
  assert.equal(tracker.accept(snapshot, { ...defaultPreferences, alerts: true }, f.now()).length, 0)
})

test('unrecognized failure output is a collector error, not evidence of packet loss', () => {
  for (const code of [0, 1, 2, null]) assert.equal(parsePing('unrecognized localized output', code, true).probeError, true)
})
