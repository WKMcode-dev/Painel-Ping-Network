import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { ConfigRepository, configSchema, type MonitorConfig } from '../src/repositories/config.repository.js'
import { MonitorService } from '../src/services/monitor.service.js'
import { HistoryRepository } from '../src/repositories/history.repository.js'
import { createApp } from '../src/app.js'
import { currentHost, incidentRows } from '../../frontend/src/utils/panel.js'

const host = { id: 'a', name: 'Router', address: '127.0.0.1', location: 'Local', group: 'TI', enabled: true }
const base: MonitorConfig = { hosts: [host], failureThreshold: 2, recoveryThreshold: 2 }
async function fixture(config = base) {
  const dir = await mkdtemp(join(tmpdir(), 'ping-operations-'))
  const repository = new ConfigRepository(join(dir, 'config.json'))
  await repository.save(config)
  let alive = true, calls = 0
  const service = new MonitorService({ probe: async () => {
    calls++; return { alive, latencyMs: alive ? 2 : null, ttl: null, checkedAt: new Date().toISOString() }
  } }, new HistoryRepository(join(dir, 'history.json')), [])
  await service.configure(repository); await service.initialize(); await service.stop()
  return { service, repository, dir, calls: () => calls, set: (v: boolean) => { alive = v },
    async close() { await service.stop(); await rm(dir, { recursive: true, force: true }) } }
}

for (const down of [1, 2, 3]) for (const up of [1, 2, 3]) {
  test(`confirmation thresholds down=${down} recovery=${up}`, async () => {
    const f = await fixture({ ...base, failureThreshold: down, recoveryThreshold: up })
    try {
      for (let i = 1; i < up; i++) await f.service.runCycle()
      assert.equal(f.service.getSnapshot().hosts[0]!.status, 'online')
      f.set(false)
      for (let i = 1; i <= down; i++) {
        await f.service.runCycle()
        assert.equal(f.service.getSnapshot().hosts[0]!.status, i < down ? 'online' : 'offline')
      }
      f.set(true)
      for (let i = 1; i <= up; i++) {
        await f.service.runCycle()
        assert.equal(f.service.getSnapshot().hosts[0]!.status, i < up ? 'offline' : 'online')
      }
      assert.deepEqual(f.service.getHostEvents('a').map(e => e.type), ['recovery', 'down'])
      // Interleaved packets must reset each confirmation streak.
      if (down > 1) {
        for (const state of [false, true, false, true]) { f.set(state); await f.service.runCycle() }
        assert.equal(f.service.getHostEvents('a').length, 2)
      }
    } finally { await f.close() }
  })
}
for (const maintenance of [false, true]) test(`suspension suppresses probes and recovery maintenance=${maintenance}`, async () => {
  const f = await fixture()
  try {
    f.set(false); await f.service.runCycle(); await f.service.runCycle()
    const config = { ...base, hosts: [{ ...host, ...(maintenance ? {
      maintenanceStart: new Date(Date.now() - 1000).toISOString(), maintenanceEnd: new Date(Date.now() + 60000).toISOString(),
    } : { enabled: false }) }] }
    await f.service.saveConfiguration(config)
    const count = f.calls()
    await f.service.runCycle()
    assert.equal(f.calls(), count)
    assert.equal(f.service.getSnapshot().summary.activeIncidents, 0)
    assert.ok(f.service.getSnapshot().hosts[0]!.suspended)
    assert.equal(f.service.getHostEvents('a')[0]!.type, 'interrupted')
    await f.service.saveConfiguration(base)
    f.set(true); await f.service.runCycle(); await f.service.runCycle()
    assert.equal(f.service.getSnapshot().hosts[0]!.status, 'online')
    assert.equal(f.service.getHostEvents('a').filter(e => e.type === 'recovery').length, 0)
  } finally { await f.close() }
})

test('CRUD, restart persistence, concurrent refresh/save, changing address and empty inventory', async () => {
  const f = await fixture()
  try {
    f.set(false); await f.service.runCycle(); await f.service.runCycle()
    const config = { ...base, hosts: [{ ...host, name: 'New name', address: '::1', group: 'Garagem' }, { ...host, id: 'b' }] }
    await Promise.all([f.service.runCycle(), f.service.saveConfiguration(config)])
    assert.equal(f.service.getSnapshot().hosts.length, 2)
    assert.equal(f.service.getHostEvents('a')[0]!.type, 'interrupted')
    assert.deepEqual(await new ConfigRepository(join(f.dir, 'config.json')).load(), config)
    await Promise.all([f.service.saveConfiguration(base), f.service.runCycle(), f.service.saveConfiguration({ ...base, hosts: [] })])
    assert.equal(f.service.getSnapshot().hosts.length, 0)
    await writeFile(join(f.dir, 'config.json'), '{broken')
    await assert.rejects(f.repository.load())
  } finally { await f.close() }
})

test('invalid address, duplicate id, thresholds and maintenance are rejected', () => {
  for (const config of [
    { ...base, hosts: [{ ...host, address: '-t' }] }, { ...base, hosts: [host, host] },
    { ...base, recoveryThreshold: 0 }, { ...base, failureThreshold: 21 },
    { ...base, hosts: [{ ...host, maintenanceStart: new Date().toISOString() }] },
    { ...base, hosts: [{ ...host, maintenanceStart: '2026-09-24T20:00:00Z', maintenanceEnd: '2026-09-24T19:00:00Z' }] },
  ]) assert.equal(configSchema.safeParse(config).success, false)
})

test('HTTP config endpoints save valid data, reject hostile origin and invalid payload', async () => {
  const f = await fixture()
  const server = createServer(createApp(f.service))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/api/monitor/config`
  try {
    assert.equal((await fetch(url)).status, 200)
    const send = (body: unknown, origin = 'http://localhost:5173') => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) })
    assert.equal((await send(base, 'https://attacker.example')).status, 403)
    assert.equal((await send({ ...base, recoveryThreshold: 0 })).status, 400)
    assert.equal((await send({ ...base, hosts: [] })).status, 200)
    assert.equal(f.service.getSnapshot().hosts.length, 0)
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await f.close() }
})

test('freshness never displays stale green; incident table pairs administrative closure separately', async () => {
  const f = await fixture({ ...base, recoveryThreshold: 1 })
  try {
    const h = f.service.getSnapshot().hosts[0]!
    assert.equal(currentHost(h, true, Date.now()).status, 'online')
    assert.equal(currentHost(h, false, Date.now()).suspended, 'Sem atualização')
    assert.equal(currentHost(h, true, Date.now() + 31000).status, 'unknown')
    f.set(false); await f.service.runCycle(); await f.service.runCycle()
    await f.service.saveConfiguration({ ...base, hosts: [{ ...host, enabled: false }] })
    const rows = incidentRows(f.service.getHostEvents('a'))
    assert.equal(rows.length, 1); assert.equal(rows[0]!.interrupted, true); assert.ok(rows[0]!.end)
  } finally { await f.close() }
})


test('alert baseline, deduplication, mute, hidden devices and old events', async () => {
  const { AlertTracker } = await import('../../frontend/src/utils/alerts.js')
  const { defaultPreferences } = await import('../../frontend/src/types/config.js')
  const f = await fixture()
  try {
    const tracker = new AlertTracker(), snapshot = f.service.getSnapshot()
    const preferences = { ...defaultPreferences, alerts: true }
    const now = Date.now()
    const event = { id: 'e', hostId: 'a', type: 'down' as const, timestamp: new Date(now).toISOString(), durationMs: null, message: 'down' }
    assert.equal(tracker.accept(snapshot, preferences, now).length, 0)
    snapshot.recentEvents = [event]
    assert.equal(tracker.accept(snapshot, preferences, now).length, 1)
    assert.equal(tracker.accept(snapshot, preferences, now).length, 0)
    snapshot.recentEvents = [{ ...event, id: 'muted' }, event]
    assert.equal(tracker.accept(snapshot, { ...preferences, mutedUntil: now + 1000 }, now).length, 0)
    assert.equal(tracker.accept(snapshot, preferences, now + 2000).length, 0)
    snapshot.recentEvents.unshift({ ...event, id: 'hidden' })
    assert.equal(tracker.accept(snapshot, { ...preferences, hidden: ['a'] }, now).length, 0)
    assert.equal(tracker.accept(snapshot, preferences, now).length, 0)
    snapshot.recentEvents.unshift({ ...event, id: 'old', timestamp: new Date(now - 60001).toISOString() })
    assert.equal(tracker.accept(snapshot, preferences, now).length, 0)
  } finally { await f.close() }
})
