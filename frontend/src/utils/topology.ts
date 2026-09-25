import type { Graph, MapEdge, MapNode, MapPoint, Viewport } from '../types/topology'
export const GRID = 24, NODE_WIDTH = 216, NODE_HEIGHT = 96, CORNER_RADIUS = 10
export const uniqueId = () => `map-${Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')}`
export const clampCoordinate = (value: number) => Math.max(-200000, Math.min(200000, value))
export const snap = (value: number) => clampCoordinate(Math.round(value / GRID) * GRID)
export const snapPoint = (point: MapPoint): MapPoint => ({ x: snap(point.x), y: snap(point.y) })

/** Device names/status remain owned by monitoring, not by this visual document. */
export function reconcileGraph(graph: Graph, hosts: { id: string; name: string; group: string }[]): Graph {
  const hostIds = new Set(hosts.map(h => h.id))
  const nodes = graph.nodes.filter(n => !n.hostId || hostIds.has(n.hostId)).map(n => ({ ...n, x: snap(n.x), y: snap(n.y),
    label: n.hostId ? hosts.find(h => h.id === n.hostId)!.name : n.label }))
  const existing = new Set(nodes.flatMap(n => n.hostId ? [n.hostId] : []))
  const right = nodes.length ? Math.max(...nodes.map(n => n.x)) + 300 : 0
  const missing = hosts.filter(h => !existing.has(h.id))
  missing.forEach((host, index) => nodes.push({ id: `host:${host.id}`, hostId: host.id, label: host.name,
    x: snap(right + Math.floor(index / 8) * 312), y: snap((index % 8) * 144), color: 'neutral' }))
  const ids = new Set(nodes.map(n => n.id))
  return { nodes, edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => e.bends?.length ? { ...e, bends: e.bends.map(snapPoint) } : e) }
}

/** A starting organizational diagram; these edges never claim physical discovery. */
export function initialGraph(hosts: { id: string; name: string; group: string }[]): Graph {
  if (!hosts.length) return { nodes: [], edges: [] }
  const graph: Graph = { nodes: [{ id: 'root', label: 'Minha rede', x: 0, y: 0, color: 'blue' }], edges: [] }
  const groups = [...new Set(hosts.map(h => h.group))].sort()
  let row = 0
  groups.forEach((group, index) => {
    const members = hosts.filter(h => h.group === group)
    const id = `sector:${index}`, y = snap(row * 144 + (members.length - 1) * 72)
    graph.nodes.push({ id, label: group, x: 336, y, color: 'purple' })
    graph.edges.push({ id: `root:${index}`, source: 'root', target: id, label: '' })
    members.forEach((host, i) => {
      const nodeId = `host:${host.id}`
      graph.nodes.push({ id: nodeId, hostId: host.id, label: host.name, x: 696, y: (row + i) * 144, color: 'neutral' })
      graph.edges.push({ id: `member:${host.id}`, source: id, target: nodeId, label: '' })
    })
    row += members.length + 1
  })
  graph.nodes[0]!.y = snap(Math.max(0, (row - 2) * 72))
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
export function edgePoints(source: MapNode, target: MapNode, edge: Pick<MapEdge, 'bends'>): MapPoint[] {
  const forward = target.x >= source.x
  const x1 = source.x + (forward ? NODE_WIDTH : 0), y1 = source.y + NODE_HEIGHT / 2
  const x2 = target.x + (forward ? 0 : NODE_WIDTH), y2 = target.y + NODE_HEIGHT / 2
  return [{ x: x1, y: y1 }, ...(edge.bends ?? []), { x: x2, y: y2 }]
}
/** Segments are straight. Only explicitly inserted corners get a small radius. */
export function edgeRoute(source: MapNode, target: MapNode, edge: Pick<MapEdge, 'bends'>) {
  const points = edgePoints(source, target, edge)
  let path = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!, corner = points[i]!, after = points[i + 1]!
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y)
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y)
    const radius = Math.min(CORNER_RADIUS, incoming / 2, outgoing / 2)
    if (!radius) { path += ` L ${corner.x} ${corner.y}`; continue }
    const start = { x: corner.x - (corner.x - before.x) * radius / incoming, y: corner.y - (corner.y - before.y) * radius / incoming }
    const end = { x: corner.x + (after.x - corner.x) * radius / outgoing, y: corner.y + (after.y - corner.y) * radius / outgoing }
    path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`
  }
  path += ` L ${points.at(-1)!.x} ${points.at(-1)!.y}`
  const distances = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y))
  let remaining = distances.reduce((sum, length) => sum + length, 0) / 2
  for (let i = 0; i < distances.length; i++) {
    const length = distances[i]!
    if (remaining <= length || i === distances.length - 1) {
      const fraction = length ? remaining / length : 0
      return { path, x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * fraction, y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * fraction }
    }
    remaining -= length
  }
  return { path, x: points[0]!.x, y: points[0]!.y }
}
export function edgeCurve(source: MapNode, target: MapNode) { return edgeRoute(source, target, { bends: [] }) }

export function insertBend(edge: MapEdge, source: MapNode, target: MapNode, raw: MapPoint): MapEdge {
  if ((edge.bends?.length ?? 0) >= 24) return edge
  const point = snapPoint(raw)
  const points = edgePoints(source, target, edge)
  let segment = 0, distance = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared)) : 0
    const d = (point.x - a.x - t * (b.x - a.x)) ** 2 + (point.y - a.y - t * (b.y - a.y)) ** 2
    if (d < distance) { distance = d; segment = i }
  }
  const bends = [...edge.bends ?? []]
  bends.splice(segment, 0, point)
  return { ...edge, bends }
}
