import type { MapNode, Viewport } from '../../../types/topology'
import { nodeSize } from './nodes'

export function worldPoint(client: { x: number; y: number }, view: Viewport) {
  return { x: (client.x - view.x) / view.zoom, y: (client.y - view.y) / view.zoom }
}
export function zoomAt(view: Viewport, zoom: number, point: { x: number; y: number }): Viewport {
  const z = Math.max(0.15, Math.min(2.5, zoom)),
    world = worldPoint(point, view)
  return { x: point.x - world.x * z, y: point.y - world.y * z, zoom: z }
}
export function fitNodes(nodes: MapNode[], width: number, height: number): Viewport {
  if (!nodes.length) return { x: 40, y: 40, zoom: 1 }
  const minX = Math.min(...nodes.map((n) => n.x)),
    minY = Math.min(...nodes.map((n) => n.y))
  const w = Math.max(...nodes.map((n) => n.x + nodeSize(n).width)) - minX
  const h = Math.max(...nodes.map((n) => n.y + nodeSize(n).height)) - minY
  const zoom = Math.max(0.15, Math.min(1.2, (width - 100) / w, (height - 100) / h))
  return { x: (width - w * zoom) / 2 - minX * zoom, y: (height - h * zoom) / 2 - minY * zoom, zoom }
}
