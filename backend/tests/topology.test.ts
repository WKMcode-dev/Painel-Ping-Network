import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import express from 'express'
import { TopologyRepository, TopologyConflict, topologySchema } from '../src/repositories/topology.repository.js'
import { createTopologyRouter } from '../src/routes/topology.routes.js'
import { initialGraph, reconcileGraph, connectNodes, zoomAt, worldPoint, fitNodes, edgeCurve, edgeRoute, edgePoints, insertBend, snap, CORNER_RADIUS } from '../../frontend/src/utils/topology.js'
const devices = [{ id: 'a', name: 'Router A', group: 'Garagem' }, { id: 'b', name: 'Router B', group: 'TI' }]

test('map migration starts empty and revision prevents concurrent overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-map-'))
  try {
    const repo = new TopologyRepository(join(dir, 'map.json'))
    assert.deepEqual(await repo.load(), { revision: 0, graph: { nodes: [], edges: [] } })
    const graph = initialGraph(devices)
    const results = await Promise.allSettled([repo.save({ revision: 0, graph }), repo.save({ revision: 0, graph })])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.ok(results.some(r => r.status === 'rejected' && r.reason instanceof TopologyConflict))
    assert.equal((await repo.load()).revision, 1)
    const saved = await repo.save({ revision: 1, graph: { ...graph, nodes: graph.nodes.map(n => ({ ...n, x: n.x + 125 })) } })
    assert.deepEqual(await new TopologyRepository(join(dir, 'map.json')).load(), saved)
    await writeFile(join(dir, 'map.json'), '{broken')
    await assert.rejects(repo.load())
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('map rejects dangling/duplicate/self edges, invalid coordinates and duplicate hosts', () => {
  const graph = initialGraph(devices)
  assert.ok(topologySchema.safeParse(graph).success)
  const edge = graph.edges[0]!
  for (const bad of [
    { ...graph, nodes: [...graph.nodes, graph.nodes[0]!] },
    { ...graph, nodes: [...graph.nodes, { ...graph.nodes.find(n => n.hostId)!, id: 'duplicate' }] },
    { ...graph, edges: [{ ...edge, target: 'missing' }] },
    { ...graph, edges: [{ ...edge, target: edge.source }] },
    { ...graph, edges: [edge, { ...edge, id: 'other', source: edge.target, target: edge.source }] },
    { ...graph, nodes: graph.nodes.map(n => ({ ...n, x: Infinity })) },
    { ...graph, nodes: graph.nodes.map(n => ({ ...n, y: 200001 })) },
  ]) assert.equal(topologySchema.safeParse(bad).success, false)
})

for (const zoom of [.15, .5, 1, 2.5]) for (const next of [.01, .3, 1.7, 8]) {
  test(`zoom anchor remains stable ${zoom} -> ${next}`, () => {
    const view = { x: -430, y: 209, zoom }, point = { x: 700, y: 230 }
    const before = worldPoint(point, view), afterView = zoomAt(view, next, point), after = worldPoint(point, afterView)
    assert.ok(Math.abs(before.x - after.x) < .00001)
    assert.ok(Math.abs(before.y - after.y) < .00001)
    assert.ok(afterView.zoom >= .15 && afterView.zoom <= 2.5)
  })
}

test('inventory updates preserve custom coordinates and notes; remove orphan edges', () => {
  const graph = initialGraph(devices)
  const device = graph.nodes.find(n => n.hostId === 'a')!
  device.x = -150; device.y = 293
  graph.nodes.push({ id: 'note', label: 'Firewall', x: 200, y: 300, color: 'pink' })
  const next = reconcileGraph(graph, [devices[0]!, { id: 'c', name: 'New host', group: 'TI' }])
  assert.equal(next.nodes.find(n => n.hostId === 'a')!.x, snap(-150))
  assert.equal(next.nodes.find(n => n.hostId === 'a')!.y, snap(293))
  assert.ok(next.nodes.some(n => n.id === 'note'))
  assert.ok(next.nodes.some(n => n.hostId === 'c'))
  assert.ok(!next.nodes.some(n => n.hostId === 'b'))
  assert.ok(topologySchema.safeParse(next).success)
  assert.deepEqual(reconcileGraph(next, [devices[0]!, { id: 'c', name: 'New host', group: 'TI' }]), next)
})

test('connecting supports cycles but rejects self, duplicate and missing nodes', () => {
  let graph = initialGraph(devices)
  graph = connectNodes(graph, 'host:a', 'host:b', 'custom')
  assert.equal(graph.edges.filter(e => e.id === 'custom').length, 1)
  assert.equal(connectNodes(graph, 'host:b', 'host:a', 'duplicate'), graph)
  assert.equal(connectNodes(graph, 'host:a', 'host:a', 'self'), graph)
  assert.equal(connectNodes(graph, 'host:a', 'missing', 'missing'), graph)
  assert.ok(topologySchema.safeParse(graph).success)
  for (const edge of graph.edges) assert.ok(!edgeCurve(graph.nodes.find(n => n.id === edge.source)!, graph.nodes.find(n => n.id === edge.target)!).path.includes('NaN'))
  const fit = fitNodes(graph.nodes, 1400, 800)
  assert.ok(Number.isFinite(fit.x) && Number.isFinite(fit.y))
})

test('legacy edges stay straight; inserted bends snap to grid with corners capped at ten', () => {
  const graph = initialGraph(devices)
  const source = graph.nodes.find(n => n.id === 'root')!
  const target = graph.nodes.find(n => n.id === 'sector:0')!
  const legacy = { id: 'legacy', source: source.id, target: target.id, label: '' }
  const straight = edgeRoute(source, target, legacy)
  assert.match(straight.path, /^M -?\d+ -?\d+ L -?\d+ -?\d+$/)
  assert.equal(straight.path.includes('Q'), false)
  const first = insertBend(legacy, source, target, { x: 234, y: 21 })
  assert.ok(first.bends && first.bends.length === 1)
  assert.equal(first.bends[0]!.x, snap(234))
  assert.equal(first.bends[0]!.y, snap(21))
  const curved = edgeRoute(source, target, first)
  assert.match(curved.path, / Q /)
  assert.ok(CORNER_RADIUS <= 10)
  const second = insertBend(first, source, target, { x: 280, y: 90 })
  assert.equal(second.bends?.length, 2)
  assert.equal(edgePoints(source, target, second).length, 4)
  assert.ok(topologySchema.safeParse({ ...graph, edges: [second] }).success)
  assert.equal(topologySchema.safeParse({ ...graph, edges: [{ ...second, bends: Array.from({ length: 25 }, (_, i) => ({ x: i * 24, y: 0 })) }] }).success, false)
  assert.equal(topologySchema.safeParse({ ...graph, edges: [{ ...second, bends: [{ x: Infinity, y: 0 }] }] }).success, false)
})

test('connections face nearby nodes vertically and preserve manually selected ports', () => {
  const source = { id: 'a', label: 'Router', x: 24, y: 24, color: 'blue' as const }
  const target = { id: 'b', label: 'Switch', x: 48, y: 360, color: 'blue' as const }
  assert.deepEqual(edgePoints(source, target, {}), [{ x: 132, y: 120 }, { x: 156, y: 360 }])
  assert.deepEqual(edgePoints(target, source, {}), [{ x: 156, y: 360 }, { x: 132, y: 120 }])
  const graph = connectNodes({ nodes: [source, target], edges: [] }, 'a', 'b', 'explicit', 'left', 'right')
  assert.deepEqual(edgePoints(source, target, graph.edges[0]!), [{ x: 24, y: 72 }, { x: 264, y: 408 }])
  assert.ok(topologySchema.safeParse(graph).success)
  assert.deepEqual(edgePoints({ ...source, x: 720 }, target, graph.edges[0]!), [{ x: 720, y: 72 }, { x: 264, y: 408 }])
  assert.equal(topologySchema.safeParse({ ...graph, edges: [{ ...graph.edges[0], sourceSide: 'diagonal' }] }).success, false)
  const bent = { ...graph.edges[0]!, sourceSide: undefined, targetSide: undefined, bends: [{ x: 1000, y: 72 }] }
  assert.deepEqual(edgePoints(source, target, bent)[0], { x: 240, y: 72 })
})

test('HTTP map save/load validates JSON, rejects foreign origin and stale revision', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-map-api-'))
  const app = express().use(express.json()).use('/api/topology', createTopologyRouter(new TopologyRepository(join(dir, 'map.json'))))
  const server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/topology`
  const send = (body: unknown, origin = 'http://localhost:5173') => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) })
  try {
    assert.equal((await fetch(url)).status, 200)
    assert.equal((await send({ revision: 0, graph: initialGraph(devices) })).status, 200)
    assert.equal((await send({ revision: 0, graph: initialGraph(devices) })).status, 409)
    assert.equal((await send({ revision: 1, graph: initialGraph(devices) }, 'https://other.example')).status, 403)
    assert.equal((await send({ revision: 1, graph: { nodes: [], edges: [{ id: 'a', source: 'a', target: 'b', label: '' }] } })).status, 400)
    assert.equal((await (await fetch(url)).json()).revision, 1)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }) }
})
