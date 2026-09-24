export type NodeColor = 'neutral' | 'blue' | 'green' | 'orange' | 'purple' | 'pink'
export interface MapNode { id: string; hostId?: string; label: string; x: number; y: number; color: NodeColor }
export interface MapEdge { id: string; source: string; target: string; label: string }
export interface Graph { nodes: MapNode[]; edges: MapEdge[] }
export interface TopologyDocument { revision: number; graph: Graph }
export interface Viewport { x: number; y: number; zoom: number }
