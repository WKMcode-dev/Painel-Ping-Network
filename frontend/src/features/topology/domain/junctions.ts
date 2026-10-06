import type { Graph, MapNode, MapEdge } from '../../../types/topology'
import { snapPoint } from './nodes'
import { edgePoints } from './routing'

/** Split a straight segment at its center. Each new segment offers another spaced +. */
export function junctionPoint(source: MapNode, target: MapNode, edge: MapEdge) {
  const points = edgePoints(source, target, edge)
  let segment = 0,
    length = 0
  for (let i = 0; i < points.length - 1; i++) {
    const size = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y)
    if (size > length) {
      length = size
      segment = i
    }
  }
  if (length < 48) return null
  const a = points[segment]!,
    b = points[segment + 1]!
  const middle = snapPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  // Junctions use their center as the grid reference; normal nodes use their top-left.
  return { ...middle, segment }
}
export function splitConnection(
  graph: Graph,
  geometry: MapEdge,
  junctionId: string,
  secondId: string,
): Graph {
  if (
    graph.nodes.length >= 600 ||
    graph.edges.length >= 2000 ||
    graph.nodes.some((n) => n.id === junctionId) ||
    graph.edges.some((e) => e.id === secondId)
  )
    return graph
  const source = graph.nodes.find((n) => n.id === geometry.source),
    target = graph.nodes.find((n) => n.id === geometry.target)
  if (!source || !target || !graph.edges.some((e) => e.id === geometry.id)) return graph
  const point = junctionPoint(source, target, geometry)
  if (!point) return graph
  const first: MapEdge = {
    ...geometry,
    target: junctionId,
    targetSide: undefined,
    targetOffset: undefined,
    bends: geometry.bends?.slice(0, point.segment),
  }
  const second: MapEdge = {
    ...geometry,
    id: secondId,
    source: junctionId,
    sourceSide: undefined,
    sourceOffset: undefined,
    label: '',
    bends: geometry.bends?.slice(point.segment),
  }
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: junctionId,
        kind: 'junction',
        label: 'Junção',
        x: point.x - 6,
        y: point.y - 6,
        color: 'neutral',
        outline: geometry.stroke,
      },
    ],
    edges: [...graph.edges.map((e) => (e.id === geometry.id ? first : e)), second],
  }
}
