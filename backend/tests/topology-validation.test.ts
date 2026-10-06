import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editableTopologyDocumentSchema, topologyDocumentSchema } from '../src/validation/topology.schema.js'
import { createTopologyRouter } from '../src/routes/topology.routes.js'
import { reconcileGraph } from '../../frontend/src/features/topology/domain/layout.js'
import { TopologyRepository } from '../src/repositories/topology.repository.js'

const graph = () => ({
  nodes: [
    { id: 'a', label: 'Servidor', subtitle: '', caption: '', x: 0, y: 0, color: 'blue' as const },
    { id: 'b', label: 'Roteador', x: 240, y: 0, color: 'neutral' as const },
  ],
  edges: [{ id: 'ab', source: 'a', target: 'b', label: '' }],
})

for (const field of ['label', 'subtitle', 'caption'] as const) {
  test(`invalid ${field} identifies the exact node field; legacy data remains readable`, () => {
    const g = graph()
    g.nodes[0]![field] = 'Equipamento 192.168.1.10'
    const document = { revision: 0, graph: g }
    assert.ok(topologyDocumentSchema.safeParse(document).success)
    const result = editableTopologyDocumentSchema.safeParse(document)
    assert.equal(result.success, false)
    if (!result.success) assert.deepEqual(result.error.issues[0]!.path, ['graph', 'nodes', 0, field])
  })
}

test('save returns all offending IDs and fields, masks no data in storage, and accepts corrections', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-validation-'))
  const repository = new TopologyRepository(join(dir, 'topology.json'))
  const app = express().use(express.json()).use('/api/topology', createTopologyRouter(repository))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/api/topology`
  try {
    const g = { ...graph(), nodes: graph().nodes.map((node, index) => index === 0 ? {
      ...node, subtitle: '10.10.3.233', texts: [{ id: 'note', kind: 'text' as const, text: '2001:db8::1' }],
    } : node) }
    g.edges[0]!.label = '192.168.0.1'
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, graph: g }) })
    assert.equal(response.status, 400)
    const body = await response.json() as { message: string; issues: { kind: string; elementId: string; field: string }[] }
    assert.deepEqual(body.issues.map(({ kind, elementId, field }) => ({ kind, elementId, field })), [
      { kind: 'node', elementId: 'a', field: 'subtitle' },
      { kind: 'node', elementId: 'a', field: 'texts.0.text' },
      { kind: 'edge', elementId: 'ab', field: 'label' },
    ])
    assert.ok(!JSON.stringify(body).includes('10.10.3.233'))
    assert.equal((await repository.load()).revision, 0)
    const corrected = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, graph: graph() }) })
    assert.equal(corrected.status, 200)
    assert.equal((await repository.load()).revision, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})


test('legacy hidden host fields are removed on save without relaxing visible text validation', () => {
  const g = graph()
  const node = { ...g.nodes[0]!, hostId: 'device', subtitle: '192.168.1.10', caption: '::1',
    texts: [{ id: 'note', kind: 'text' as const, text: 'Observação visível' }],
    fill: '#123456', shape: 'cloud' as const }
  const document = { revision: 4, graph: { ...g, nodes: [node, g.nodes[1]!] } }
  const result = editableTopologyDocumentSchema.parse(document)
  assert.equal(result.graph.nodes[0]!.subtitle, undefined)
  assert.equal(result.graph.nodes[0]!.caption, undefined)
  assert.equal(result.graph.nodes[0]!.fill, '#123456')
  assert.deepEqual(result.graph.edges, g.edges)
  assert.deepEqual(result.graph.nodes[0]!.texts, node.texts)
  assert.equal(node.subtitle, '192.168.1.10')
  for (const invalid of [
    { ...node, label: 'Servidor 10.0.0.1' },
    { ...node, texts: [{ id: 'note', kind: 'text' as const, text: '10.0.0.1' }] },
    { ...node, hostId: undefined },
  ]) assert.equal(editableTopologyDocumentSchema.safeParse({ ...document, graph: { ...g, nodes: [invalid, g.nodes[1]!] } }).success, false)
})

test('inventory reconciliation drops only hidden host fields while preserving topic subtitles and geometry', () => {
  const g = graph()
  const device = { ...g.nodes[0]!, hostId: 'device', subtitle: '192.168.1.10', caption: '::1' }
  const topic = { ...g.nodes[1]!, subtitle: 'Texto do tópico', caption: 'Legenda' }
  const result = reconcileGraph({ ...g, nodes: [device, topic] }, [{ id: 'device', name: 'Servidor', group: 'TI' }])
  assert.equal(result.nodes[0]!.subtitle, undefined)
  assert.equal(result.nodes[0]!.caption, undefined)
  assert.equal(result.nodes[1]!.subtitle, topic.subtitle)
  assert.equal(result.nodes[1]!.caption, topic.caption)
  assert.deepEqual(result.edges, g.edges)
  assert.equal(result.nodes[0]!.x, device.x)
  assert.equal(device.subtitle, '192.168.1.10')
})
