import type { Graph, Viewport, MapSide } from '../../types/topology'
export interface ConnectionSource {
  id: string
  side?: MapSide
  offset?: number
}
export type MapGesture = {
  pointer: number
  startX: number
  startY: number
  view: Viewport
  graph: Graph
  ids: string[]
  mode?: 'pan' | 'marquee' | 'nodes'
  additive?: string[]
  bend?: { edgeId: string; index: number }
  moved: boolean
  capture: Element
}
