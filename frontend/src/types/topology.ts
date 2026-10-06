export type NodeColor = 'neutral' | 'blue' | 'green' | 'orange' | 'purple' | 'pink'
export type NodeShape =
  | 'rounded'
  | 'rectangle'
  | 'pill'
  | 'ellipse'
  | 'circle'
  | 'cloud'
  | 'diamond'
export type EdgeStyle = 'solid' | 'dashed' | 'dotted'
export interface MapPoint {
  x: number
  y: number
}
export type MapSide = 'top' | 'right' | 'bottom' | 'left'
export type TextAlign = 'left' | 'center' | 'right'
export interface MapText {
  id: string
  kind: 'title' | 'subtitle' | 'text'
  text: string
  align?: TextAlign
}
export interface MapNode {
  id: string
  kind?: 'junction'
  hostId?: string
  label: string
  subtitle?: string
  caption?: string
  texts?: MapText[]
  textAlign?: TextAlign
  x: number
  y: number
  color: NodeColor
  shape?: NodeShape
  width?: number
  height?: number
  fill?: string
  outline?: string
  textColor?: string
}
export interface MapEdge {
  id: string
  source: string
  target: string
  label: string
  bends?: MapPoint[]
  sourceSide?: MapSide
  targetSide?: MapSide
  sourceOffset?: number
  targetOffset?: number
  stroke?: string
  labelColor?: string
  lineWidth?: number
  lineStyle?: EdgeStyle
}
export interface Graph {
  nodes: MapNode[]
  edges: MapEdge[]
  appearance?: { background?: string; gridColor?: string; showGrid?: boolean }
}
export interface TopologyDocument {
  revision: number
  graph: Graph
}
export interface Viewport {
  x: number
  y: number
  zoom: number
}

/** Diagnóstico da API: identifica o campo, sem incluir o conteúdo rejeitado. */
export interface MapValidationIssue {
  kind?: 'node' | 'edge'
  elementId?: string
  field: string
  message: string
}
