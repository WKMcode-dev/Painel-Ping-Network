import type { MapNode, MapSide, MapPoint, MapEdge } from '../../../types/topology'
import { nodeSize, snap, snapPoint, SNAP_STEP, CORNER_RADIUS } from './nodes'

export const CLOUD_VIEW_HEIGHT = 144
export const CLOUD_PATH =
  'M 44 144 C 20 144 0 124 0 101 C 0 78 15 59 36 54 C 35 24 58 0 88 0 C 115 0 138 19 142 42 C 152 36 165 35 176 39 C 192 44 202 58 202 74 C 211 79 216 90 216 108 C 216 128 201 144 180 144 Z'
// Sample the shared SVG contour once, so cloud connection points follow its silhouette.
const cloudContour: MapPoint[] = (() => {
  const tokens = CLOUD_PATH.match(/[MCZ]|-?\d+(?:\.\d+)?/g)!,
    points: MapPoint[] = []
  let cursor = { x: 0, y: 0 },
    i = 0
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'M') {
      cursor = { x: Number(tokens[i++]), y: Number(tokens[i++]) }
      points.push(cursor)
    } else if (command === 'C') {
      const controls = Array.from({ length: 6 }, () => Number(tokens[i++]))
      const start = cursor
      for (let step = 1; step <= 32; step++) {
        const t = step / 32,
          u = 1 - t
        points.push({
          x:
            u ** 3 * start.x +
            3 * u * u * t * controls[0]! +
            3 * u * t * t * controls[2]! +
            t ** 3 * controls[4]!,
          y:
            u ** 3 * start.y +
            3 * u * u * t * controls[1]! +
            3 * u * t * t * controls[3]! +
            t ** 3 * controls[5]!,
        })
      }
      cursor = points.at(-1)!
    } else if (command === 'Z') points.push(points[0]!)
  }
  return points
})()
export function anchor(node: MapNode, side: MapSide, offset = 0.5): MapPoint {
  if (node.kind === 'junction') return { x: node.x + 6, y: node.y + 6 }
  const { width, height } = nodeSize(node)
  const horizontal = side === 'top' || side === 'bottom'
  if (node.shape === 'ellipse' || node.shape === 'circle') {
    const factor = Math.sqrt(Math.max(0, 1 - (2 * offset - 1) ** 2))
    return horizontal
      ? {
          x: node.x + width * offset,
          y: node.y + (height / 2) * (side === 'top' ? 1 - factor : 1 + factor),
        }
      : {
          x: node.x + (width / 2) * (side === 'left' ? 1 - factor : 1 + factor),
          y: node.y + height * offset,
        }
  }
  if (node.shape === 'cloud') {
    const axis = horizontal ? 'x' : 'y',
      other = horizontal ? 'y' : 'x',
      coordinate = offset * (horizontal ? 216 : CLOUD_VIEW_HEIGHT),
      hits: number[] = []
    for (let i = 1; i < cloudContour.length; i++) {
      const a = cloudContour[i - 1]!,
        b = cloudContour[i]!,
        span = b[axis] - a[axis]
      if (!span) continue
      const fraction = (coordinate - a[axis]) / span
      if (fraction >= 0 && fraction <= 1) hits.push(a[other] + fraction * (b[other] - a[other]))
    }
    if (hits.length) {
      const boundary = side === 'top' || side === 'left' ? Math.min(...hits) : Math.max(...hits)
      return horizontal
        ? { x: node.x + width * offset, y: node.y + (height * boundary) / CLOUD_VIEW_HEIGHT }
        : { x: node.x + (width * boundary) / 216, y: node.y + height * offset }
    }
  }
  const alignedX = node.x + Math.max(SNAP_STEP, Math.min(width - SNAP_STEP, snap(width * offset)))
  const alignedY = node.y + Math.max(SNAP_STEP, Math.min(height - SNAP_STEP, snap(height * offset)))
  switch (side) {
    case 'top':
      return { x: alignedX, y: node.y }
    case 'right':
      return { x: node.x + width, y: alignedY }
    case 'bottom':
      return { x: alignedX, y: node.y + height }
    case 'left':
      return { x: node.x, y: alignedY }
  }
}
/** Choose a facing surface using the direction to the next bend or node. */
export function facingSide(from: MapNode, toward: MapPoint): MapSide {
  const { width, height } = nodeSize(from)
  const dx = toward.x - (from.x + width / 2),
    dy = toward.y - (from.y + height / 2)
  const scaledX = Math.abs(dx) / width,
    scaledY = Math.abs(dy) / height
  return scaledX >= scaledY ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
}
export function edgePoints(
  source: MapNode,
  target: MapNode,
  edge: Pick<MapEdge, 'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'>,
): MapPoint[] {
  const sourceSize = nodeSize(source),
    targetSize = nodeSize(target)
  const sourceCenter = { x: source.x + sourceSize.width / 2, y: source.y + sourceSize.height / 2 }
  const targetCenter = { x: target.x + targetSize.width / 2, y: target.y + targetSize.height / 2 }
  const bends = edge.bends ?? []
  const sourceSide = edge.sourceSide ?? facingSide(source, bends[0] ?? targetCenter)
  const targetSide = edge.targetSide ?? facingSide(target, bends.at(-1) ?? sourceCenter)
  return [
    anchor(source, sourceSide, edge.sourceOffset),
    ...bends,
    anchor(target, targetSide, edge.targetOffset),
  ]
}
/** Segments are straight. Only explicitly inserted corners get a small radius. */
export function edgeRoute(
  source: MapNode,
  target: MapNode,
  edge: Pick<MapEdge, 'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'>,
) {
  const points = edgePoints(source, target, edge)
  let path = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!,
      corner = points[i]!,
      after = points[i + 1]!
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y)
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y)
    const radius = Math.min(CORNER_RADIUS, incoming / 2, outgoing / 2)
    if (!radius) {
      path += ` L ${corner.x} ${corner.y}`
      continue
    }
    const start = {
      x: corner.x - ((corner.x - before.x) * radius) / incoming,
      y: corner.y - ((corner.y - before.y) * radius) / incoming,
    }
    const end = {
      x: corner.x + ((after.x - corner.x) * radius) / outgoing,
      y: corner.y + ((after.y - corner.y) * radius) / outgoing,
    }
    path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`
  }
  path += ` L ${points.at(-1)!.x} ${points.at(-1)!.y}`
  const distances = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y))
  let remaining = distances.reduce((sum, length) => sum + length, 0) / 2
  for (let i = 0; i < distances.length; i++) {
    const length = distances[i]!
    if (remaining <= length || i === distances.length - 1) {
      const fraction = length ? remaining / length : 0
      return {
        path,
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * fraction,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * fraction,
      }
    }
    remaining -= length
  }
  return { path, x: points[0]!.x, y: points[0]!.y }
}
export function edgeCurve(source: MapNode, target: MapNode) {
  return edgeRoute(source, target, { bends: [] })
}

export function insertBend(
  edge: MapEdge,
  source: MapNode,
  target: MapNode,
  raw: MapPoint,
  geometry: Pick<
    MapEdge,
    'bends' | 'sourceSide' | 'targetSide' | 'sourceOffset' | 'targetOffset'
  > = edge,
): MapEdge {
  if ((edge.bends?.length ?? 0) >= 24) return edge
  const point = snapPoint(raw)
  const points = edgePoints(source, target, geometry)
  let segment = 0,
    distance = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!
    const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = lengthSquared
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared,
          ),
        )
      : 0
    const d = (point.x - a.x - t * (b.x - a.x)) ** 2 + (point.y - a.y - t * (b.y - a.y)) ** 2
    if (d < distance) {
      distance = d
      segment = i
    }
  }
  const bends = [...(edge.bends ?? [])]
  bends.splice(segment, 0, point)
  return { ...edge, bends }
}
