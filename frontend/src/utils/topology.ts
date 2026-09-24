import type { Graph, MapNode, Viewport } from '../types/topology'
export const NODE_WIDTH = 224, NODE_HEIGHT = 100
export const uniqueId = () => `map-${Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')}`
export const clampCoordinate = (value: number) => Math.max(-200000, Math.min(200000, value))

/** Device names/status remain owned by monitoring, not by this visual document. */
export function reconcileGraph(graph: Graph, hosts: { id: string; name: string; group: string }[]): Graph {
  const hostIds = new Set(hosts.map(h => h.id))
  const nodes = graph.nodes.filter(n => !n.hostId || hostIds.has(n.hostId)).map(n => n.hostId ? { ...n, label: hosts.find(h => h.id === n.hostId)!.name } : n)
  const existing = new Set(nodes.flatMap(n => n.hostId ? [n.hostId] : []))
  const right = nodes.length ? Math.max(...nodes.map(n => n.x)) + 300 : 0
  const missing = hosts.filter(h => !existing.has(h.id))
  missing.forEach((host, index) => nodes.push({ id: `host:${host.id}`, hostId: host.id, label: host.name,
    x: right + Math.floor(index / 8) * 300, y: (index % 8) * 140, color: 'neutral' }))
  const ids = new Set(nodes.map(n => n.id))
  return { nodes, edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)) }
}

/** A starting organizational diagram; these edges never claim physical discovery. */
export function initialGraph(hosts: { id: string; name: string; group: string }[]): Graph {
  if (!hosts.length) return { nodes: [], edges: [] }
  const graph: Graph = { nodes: [{ id: 'root', label: 'Minha rede', x: 0, y: 0, color: 'blue' }], edges: [] }
  const groups = [...new Set(hosts.map(h => h.group))].sort()
  let row = 0
  groups.forEach((group, index) => {
    const members = hosts.filter(h => h.group === group)
    const id = `sector:${index}`, y = row * 140 + (members.length - 1) * 70
    graph.nodes.push({ id, label: group, x: 340, y, color: 'purple' })
    graph.edges.push({ id: `root:${index}`, source: 'root', target: id, label: '' })
    members.forEach((host, i) => {
      const nodeId = `host:${host.id}`
      graph.nodes.push({ id: nodeId, hostId: host.id, label: host.name, x: 700, y: (row + i) * 140, color: 'neutral' })
      graph.edges.push({ id: `member:${host.id}`, source: id, target: nodeId, label: '' })
    })
    row += members.length + 1
  })
  graph.nodes[0]!.y = Math.max(0, (row - 2) * 70)
  return graph
}
export function worldPoint(client: { x: number; y: number }, view: Viewport) {
  return { x: (client.x - view.x) / view.zoom, y: (client.y - view.y) / view.zoom }
}
export function zoomAt(view: Viewport, zoom: number, point: { x: number; y: number }): Viewport {
  const z = Math.max(.15, Math.min(2.5, zoom)), world = worldPoint(point, view)
  return { x: point.x - world.x * z, y: point.y - world.y * z, zoom: z }
}
export function fitNodes(nodes: MapNode[], width: number, height: number): Viewport {
  if (!nodes.length) return { x: 40, y: 40, zoom: 1 }
  const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y))
  const w = Math.max(...nodes.map(n => n.x)) + NODE_WIDTH - minX
  const h = Math.max(...nodes.map(n => n.y)) + NODE_HEIGHT - minY
  const zoom = Math.max(.15, Math.min(1.2, (width - 100) / w, (height - 100) / h))
  return { x: (width - w * zoom) / 2 - minX * zoom, y: (height - h * zoom) / 2 - minY * zoom, zoom }
}
export function connectNodes(graph: Graph, source: string, target: string, id: string): Graph {
  if (graph.edges.length >= 2000 || source === target || !graph.nodes.some(n => n.id === source) || !graph.nodes.some(n => n.id === target)
    || graph.edges.some(e => (e.source === source && e.target === target) || (e.target === source && e.source === target))) return graph
  return { ...graph, edges: [...graph.edges, { id, source, target, label: '' }] }
}
export function edgeCurve(source: MapNode, target: MapNode) {
  const forward = target.x >= source.x
  const x1 = source.x + (forward ? NODE_WIDTH : 0), y1 = source.y + NODE_HEIGHT / 2
  const x2 = target.x + (forward ? 0 : NODE_WIDTH), y2 = target.y + NODE_HEIGHT / 2
  const bend = Math.max(70, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1)
  return { path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}
