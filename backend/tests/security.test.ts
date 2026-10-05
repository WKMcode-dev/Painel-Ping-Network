import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { createApp } from '../src/app.js'
import { MonitorService } from '../src/services/monitor.service.js'
import { ConfigRepository, hostSchema, storedConfigSchema } from '../src/repositories/config.repository.js'
import { loadAdminKey } from '../src/security/admin-access.js'
import { safeServiceAddress } from '../src/security/service-target.js'
import { containsIp } from '../src/utils/display-text.js'
import { editableTopologySchema } from '../src/repositories/topology.repository.js'
import { privateLabel } from '../../frontend/src/utils/privacy.js'
import { allFreePortChoices, snap, reconcileGraph, splitConnection, resolvedEdges, translateSelection, nodeSize } from '../../frontend/src/utils/topology.js'
import { checkService } from '../src/services/service-check.service.js'

const device = { id: 'a', name: 'Roteador', address: '127.0.0.1', group: 'TI', location: 'Sede', enabled: true }
for (const ip of ['10.10.3.233', '192.168.0.1', '::1', '2001:db8::1', 'fe80::1%eth0', '::ffff:192.168.0.1']) {
  for (const field of ['name', 'group', 'location', 'description']) test(`IPs rejected in display field ${field}: ${ip}`, () => {
    assert.equal(hostSchema.safeParse({ ...device, [field]: `Equipamento ${ip}` }).success, false)
    assert.ok(containsIp(`IP: [${ip}].`)); assert.ok(!privateLabel(`Equipamento ${ip}`).includes(ip))
  })
}
for (const name of ['Servidor 01', 'Impressora — Garagem', 'Horário 12:30', 'Roteador principal', 'Equipamento v1.10.1']) test(`ordinary labels accepted: ${name}`, () => assert.ok(hostSchema.safeParse({ ...device, name }).success))

test('old inventories keep loading with names containing addresses while writes reject them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-old-label-'))
  try {
    const repo = new ConfigRepository(join(dir, 'config.json'))
    const config = { hosts: [{ ...device, name: 'Router 127.0.0.1' }], failureThreshold: 2, recoveryThreshold: 1 }
    await repo.save(config)
    assert.deepEqual(await repo.load(), config)
    assert.ok(storedConfigSchema.safeParse(config).success)
    assert.equal(privateLabel(config.hosts[0]!.name, device.address), 'Router [endereço oculto]')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('administrator key persists separately from releases and never appears in configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-admin-key-'))
  try {
    const path = join(dir, 'admin-access.json'), key = await loadAdminKey(path)
    assert.ok(key.length >= 32); assert.ok(await loadAdminKey(path) === key)
    assert.ok((await readFile(path, 'utf8')).includes('key'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('combinations of methods, tokens and origins cannot bypass write authorization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-security-api-'))
  const repository = new ConfigRepository(join(dir, 'config.json'))
  await repository.save({ hosts: [device], failureThreshold: 2, recoveryThreshold: 1 })
  const service = new MonitorService({ probe: async () => ({ alive: true, latencyMs: 1, ttl: 64, checkedAt: new Date().toISOString() }) }, { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [])
  await service.configure(repository)
  const key = 'test-administrator-key', server = createServer(createApp(service, key))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const token of ['', 'wrong', key]) for (const origin of ['', 'https://attacker.example', base]) {
      const response = await fetch(base + '/api/monitor/config', { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(origin && { Origin: origin }), 'Content-Type': 'application/json' }, body: JSON.stringify({ hosts: [device], failureThreshold: 2, recoveryThreshold: 1 }) })
      assert.equal(response.status, origin === 'https://attacker.example' ? 403 : token !== key ? 401 : method === 'PUT' ? 200 : 404)
    }
    for (const body of ['{invalid', JSON.stringify({ x: 'x'.repeat(2100000) })]) {
      const response = await fetch(base + '/api/monitor/config', { method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body })
      assert.ok([400, 413].includes(response.status)); assert.ok(!(await response.text()).includes('stack'))
    }
    const response = await fetch(base + '/api/health')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('x-powered-by'), null)
    assert.ok(!(await (await fetch(base + '/api/monitor/config')).text()).includes(key))
    for (let i = 0; i < 125; i++) await fetch(base + '/api/monitor/refresh', { method: 'POST' })
    assert.equal((await fetch(base + '/api/monitor/refresh', { method: 'POST' })).status, 429)
    assert.equal((await fetch(base + '/api/health')).status, 200)
    assert.equal((await fetch(base + '/api/monitor/refresh', { method: 'POST', headers: { Authorization: `Bearer ${key}` } })).status, 200)
  } finally { await service.stop(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }) }
})

for (const url of ['file:///etc/passwd', 'http://attacker.example/', 'http://user:pass@127.0.0.1/', 'http://2130706433@attacker.example/']) test(`unapproved service URL rejected: ${url}`, () => assert.equal(hostSchema.safeParse({ ...device, checks: [{ id: 'check', type: 'http', url }] }).success, false))
for (const address of ['169.254.169.254', '169.254.170.2', '0.0.0.0', '::', '::ffff:169.254.169.254', 'fe80::1', 'fd00:ec2::254', 'unknown.example']) test(`HTTP metadata/unspecified/unresolved target denied: ${address}`, async () => {
  assert.equal(safeServiceAddress(address), false)
  assert.equal((await checkService(address, { id: 'a', type: 'http', url: 'http://127.0.0.1/' })).status, 'unknown')
})

test('HTTP uses the provided IP instead of resolving the URL again', async () => {
  let receivedHost = ''
  const server = createServer((req, res) => { receivedHost = req.headers.host ?? ''; res.end('ok') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  try {
    assert.equal((await checkService('127.0.0.1', { id: 'a', type: 'http', url: `http://unresolvable.invalid:${port}/` })).status, 'available')
    assert.equal(receivedHost, `unresolvable.invalid:${port}`)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('half-cell moves apply to nodes, junction centers, bends and persistence reconciliation', () => {
  let graph = { nodes: [{ id: 'a', label: 'A', x: 12, y: 36, color: 'blue' as const }, { id: 'b', label: 'B', x: 600, y: 36, color: 'blue' as const }], edges: [{ id: 'e', source: 'a', target: 'b', label: '' }] }
  const next = splitConnection(graph, resolvedEdges(graph)[0]!, 'junction', 'second')
  const j = next.nodes.find(n => n.id === 'junction')!
  assert.equal((j.x + nodeSize(j).width / 2) % 12, 0); assert.equal((j.y + 6) % 12, 0)
  const moved = translateSelection(next, next.nodes.map(n => n.id), 12, 12)
  assert.equal(moved.nodes[0]!.x, 24); assert.equal(moved.nodes[0]!.y, 48)
  assert.deepEqual(reconcileGraph(moved, []).nodes, moved.nodes)
  assert.equal(snap(37), 36)
})

test('free + points appear on both sides of an occupied port and multiple occupied ports', () => {
  const edges = [{ id: 'e', source: 'a', target: 'b', label: '', sourceSide: 'right' as const, sourceOffset: .5 }]
  assert.deepEqual(allFreePortChoices(edges).get('a:right'), [.25, .75])
  edges.push({ ...edges[0]!, id: 'e2', sourceOffset: .25 })
  assert.deepEqual(allFreePortChoices(edges).get('a:right'), [.125, .375, .75])
})

test('map texts cannot bypass the address field with embedded IPs', () => {
  for (const changes of [{ label: 'Server 10.0.0.1' }, { subtitle: '::1' }, { caption: '10.0.0.1' }, { texts: [{ id: 't', kind: 'text', text: '10.0.0.1' }] }]) {
    assert.equal(editableTopologySchema.safeParse({ nodes: [{ id: 'a', label: 'A', x: 0, y: 0, color: 'blue', ...changes }], edges: [] }).success, false)
  }
})

test('hostile WebSocket origins and oversized messages cannot crash the server', async () => {
  const { WebSocket } = await import('ws')
  const { createStatusGateway } = await import('../src/websocket/status.gateway.js')
  const service = new MonitorService({ probe: async () => ({ alive: true, latencyMs: 1, ttl: 64, checkedAt: new Date().toISOString() }) }, { async initialize() {}, async flush() {}, getAll: () => [], getByHost: () => [], add() {} }, [])
  const server = createServer(createApp(service, 'test-key')), gateway = createStatusGateway(server, service)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/ws/status`
  const clients: InstanceType<typeof WebSocket>[] = []
  try {
    const hostile = new WebSocket(url, { origin: 'https://attacker.example' }); clients.push(hostile)
    await new Promise<void>(resolve => hostile.once('error', error => { assert.match(error.message, /403/); resolve() }))
    const large = new WebSocket(url); clients.push(large); large.on('error', () => {})
    await new Promise<void>(resolve => large.once('open', () => resolve()))
    const closed = new Promise<void>(resolve => large.once('close', () => resolve()))
    large.send('x'.repeat(2048)); await closed
    const valid = new WebSocket(url); clients.push(valid); valid.on('error', () => {})
    await new Promise<void>(resolve => valid.once('message', message => { assert.equal(JSON.parse(message.toString()).type, 'snapshot'); resolve() }))
    assert.ok(server.listening)
  } finally {
    clients.forEach(client => client.terminate()); gateway.clients.forEach(client => client.terminate())
    await new Promise<void>(resolve => gateway.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('fixed storage accepts existing IP labels without deleting or changing original files', async () => {
  const { initializeStorage } = await import('../src/storage/initialize-storage.js')
  const { writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'ping-label-migrate-'))
  const path = join(dir, 'config.json'), config = { hosts: [{ ...device, name: 'Router 127.0.0.1' }], failureThreshold: 2, recoveryThreshold: 1 }
  try {
    await writeFile(path, JSON.stringify(config))
    await initializeStorage({ directory: dir, projectRoot: dir })
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), config)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('rectangular ports align with half-grid without introducing a diagonal on split connections', async () => {
  const { anchor, edgePoints } = await import('../../frontend/src/utils/topology.js')
  const a = { id: 'a', label: 'A', x: 12, y: 12, color: 'blue' as const }, b = { ...a, id: 'b', x: 600 }
  for (const offset of [.2, .3, .5, .7]) {
    const edge = { id: 'e', source: 'a', target: 'b', label: '', sourceSide: 'right' as const, targetSide: 'left' as const, sourceOffset: offset, targetOffset: offset }
    const point = anchor(a, 'right', offset)
    assert.equal(point.y % 12, 0)
    const graph = splitConnection({ nodes: [a, b], edges: [edge] }, edge, 'j', 'part')
    const junction = graph.nodes.find(n => n.id === 'j')!
    assert.equal(anchor(junction, 'left').y, point.y)
    assert.ok(edgePoints(a, junction, graph.edges[0]!).every(p => p.y === point.y))
  }
})

test('HTTPS reverse proxy preserves legitimate origins; similar attacker domains remain denied', async () => {
  const { allowedOrigin } = await import('../src/security/origin.js')
  assert.ok(allowedOrigin('https://monitor.example', 'monitor.example'))
  assert.equal(allowedOrigin('https://monitor.example.attacker.test', 'monitor.example'), false)
  assert.equal(allowedOrigin('null', 'monitor.example'), false)
})

test('new port choices use actual half-grid positions and do not overlap occupied anchors', async () => {
  const { anchor } = await import('../../frontend/src/utils/topology.js')
  const node = { id: 'a', label: 'A', x: 12, y: 12, color: 'blue' as const }
  const edges = [{ id: 'e', source: 'a', target: 'b', label: '', sourceSide: 'right' as const, sourceOffset: .3 }]
  const points = allFreePortChoices(edges, [node]).get('a:right')!
  const occupied = anchor(node, 'right', .3)
  assert.ok(points.some(p => anchor(node, 'right', p).y < occupied.y))
  assert.ok(points.some(p => anchor(node, 'right', p).y > occupied.y))
  for (const p of points) { const actual = anchor(node, 'right', p); assert.equal(actual.y % 12, 0); assert.ok(Math.abs(actual.y - occupied.y) >= 12) }
})
