import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePing } from '../src/utils/ping-parser.js'
import { isValidHost } from '../src/utils/host-validation.js'
import { MonitorService } from '../src/services/monitor.service.js'
import { HistoryRepository } from '../src/repositories/history.repository.js'
import type { PingResult, StatusEvent } from '../src/types/monitor.js'

for (const windows of [true, false]) {
  for (const code of [0, 1, 2, null]) {
    for (const output of ['Reply: bytes=32 time=12ms TTL=64', 'Resposta: bytes=32 tempo<1ms TTL=128', 'Destination host unreachable.', '']) {
      test(`parser windows=${windows}, exit=${code}, ${output || 'empty'}`, () => {
        const reply = /time|tempo/.test(output)
        const result = parsePing(output, code, windows)
        assert.equal(result.alive, code === 0 && (!windows || reply))
        if (!result.alive) assert.equal(result.latencyMs, null)
        if (result.alive && output.includes('<1')) assert.equal(result.latencyMs, 0)
      })
    }
  }
}

test('addresses cannot become shell options or commands', () => {
  for (const value of ['127.0.0.1', '::1', 'router.example']) assert.ok(isValidHost(value))
  for (const value of ['-t', 'a;whoami', 'a b', '$(id)', 'https://example.com']) assert.equal(isValidHost(value), false)
})

function fixture(saved: StatusEvent[] = []) {
  const events = [...saved]
  let next: PingResult = { alive: true, latencyMs: 4, ttl: 64, checkedAt: new Date().toISOString() }
  let calls = 0
  const probe = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 2)); return { ...next } }
  const service = new MonitorService({ probe }, {
    async initialize() {}, async flush() {}, getAll: () => [...events],
    getByHost: (id) => events.filter((e) => e.hostId === id), add: (e) => { events.unshift(e) },
  }, [{ id: 'test', name: 'Test', address: '127.0.0.1', group: 'Tests', location: 'Local' }])
  return { service, events, calls: () => calls, set: (alive: boolean, probeError = false) => {
    next = { alive, probeError, latencyMs: alive ? 4 : null, ttl: null, checkedAt: new Date().toISOString(), error: probeError ? 'collector unavailable' : undefined }
  } }
}

// Exhaustive sequences of four responses: success / lost packet / collector failure.
for (let permutation = 0; permutation < 81; permutation++) {
  const sequence = Array.from({ length: 4 }, (_, i) => Math.floor(permutation / 3 ** i) % 3)
  test(`state sequence ${sequence.join('-')}`, async () => {
    const f = fixture()
    await f.service.initialize()
    await f.service.stop()
    let failures = 0, status = 'online', open = false, expectedEvents = 0, samples = 1
    for (const outcome of sequence) {
      f.set(outcome === 0, outcome === 2)
      if (outcome === 2) { failures = 0; status = 'unknown' }
      else {
        samples++
        failures = outcome === 0 ? 0 : failures + 1
        if (outcome === 0) status = 'online'
        else if (failures >= 2) status = 'offline'
        if (status === 'offline' && !open) { open = true; expectedEvents++ }
        else if (status === 'online' && open) { open = false; expectedEvents++ }
      }
      await f.service.runCycle()
      const host = f.service.getSnapshot().hosts[0]!
      assert.equal(host.status, status)
      assert.equal(host.history.length, samples)
      assert.equal(f.events.length, expectedEvents)
    }
  })
}

test('simultaneous refresh requests share a complete cycle', async () => {
  const f = fixture(); await f.service.initialize(); await f.service.stop()
  const before = f.calls()
  await Promise.all([f.service.runCycle(), f.service.runCycle(), f.service.runCycle()])
  assert.equal(f.calls(), before + 1)
})

test('restart closes a persisted incident without creating duplicate down', async () => {
  const down: StatusEvent = { id: 'down', hostId: 'test', type: 'down', timestamp: new Date(Date.now() - 60000).toISOString(), durationMs: null, message: 'down' }
  const f = fixture([down]); f.set(false)
  await f.service.initialize(); await f.service.stop(); await f.service.runCycle()
  assert.equal(f.events.length, 1)
  f.set(true); await f.service.runCycle()
  assert.equal(f.events[0]!.type, 'recovery')
  assert.ok(f.events[0]!.durationMs! >= 60000)
})

test('history survives write + reload and corrupt files are not silently discarded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ping-test-'))
  const path = join(directory, 'history.json')
  try {
    const repo = new HistoryRepository(path); await repo.initialize()
    repo.add({ id: '1', hostId: 'a', type: 'down', timestamp: new Date().toISOString(), durationMs: null, message: 'down' })
    await repo.flush()
    const reloaded = new HistoryRepository(path); await reloaded.initialize()
    assert.equal(reloaded.getAll().length, 1)
    await writeFile(path, '{broken')
    await assert.rejects(new HistoryRepository(path).initialize())
  } finally { await rm(directory, { recursive: true, force: true }) }
})
