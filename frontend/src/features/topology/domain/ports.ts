import type { Graph, MapEdge, MapSide, MapNode } from '../../../types/topology'
import { nodeSize, snap, SNAP_STEP } from './nodes'
import { facingSide } from './routing'

/** Allocate separate anchors on each side; manual offsets stay exactly where chosen. */
export function resolvedEdges(graph: Graph): MapEdge[] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const endpoints = new Map<
    string,
    { edge: MapEdge; end: 'source' | 'target'; side: MapSide; order: number; offset?: number }[]
  >()
  for (const edge of graph.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target)
    if (!source || !target) continue
    for (const end of ['source', 'target'] as const) {
      const node = end === 'source' ? source : target,
        other = end === 'source' ? target : source
      const size = nodeSize(other)
      const toward = (end === 'source' ? edge.bends?.[0] : edge.bends?.at(-1)) ?? {
        x: other.x + size.width / 2,
        y: other.y + size.height / 2,
      }
      const side =
        (end === 'source' ? edge.sourceSide : edge.targetSide) ?? facingSide(node, toward)
      const key = `${node.id}:${side}`,
        members = endpoints.get(key) ?? []
      members.push({
        edge,
        end,
        side,
        order: side === 'top' || side === 'bottom' ? toward.x : toward.y,
        offset: end === 'source' ? edge.sourceOffset : edge.targetOffset,
      })
      endpoints.set(key, members)
    }
  }
  const copies = new Map(graph.edges.map((e) => [e.id, { ...e }]))
  for (const members of endpoints.values()) {
    members.sort((a, b) => a.order - b.order || a.edge.id.localeCompare(b.edge.id))
    const reserved = members.flatMap((m) => (m.offset === undefined ? [] : [m.offset]))
    const automatic = members.filter((m) => m.offset === undefined)
    const positions = automatic
      .map((_, i) => (i + 1) / (automatic.length + 1))
      .map((position) => {
        if (reserved.some((p) => Math.abs(p - position) < 0.025))
          position = availablePortOffset(reserved)
        reserved.push(position)
        return position
      })
      .sort((a, b) => a - b)
    let index = 0
    for (const member of members) {
      const copy = copies.get(member.edge.id)!
      copy[member.end === 'source' ? 'sourceSide' : 'targetSide'] = member.side
      copy[member.end === 'source' ? 'sourceOffset' : 'targetOffset'] =
        member.offset ?? positions[index++]!
    }
  }
  return [...copies.values()]
}
export function availablePortOffset(used: number[]): number {
  const points = [0, ...used, 1].sort((a, b) => a - b)
  let best = 0.5,
    gap = -1
  for (let i = 1; i < points.length; i++)
    if (points[i]! - points[i - 1]! > gap) {
      gap = points[i]! - points[i - 1]!
      best = (points[i]! + points[i - 1]!) / 2
    }
  return Math.max(0.05, Math.min(0.95, best))
}
export function nextPortOffset(edges: MapEdge[], nodeId: string, side: MapSide): number {
  return availablePortOffset(
    edges.flatMap((e) =>
      e.source === nodeId && e.sourceSide === side
        ? [e.sourceOffset ?? 0.5]
        : e.target === nodeId && e.targetSide === side
          ? [e.targetOffset ?? 0.5]
          : [],
    ),
  )
}

/** Cache free slots once per graph rather than scanning every edge for every + button. */
export function freePortOffsets(edges: MapEdge[]): Map<string, number> {
  const used = new Map<string, number[]>()
  for (const edge of edges)
    for (const end of ['source', 'target'] as const) {
      const side = edge[end === 'source' ? 'sourceSide' : 'targetSide']
      if (!side) continue
      const key = `${edge[end]}:${side}`,
        positions = used.get(key) ?? []
      positions.push(edge[end === 'source' ? 'sourceOffset' : 'targetOffset'] ?? 0.5)
      used.set(key, positions)
    }
  return new Map([...used].map(([key, positions]) => [key, availablePortOffset(positions)]))
}

/** Oferece vagas antes e depois dos pontos ocupados, respeitando o encaixe da borda. */
export function allFreePortChoices(edges: MapEdge[], nodes: MapNode[] = []): Map<string, number[]> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const used = new Map<string, Set<number>>()
  for (const edge of edges)
    for (const end of ['source', 'target'] as const) {
      const side = edge[end === 'source' ? 'sourceSide' : 'targetSide']
      if (!side) continue
      const key = `${edge[end]}:${side}`,
        values = used.get(key) ?? new Set<number>()
      const node = nodeMap.get(edge[end]),
        raw = edge[end === 'source' ? 'sourceOffset' : 'targetOffset'] ?? 0.5
      const size = node ? nodeSize(node) : null,
        span = size ? (side === 'top' || side === 'bottom' ? size.width : size.height) : 0
      values.add(
        span && !['cloud', 'ellipse', 'circle'].includes(node?.shape ?? '')
          ? Math.max(SNAP_STEP, Math.min(span - SNAP_STEP, snap(span * raw))) / span
          : raw,
      )
      used.set(key, values)
    }
  return new Map(
    [...used].map(([key, values]) => {
      const points = [0, ...values, 1].sort((a, b) => a - b)
      const [nodeId, side] = [
        key.slice(0, key.lastIndexOf(':')),
        key.slice(key.lastIndexOf(':') + 1),
      ]
      const node = nodeMap.get(nodeId),
        size = node ? nodeSize(node) : null,
        span = size ? (side === 'top' || side === 'bottom' ? size.width : size.height) : 0
      const offsets = points
        .slice(1)
        .flatMap((p, i) =>
          p - points[i]! >= (span ? (SNAP_STEP * 2) / span : 0.1) ? [(p + points[i]!) / 2] : [],
        )
        .map((p) =>
          span ? Math.max(SNAP_STEP, Math.min(span - SNAP_STEP, snap(span * p))) / span : p,
        )
        .filter((p) =>
          [...values].every((v) => Math.abs(p - v) >= (span ? SNAP_STEP / span - 1e-9 : 0.025)),
        )
      return [key, [...new Set(offsets)]]
    }),
  )
}
