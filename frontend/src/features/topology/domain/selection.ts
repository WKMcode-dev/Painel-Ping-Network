import type { Graph, MapNode, MapPoint } from '../../../types/topology'
import { nodeSize, snap, uniqueId } from './nodes'

/** Translate the group by one grid delta; internal routes keep their geometry. */
export function translateSelection(graph: Graph, ids: string[], dx: number, dy: number): Graph {
  const selected = new Set(ids),
    moving = graph.nodes.filter((n) => selected.has(n.id))
  if (!moving.length) return graph
  const limit = (delta: number, values: number[]) =>
    Math.max(-200000 - Math.min(...values), Math.min(200000 - Math.max(...values), snap(delta)))
  const bends = graph.edges
    .filter((e) => selected.has(e.source) && selected.has(e.target))
    .flatMap((e) => e.bends ?? [])
  const x = limit(
      dx,
      [...moving, ...bends].map((n) => n.x),
    ),
    y = limit(
      dy,
      [...moving, ...bends].map((n) => n.y),
    )
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (selected.has(n.id) ? { ...n, x: n.x + x, y: n.y + y } : n)),
    edges: graph.edges.map((e) =>
      selected.has(e.source) && selected.has(e.target)
        ? { ...e, bends: e.bends?.map((p) => ({ x: p.x + x, y: p.y + y })) }
        : e,
    ),
  }
}
export function rectangleSelection(nodes: MapNode[], start: MapPoint, end: MapPoint): string[] {
  const left = Math.min(start.x, end.x),
    top = Math.min(start.y, end.y),
    right = Math.max(start.x, end.x),
    bottom = Math.max(start.y, end.y)
  return nodes
    .filter((n) => {
      const size = nodeSize(n)
      return n.x <= right && n.x + size.width >= left && n.y <= bottom && n.y + size.height >= top
    })
    .map((n) => n.id)
}
export function selectionFragment(graph: Graph, ids: string[]): Graph {
  const selected = new Set(ids)
  return structuredClone({
    nodes: graph.nodes.filter((n) => selected.has(n.id)),
    edges: graph.edges.filter((e) => selected.has(e.source) && selected.has(e.target)),
  })
}
/** Copies are templates until explicitly registered as a new monitored device. */
export function cloneFragment(fragment: Graph, offset: number, nextId = uniqueId): Graph {
  const ids = new Map(fragment.nodes.map((n) => [n.id, nextId()]))
  const copy = translateSelection(
    structuredClone(fragment),
    fragment.nodes.map((n) => n.id),
    offset,
    offset,
  )
  return {
    nodes: copy.nodes.map((n) => ({ ...n, id: ids.get(n.id)!, hostId: undefined })),
    edges: copy.edges.map((e) => ({
      ...e,
      id: nextId(),
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
    })),
  }
}
export function branchSelection(graph: Graph, roots: string[]): string[] {
  const ids = new Set(roots)
  for (let changed = true; changed; ) {
    changed = false
    for (const edge of graph.edges)
      if (ids.has(edge.source) && !ids.has(edge.target)) {
        ids.add(edge.target)
        changed = true
      }
  }
  return [...ids]
}
