import type { Graph, MapEdge, MapNode, MapPoint, MapSide, Viewport } from '../types/topology'
export const GRID = 24, NODE_WIDTH = 216, NODE_HEIGHT = 96, CORNER_RADIUS = 10
export const uniqueId = () => `map-${Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')}`
export const clampCoordinate = (value: number) => Math.max(-200000, Math.min(200000, value))
export const snap = (value: number) => clampCoordinate(Math.round(value / GRID) * GRID)
export const snapPoint = (point: MapPoint): MapPoint => ({ x: snap(point.x), y: snap(point.y) })
export function nodeSize(node: MapNode) {
  const defaultSize = node.shape === 'circle' || node.shape === 'diamond' ? { width: 144, height: 144 }
    : node.shape === 'cloud' ? { width: 216, height: 144 } : node.shape === 'ellipse' ? { width: 216, height: 120 }
      : node.shape === 'pill' ? { width: 216, height: 72 } : { width: NODE_WIDTH, height: NODE_HEIGHT }
  const width = node.width ?? defaultSize.width
  const extra = node.texts?.filter(t => t.text) ?? []
  const multiline = [node.label, node.subtitle, node.caption].some(t => t?.includes('\n'))
  const columns = Math.max(8, Math.floor((width - (node.shape === 'cloud' ? 60 : 36)) / 8))
  const lines = (text: string) => text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0)
  const contentHeight = 40 + lines(node.label) * 20 + lines(node.subtitle ?? 'Tópico de organização') * 17 + lines(node.caption ?? 'Tópico') * 16
    + extra.reduce((height, text) => height + lines(text.text) * (text.kind === 'title' ? 20 : 18) + 8, 0)
  const automaticHeight = extra.length || multiline ? Math.min(576, Math.max(defaultSize.height, Math.ceil(contentHeight / GRID) * GRID)) : defaultSize.height
  return { width, height: node.height ?? automaticHeight }
}

/** Device names/status remain owned by monitoring, not by this visual document. */
export function reconcileGraph(graph: Graph, hosts: { id: string; name: string; group: string }[]): Graph {
  const hostIds = new Set(hosts.map(h => h.id))
  const nodes = graph.nodes.filter(n => !n.hostId || hostIds.has(n.hostId)).map(n => ({ ...n, x: snap(n.x), y: snap(n.y),
    label: n.hostId ? hosts.find(h => h.id === n.hostId)!.name : n.label }))
  const existing = new Set(nodes.flatMap(n => n.hostId ? [n.hostId] : []))
  const right = nodes.length ? Math.max(...nodes.map(n => n.x + nodeSize(n).width)) + 84 : 0
  const missing = hosts.filter(h => !existing.has(h.id))
  missing.forEach((host, index) => nodes.push({ id: `host:${host.id}`, hostId: host.id, label: host.name,
    x: snap(right + Math.floor(index / 8) * 312), y: snap((index % 8) * 144), color: 'neutral' }))
  const ids = new Set(nodes.map(n => n.id))
  return { ...graph, nodes, edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => e.bends?.length ? { ...e, bends: e.bends.map(snapPoint) } : e) }
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
  const w = Math.max(...nodes.map(n => n.x + nodeSize(n).width)) - minX
  const h = Math.max(...nodes.map(n => n.y + nodeSize(n).height)) - minY
  const zoom = Math.max(.15, Math.min(1.2, (width - 100) / w, (height - 100) / h))
  return { x: (width - w * zoom) / 2 - minX * zoom, y: (height - h * zoom) / 2 - minY * zoom, zoom }
}
export function connectNodes(graph: Graph, source: string, target: string, id: string, sourceSide?: MapSide, targetSide?: MapSide, sourceOffset?: number, targetOffset?: number): Graph {
  if (graph.edges.length >= 2000 || graph.edges.some(e => e.id === id) || source === target || !graph.nodes.some(n => n.id === source) || !graph.nodes.some(n => n.id === target)) return graph
  return { ...graph, edges: [...graph.edges, { id, source, target, label: '', ...(sourceSide && { sourceSide }), ...(targetSide && { targetSide }), ...(sourceOffset !== undefined && { sourceOffset }), ...(targetOffset !== undefined && { targetOffset }) }] }
}
export const CLOUD_VIEW_HEIGHT = 144
export const CLOUD_PATH = 'M 44 144 C 20 144 0 124 0 101 C 0 78 15 59 36 54 C 35 24 58 0 88 0 C 115 0 138 19 142 42 C 152 36 165 35 176 39 C 192 44 202 58 202 74 C 211 79 216 90 216 108 C 216 128 201 144 180 144 Z'
// Sample the shared SVG contour once, so cloud connection points follow its silhouette.
const cloudContour: MapPoint[] = (() => {
  const tokens = CLOUD_PATH.match(/[MCZ]|-?\d+(?:\.\d+)?/g)!, points: MapPoint[] = []
  let cursor = { x: 0, y: 0 }, i = 0
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'M') { cursor = { x: Number(tokens[i++]), y: Number(tokens[i++]) }; points.push(cursor) }
    else if (command === 'C') {
      const controls = Array.from({ length: 6 }, () => Number(tokens[i++]))
      const start = cursor
      for (let step = 1; step <= 32; step++) {
        const t = step / 32, u = 1 - t
        points.push({ x: u ** 3 * start.x + 3 * u * u * t * controls[0]! + 3 * u * t * t * controls[2]! + t ** 3 * controls[4]!,
          y: u ** 3 * start.y + 3 * u * u * t * controls[1]! + 3 * u * t * t * controls[3]! + t ** 3 * controls[5]! })
      }
      cursor = points.at(-1)!
    } else if (command === 'Z') points.push(points[0]!)
  }
  return points
})()
export function anchor(node: MapNode, side: MapSide, offset = .5): MapPoint {
  const { width, height } = nodeSize(node)
  const horizontal = side === 'top' || side === 'bottom'
  if (node.shape === 'ellipse' || node.shape === 'circle') {
    const factor = Math.sqrt(Math.max(0, 1 - (2 * offset - 1) ** 2))
    return horizontal ? { x: node.x + width * offset, y: node.y + height / 2 * (side === 'top' ? 1 - factor : 1 + factor) }
      : { x: node.x + width / 2 * (side === 'left' ? 1 - factor : 1 + factor), y: node.y + height * offset }
  }
  if (node.shape === 'cloud') {
    const axis = horizontal ? 'x' : 'y', other = horizontal ? 'y' : 'x', coordinate = offset * (horizontal ? 216 : CLOUD_VIEW_HEIGHT), hits: number[] = []
    for (let i = 1; i < cloudContour.length; i++) {
      const a = cloudContour[i - 1]!, b = cloudContour[i]!, span = b[axis] - a[axis]
      if (!span) continue
      const fraction = (coordinate - a[axis]) / span
      if (fraction >= 0 && fraction <= 1) hits.push(a[other] + fraction * (b[other] - a[other]))
    }
    if (hits.length) {
      const boundary = side === 'top' || side === 'left' ? Math.min(...hits) : Math.max(...hits)
      return horizontal ? { x: node.x + width * offset, y: node.y + height * boundary / CLOUD_VIEW_HEIGHT }
        : { x: node.x + width * boundary / 216, y: node.y + height * offset }
    }
  }
  switch (side) {
    case 'top': return { x: node.x + width * offset, y: node.y }
    case 'right': return { x: node.x + width, y: node.y + height * offset }
    case 'bottom': return { x: node.x + width * offset, y: node.y + height }
    case 'left': return { x: node.x, y: node.y + height * offset }
  }
}
/** Choose a facing surface using the direction to the next bend or node. */
export function facingSide(from: MapNode, toward: MapPoint): MapSide {
  const { width, height } = nodeSize(from)
  const dx = toward.x - (from.x + width / 2), dy = toward.y - (from.y + height / 2)
  const scaledX = Math.abs(dx) / width, scaledY = Math.abs(dy) / height
  return scaledX >= scaledY ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top'
}
export function edgePoints(source: MapNode, target: MapNode, edge: Pick<MapEdge, 'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'>): MapPoint[] {
  const sourceSize = nodeSize(source), targetSize = nodeSize(target)
  const sourceCenter = { x: source.x + sourceSize.width / 2, y: source.y + sourceSize.height / 2 }
  const targetCenter = { x: target.x + targetSize.width / 2, y: target.y + targetSize.height / 2 }
  const bends = edge.bends ?? []
  const sourceSide = edge.sourceSide ?? facingSide(source, bends[0] ?? targetCenter)
  const targetSide = edge.targetSide ?? facingSide(target, bends.at(-1) ?? sourceCenter)
  return [anchor(source, sourceSide, edge.sourceOffset), ...bends, anchor(target, targetSide, edge.targetOffset)]
}
/** Segments are straight. Only explicitly inserted corners get a small radius. */
export function edgeRoute(source: MapNode, target: MapNode, edge: Pick<MapEdge, 'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'>) {
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

export function insertBend(edge: MapEdge, source: MapNode, target: MapNode, raw: MapPoint, geometry: Pick<MapEdge, 'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'> = edge): MapEdge {
  if ((edge.bends?.length ?? 0) >= 24) return edge
  const point = snapPoint(raw)
  const points = edgePoints(source, target, geometry)
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

/** Translate the group by one grid delta; internal routes keep their geometry. */
export function translateSelection(graph: Graph, ids: string[], dx: number, dy: number): Graph {
  const selected = new Set(ids), moving = graph.nodes.filter(n => selected.has(n.id))
  if (!moving.length) return graph
  const limit = (delta: number, values: number[]) => Math.max(-200000 - Math.min(...values), Math.min(200000 - Math.max(...values), snap(delta)))
  const bends = graph.edges.filter(e => selected.has(e.source) && selected.has(e.target)).flatMap(e => e.bends ?? [])
  const x = limit(dx, [...moving, ...bends].map(n => n.x)), y = limit(dy, [...moving, ...bends].map(n => n.y))
  return { ...graph, nodes: graph.nodes.map(n => selected.has(n.id) ? { ...n, x: n.x + x, y: n.y + y } : n),
    edges: graph.edges.map(e => selected.has(e.source) && selected.has(e.target) ? { ...e, bends: e.bends?.map(p => ({ x: p.x + x, y: p.y + y })) } : e) }
}
export function rectangleSelection(nodes: MapNode[], start: MapPoint, end: MapPoint): string[] {
  const left = Math.min(start.x, end.x), top = Math.min(start.y, end.y), right = Math.max(start.x, end.x), bottom = Math.max(start.y, end.y)
  return nodes.filter(n => { const size = nodeSize(n); return n.x <= right && n.x + size.width >= left && n.y <= bottom && n.y + size.height >= top }).map(n => n.id)
}
export function selectionFragment(graph: Graph, ids: string[]): Graph {
  const selected = new Set(ids)
  return structuredClone({ nodes: graph.nodes.filter(n => selected.has(n.id)), edges: graph.edges.filter(e => selected.has(e.source) && selected.has(e.target)) })
}
/** Copies are templates until explicitly registered as a new monitored device. */
export function cloneFragment(fragment: Graph, offset: number, nextId = uniqueId): Graph {
  const ids = new Map(fragment.nodes.map(n => [n.id, nextId()]))
  const copy = translateSelection(structuredClone(fragment), fragment.nodes.map(n => n.id), offset, offset)
  return { nodes: copy.nodes.map(n => ({ ...n, id: ids.get(n.id)!, hostId: undefined })),
    edges: copy.edges.map(e => ({ ...e, id: nextId(), source: ids.get(e.source)!, target: ids.get(e.target)! })) }
}
export function branchSelection(graph: Graph, roots: string[]): string[] {
  const ids = new Set(roots)
  for (let changed = true; changed;) { changed = false; for (const edge of graph.edges) if (ids.has(edge.source) && !ids.has(edge.target)) { ids.add(edge.target); changed = true } }
  return [...ids]
}

/** Allocate separate anchors on each side; manual offsets stay exactly where chosen. */
export function resolvedEdges(graph: Graph): MapEdge[] {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]))
  const endpoints = new Map<string, { edge: MapEdge; end: 'source' | 'target'; side: MapSide; order: number; offset?: number }[]>()
  for (const edge of graph.edges) {
    const source = nodes.get(edge.source), target = nodes.get(edge.target)
    if (!source || !target) continue
    for (const end of ['source', 'target'] as const) {
      const node = end === 'source' ? source : target, other = end === 'source' ? target : source
      const size = nodeSize(other)
      const toward = (end === 'source' ? edge.bends?.[0] : edge.bends?.at(-1)) ?? { x: other.x + size.width / 2, y: other.y + size.height / 2 }
      const side = (end === 'source' ? edge.sourceSide : edge.targetSide) ?? facingSide(node, toward)
      const key = `${node.id}:${side}`, members = endpoints.get(key) ?? []
      members.push({ edge, end, side, order: side === 'top' || side === 'bottom' ? toward.x : toward.y, offset: end === 'source' ? edge.sourceOffset : edge.targetOffset })
      endpoints.set(key, members)
    }
  }
  const copies = new Map(graph.edges.map(e => [e.id, { ...e }]))
  for (const members of endpoints.values()) {
    members.sort((a, b) => a.order - b.order || a.edge.id.localeCompare(b.edge.id))
    const reserved = members.flatMap(m => m.offset === undefined ? [] : [m.offset])
    const automatic = members.filter(m => m.offset === undefined)
    const positions = automatic.map((_, i) => (i + 1) / (automatic.length + 1)).map(position => {
      if (reserved.some(p => Math.abs(p - position) < .025)) position = availablePortOffset(reserved)
      reserved.push(position); return position
    }).sort((a, b) => a - b)
    let index = 0
    for (const member of members) {
      const copy = copies.get(member.edge.id)!
      copy[member.end === 'source' ? 'sourceSide' : 'targetSide'] = member.side
      copy[member.end === 'source' ? 'sourceOffset' : 'targetOffset'] = member.offset ?? positions[index++]!
    }
  }
  return [...copies.values()]
}
export function availablePortOffset(used: number[]): number {
  const points = [0, ...used, 1].sort((a, b) => a - b)
  let best = .5, gap = -1
  for (let i = 1; i < points.length; i++) if (points[i]! - points[i - 1]! > gap) { gap = points[i]! - points[i - 1]!; best = (points[i]! + points[i - 1]!) / 2 }
  return Math.max(.05, Math.min(.95, best))
}
export function nextPortOffset(edges: MapEdge[], nodeId: string, side: MapSide): number {
  return availablePortOffset(edges.flatMap(e => e.source === nodeId && e.sourceSide === side ? [e.sourceOffset ?? .5] : e.target === nodeId && e.targetSide === side ? [e.targetOffset ?? .5] : []))
}

/** Cache free slots once per graph rather than scanning every edge for every + button. */
export function freePortOffsets(edges: MapEdge[]): Map<string, number> {
  const used = new Map<string, number[]>()
  for (const edge of edges) for (const end of ['source', 'target'] as const) {
    const side = edge[end === 'source' ? 'sourceSide' : 'targetSide']
    if (!side) continue
    const key = `${edge[end]}:${side}`, positions = used.get(key) ?? []
    positions.push(edge[end === 'source' ? 'sourceOffset' : 'targetOffset'] ?? .5); used.set(key, positions)
  }
  return new Map([...used].map(([key, positions]) => [key, availablePortOffset(positions)]))
}
