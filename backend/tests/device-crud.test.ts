import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { ConfigRepository } from '../src/repositories/config.repository.js'
import { HistoryRepository } from '../src/repositories/history.repository.js'
import { MonitorService } from '../src/services/monitor.service.js'
import { createApp } from '../src/app.js'

test('device CRUD persists and handles concurrent creates, validation, pause and deletion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ping-crud-'))
  const config = new ConfigRepository(join(directory, 'config.json'))
  await config.save({ hosts: [], failureThreshold: 2, recoveryThreshold: 1 })
  const service = new MonitorService({ probe: async () => ({ alive: true, checkedAt: new Date().toISOString(), latencyMs: 3, ttl: 64 }) }, new HistoryRepository(join(directory, 'history.json')), [])
  await service.configure(config)
  await service.initialize()
  await service.stop()
  const server = createServer(createApp(service))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/monitor`
  const send = (method: string, path: string, body?: unknown, origin = 'http://localhost:5173') => fetch(`${base}${path}`, { method, headers: { origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  try {
    const make = (name: string) => ({ name, address: '127.0.0.1', group: 'TI', location: 'Sede', description: 'Monitoramento', enabled: true })
    assert.equal((await send('POST', '/hosts', { ...make('Proibido') }, 'https://external.example')).status, 403)
    assert.equal((await send('POST', '/hosts', { ...make('Inválido'), address: '127.0.0.1;whoami' })).status, 400)
    const [a, b] = await Promise.all([send('POST', '/hosts', make('A')), send('POST', '/hosts', make('B'))])
    assert.equal(a.status, 201); assert.equal(b.status, 201)
    const first = await a.json() as { id: string }
    const second = await b.json() as { id: string }
    assert.notEqual(first.id, second.id)
    assert.equal((await (await send('GET', '/config')).json()).hosts.length, 2)
    assert.equal((await send('PATCH', `/hosts/${first.id}`, { id: 'different' })).status, 400)
    assert.equal((await send('PATCH', '/hosts/does-not-exist', { name: 'X' })).status, 404)
    const changed = await send('PATCH', `/hosts/${first.id}`, { name: 'Gateway', group: 'Garagem', enabled: false, description: 'Link de backup' })
    assert.equal(changed.status, 200)
    assert.equal((await changed.json()).id, first.id)
    assert.equal(service.getSnapshot().hosts.find(host => host.id === first.id)?.suspended, 'Monitoramento pausado')
    assert.equal((await config.load()).hosts.find(host => host.id === first.id)?.group, 'Garagem')
    assert.equal((await send('DELETE', `/hosts/${second.id}`)).status, 204)
    assert.equal((await send('DELETE', `/hosts/${second.id}`)).status, 404)
    assert.deepEqual((await config.load()).hosts.map(host => host.id), [first.id])
    assert.deepEqual(service.getSnapshot().hosts.map(host => host.id), [first.id])
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
