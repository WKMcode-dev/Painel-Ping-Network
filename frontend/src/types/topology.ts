export type NodeColor = 'neutral' | 'blue' | 'green' | 'orange' | 'purple' | 'pink'
export type NodeShape = 'rounded' | 'rectangle' | 'pill' | 'ellipse' | 'circle' | 'cloud' | 'diamond'
export type EdgeStyle = 'solid' | 'dashed' | 'dotted'
export interface MapPoint { x: number; y: number }
export type MapSide = 'top' | 'right' | 'bottom' | 'left'
export interface MapNode { id: string; hostId?: string; label: string; subtitle?: string; caption?: string; x: number; y: number; color: NodeColor; shape?: NodeShape; width?: number; height?: number; fill?: string; outline?: string; textColor?: string }
export interface MapEdge { id: string; source: string; target: string; label: string; bends?: MapPoint[]; sourceSide?: MapSide; targetSide?: MapSide; stroke?: string; labelColor?: string; lineWidth?: number; lineStyle?: EdgeStyle }
export interface Graph { nodes: MapNode[]; edges: MapEdge[]; appearance?: { background?: string; gridColor?: string; showGrid?: boolean } }
export interface TopologyDocument { revision: number; graph: Graph }
export interface Viewport { x: number; y: number; zoom: number }
