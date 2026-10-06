import type { Graph, MapSide } from '../../../types/topology'

export function connectNodes(
  graph: Graph,
  source: string,
  target: string,
  id: string,
  sourceSide?: MapSide,
  targetSide?: MapSide,
  sourceOffset?: number,
  targetOffset?: number,
): Graph {
  if (
    graph.edges.length >= 2000 ||
    graph.edges.some((e) => e.id === id) ||
    source === target ||
    !graph.nodes.some((n) => n.id === source) ||
    !graph.nodes.some((n) => n.id === target)
  )
    return graph
  return {
    ...graph,
    edges: [
      ...graph.edges,
      {
        id,
        source,
        target,
        label: '',
        ...(sourceSide && { sourceSide }),
        ...(targetSide && { targetSide }),
        ...(sourceOffset !== undefined && { sourceOffset }),
        ...(targetOffset !== undefined && { targetOffset }),
      },
    ],
  }
}
