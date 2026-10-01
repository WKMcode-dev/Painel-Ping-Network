import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import express from 'express'
import { TopologyRepository, TopologyConflict, topologySchema } from '../src/repositories/topology.repository.js'
import { createTopologyRouter } from '../src/routes/topology.routes.js'
import { initialGraph, reconcileGraph, connectNodes, zoomAt, worldPoint, fitNodes, edgeCurve, edgeRoute, edgePoints, insertBend, nodeSize, snap, CORNER_RADIUS } from '../../frontend/src/utils/topology.js'
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
    { ...graph, edges: [edge, { ...edge, source: edge.target, target: edge.source }] },
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

test('connecting supports cycles and parallel links but rejects self, duplicate IDs and missing nodes', () => {
  let graph = initialGraph(devices)
  graph = connectNodes(graph, 'host:a', 'host:b', 'custom')
  assert.equal(graph.edges.filter(e => e.id === 'custom').length, 1)
  assert.equal(connectNodes(graph, 'host:b', 'host:a', 'custom'), graph)
  assert.equal(connectNodes(graph, 'host:b', 'host:a', 'parallel').edges.length, graph.edges.length + 1)
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

test('variable map shapes and colors persist with anchors matching their dimensions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-map-appearance-'))
  try {
    const repo = new TopologyRepository(join(dir, 'map.json'))
    const nodes = [
      { id: 'site', label: 'Taguatinga', x: 24, y: 24, color: 'orange' as const, shape: 'circle' as const, width: 192, height: 192, fill: '#e36100', textColor: '#ffffff' },
      { id: 'router', label: 'Firewall', x: 360, y: 48, color: 'blue' as const, shape: 'rectangle' as const, width: 240, height: 120, outline: '#003399' },
    ]
    const edge = { id: 'fiber', source: 'site', target: 'router', label: 'Fibra', stroke: '#c64449', labelColor: '#243d81', lineWidth: 4, lineStyle: 'dashed' as const }
    const graph = { nodes, edges: [edge], appearance: { background: '#fefefe', gridColor: '#cccccc', showGrid: false } }
    const saved = await repo.save({ revision: 0, graph })
    assert.deepEqual((await repo.load()).graph, saved.graph)
    assert.deepEqual(nodeSize(nodes[0]), { width: 192, height: 192 })
    assert.deepEqual(edgePoints(nodes[0]!, nodes[1]!, edge)[0], { x: 216, y: 120 })
    assert.ok(fitNodes(nodes, 1000, 700).zoom > 0)
    for (const bad of [
      { ...nodes[0], fill: 'red' }, { ...nodes[0], shape: 'hexagon' },
      { ...nodes[0], width: 700 }, { ...nodes[0], height: -10 },
    ]) assert.equal(topologySchema.safeParse({ ...graph, nodes: [bad, nodes[1]] }).success, false)
    assert.equal(topologySchema.safeParse({ ...graph, edges: [{ ...edge, stroke: 'javascript:red' }] }).success, false)
    assert.equal(topologySchema.safeParse({ ...graph, appearance: { gridColor: 'invalid' } }).success, false)
  } finally { await rm(dir, { recursive: true, force: true }) }
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

test('group translation preserves internal bends, styles and appearance, leaving external bends fixed', async () => {
  const { translateSelection } = await import('../../frontend/src/utils/topology.js')
  const graph = initialGraph(devices)
  graph.appearance = { background: '#123456', gridColor: '#abcdef', showGrid: false }
  graph.edges[0]!.bends = [{ x: 240, y: 24 }, { x: 288, y: 72 }]
  graph.edges[1]!.bends = [{ x: 600, y: 144 }]
  const edge = graph.edges[0]!, ids = [edge.source, edge.target]
  const moved = translateSelection(graph, ids, 50, -30)
  assert.deepEqual(moved.edges[0]!.bends, [{ x: 288, y: 0 }, { x: 336, y: 48 }])
  assert.deepEqual(moved.edges[1]!.bends, graph.edges[1]!.bends)
  assert.deepEqual(moved.appearance, graph.appearance)
  assert.deepEqual(reconcileGraph(moved, devices).appearance, graph.appearance)
  assert.deepEqual(graph.edges[0]!.bends, [{ x: 240, y: 24 }, { x: 288, y: 72 }])
  const oldRoute = edgePoints(graph.nodes.find(n => n.id === edge.source)!, graph.nodes.find(n => n.id === edge.target)!, edge)
  const newRoute = edgePoints(moved.nodes.find(n => n.id === edge.source)!, moved.nodes.find(n => n.id === edge.target)!, moved.edges[0]!)
  assert.deepEqual(newRoute, oldRoute.map(p => ({ x: p.x + 48, y: p.y - 24 })))
})

test('marquee selection works in all directions and respects node dimensions', async () => {
  const { rectangleSelection } = await import('../../frontend/src/utils/topology.js')
  const nodes = [{ id: 'x', label: 'X', x: 24, y: 24, width: 288, height: 120, color: 'blue' as const }, { id: 'y', label: 'Y', x: 600, y: 600, color: 'blue' as const }]
  for (const [a, b] of [[{ x: 280, y: 100 }, { x: 400, y: 200 }], [{ x: 400, y: 200 }, { x: 280, y: 100 }]]) assert.deepEqual(rectangleSelection(nodes, a!, b!), ['x'])
  assert.deepEqual(rectangleSelection(nodes, { x: 400, y: 300 }, { x: 500, y: 500 }), [])
})

test('copy and duplicate preserve subtree geometry and generate independent templates', async () => {
  const { selectionFragment, cloneFragment, branchSelection } = await import('../../frontend/src/utils/topology.js')
  const graph = initialGraph(devices)
  graph.nodes[0]!.subtitle = ''; graph.nodes[0]!.caption = 'Organização'; graph.nodes[0]!.shape = 'ellipse'
  graph.edges[0]!.bends = [{ x: 240, y: 24 }]; graph.edges[0]!.stroke = '#123456'
  const ids = branchSelection(graph, ['root'])
  assert.equal(ids.length, graph.nodes.length)
  const fragment = selectionFragment(graph, ids)
  let index = 0
  const copy = cloneFragment(fragment, 48, () => `copy-${index++}`)
  assert.ok(copy.nodes.every(n => !n.hostId && !ids.includes(n.id)))
  assert.equal(copy.nodes[0]!.shape, 'ellipse')
  assert.equal(copy.nodes[0]!.subtitle, '')
  assert.equal(copy.nodes[0]!.caption, 'Organização')
  assert.deepEqual(copy.edges[0]!.bends, [{ x: 288, y: 72 }])
  assert.equal(copy.edges[0]!.stroke, '#123456')
  assert.ok(topologySchema.safeParse({ nodes: [...graph.nodes, ...copy.nodes], edges: [...graph.edges, ...copy.edges] }).success)
  copy.edges[0]!.bends![0]!.x = 999
  assert.equal(graph.edges[0]!.bends![0]!.x, 240)
  assert.equal(fragment.edges[0]!.bends![0]!.x, 240)
  assert.equal(selectionFragment(graph, ['root']).edges.length, 0)
  assert.equal(topologySchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0]!, caption: 'a'.repeat(2001) }] }).success, false)
})

test('multiple links use separate anchors and can form parallel vertical paths', async () => {
  const { resolvedEdges, nextPortOffset } = await import('../../frontend/src/utils/topology.js')
  let graph = { nodes: [{ id: 'a', label: 'A', x: 0, y: 0, color: 'blue' as const }, { id: 'b', label: 'B', x: 0, y: 240, color: 'blue' as const }], edges: [] as import('../../frontend/src/types/topology.js').MapEdge[] }
  graph = connectNodes(graph, 'a', 'b', 'one', 'bottom', 'top')
  graph = connectNodes(graph, 'a', 'b', 'two', 'bottom', 'top')
  const routed = resolvedEdges(graph)
  assert.equal(routed[0]!.sourceOffset, 1 / 3)
  assert.equal(routed[1]!.sourceOffset, 2 / 3)
  assert.ok(topologySchema.safeParse(graph).success)
  for (const edge of routed) {
    const points = edgePoints(graph.nodes[0]!, graph.nodes[1]!, edge)
    assert.equal(points[0]!.x, points[1]!.x)
    assert.equal(points[0]!.y, 96)
    assert.equal(points[1]!.y, 240)
  }
  const offset = nextPortOffset(routed, 'a', 'bottom')
  assert.ok(routed.every(e => Math.abs(e.sourceOffset! - offset) > .01))
  assert.equal(graph.edges[0]!.sourceOffset, undefined, 'routing must not turn automatic anchors into saved manual values')
})

test('manual anchor positions stay fixed, automatic anchors avoid them, and bends still work', async () => {
  const { resolvedEdges, translateSelection } = await import('../../frontend/src/utils/topology.js')
  const nodes = [{ id: 'a', label: 'A', x: 0, y: 0, color: 'blue' as const }, { id: 'b', label: 'B', x: 0, y: 240, color: 'blue' as const }]
  const graph = { nodes, edges: [
    { id: 'one', source: 'a', target: 'b', label: '', sourceSide: 'bottom' as const, targetSide: 'top' as const, sourceOffset: .5, targetOffset: .5, bends: [{ x: 120, y: 168 }] },
    { id: 'two', source: 'a', target: 'b', label: '', sourceSide: 'bottom' as const, targetSide: 'top' as const },
  ] }
  const routed = resolvedEdges(graph)
  assert.equal(routed[0]!.sourceOffset, .5)
  assert.notEqual(routed[1]!.sourceOffset, .5)
  assert.ok(!edgeRoute(nodes[0]!, nodes[1]!, routed[0]!).path.includes('NaN'))
  const moved = translateSelection(graph, ['a', 'b'], 48, 24), after = resolvedEdges(moved)
  for (let i = 0; i < routed.length; i++) assert.deepEqual(edgePoints(moved.nodes[0]!, moved.nodes[1]!, after[i]!), edgePoints(nodes[0]!, nodes[1]!, routed[i]!).map(p => ({ x: p.x + 48, y: p.y + 24 })))
})

test('anchors are allocated independently on all four sides including automatic facing', async () => {
  const { resolvedEdges } = await import('../../frontend/src/utils/topology.js')
  const root = { id: 'root', label: 'Root', x: 0, y: 0, color: 'blue' as const }
  const nodes = [root, ...(['top', 'right', 'bottom', 'left'] as const).flatMap((side, index) => [0, 1].map(i => ({ ...root, id: `${side}-${i}`, x: index === 1 ? 500 : index === 3 ? -500 : i * 24, y: index === 0 ? -500 : index === 2 ? 500 : i * 24 })))]
  const edges = nodes.slice(1).map(n => ({ id: n.id, source: 'root', target: n.id, label: '' }))
  const routed = resolvedEdges({ nodes, edges })
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const members = routed.filter(e => e.sourceSide === side)
    assert.equal(members.length, 2)
    assert.equal(new Set(members.map(e => e.sourceOffset)).size, 2)
  }
})

test('multiline blocks, alignment and anchors persist across reload without losing legacy fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-texts-'))
  try {
    const graph = initialGraph(devices)
    graph.nodes[0] = { ...graph.nodes[0]!, label: 'Minha rede\nPrincipal', subtitle: 'Linha 1\nLinha 2', caption: '', textAlign: 'right', texts: [
      { id: 'title', kind: 'title', text: 'Título adicional\nOutra linha', align: 'center' }, { id: 'notes', kind: 'text', text: 'Observações\nEndereços de rede' },
    ] } as import('../../frontend/src/types/topology.js').MapNode
    graph.edges[0]!.sourceOffset = .25
    const repository = new TopologyRepository(join(dir, 'map.json'))
    const saved = await repository.save({ revision: 0, graph })
    assert.deepEqual(await new TopologyRepository(join(dir, 'map.json')).load(), saved)
    assert.ok(nodeSize(graph.nodes[0]!).height > 96)
    assert.equal(nodeSize({ ...graph.nodes[0]!, height: 120 }).height, 120)
    const badText = { ...graph.nodes[0]!, texts: [{ id: 'x', kind: 'text', text: 'a'.repeat(4001) }] }
    assert.equal(topologySchema.safeParse({ ...graph, nodes: [badText] }).success, false)
    assert.equal(topologySchema.safeParse({ ...graph, edges: [{ ...graph.edges[0]!, sourceOffset: 1.1 }] }).success, false)
    assert.equal(topologySchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0]!, textAlign: 'justify' }] }).success, false)
    const duplicateBlocks = [{ id: 'same', kind: 'text', text: 'A' }, { id: 'same', kind: 'text', text: 'B' }]
    assert.equal(topologySchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0]!, texts: duplicateBlocks }] }).success, false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('distributed anchors follow ellipse and cloud contours rather than their rectangular bounds', async () => {
  const { anchor } = await import('../../frontend/src/utils/topology.js')
  const node = { id: 'shape', label: 'Shape', x: 48, y: 24, color: 'blue' as const, width: 216, height: 120 }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) for (const offset of [.1, .25, .5, .75, .9]) {
    const ellipse = anchor({ ...node, shape: 'ellipse' }, side, offset)
    const normalized = ((ellipse.x - (48 + 108)) / 108) ** 2 + ((ellipse.y - (24 + 60)) / 60) ** 2
    assert.ok(Math.abs(normalized - 1) < .000001)
    const cloud = anchor({ ...node, shape: 'cloud' }, side, offset)
    assert.ok(Number.isFinite(cloud.x) && Number.isFinite(cloud.y))
    assert.ok(cloud.x >= node.x - 1 && cloud.x <= node.x + 217)
    assert.ok(cloud.y >= node.y - 1 && cloud.y <= node.y + 121)
  }
  assert.ok(anchor({ ...node, shape: 'cloud' }, 'top', .25).y > node.y + 5)
})
