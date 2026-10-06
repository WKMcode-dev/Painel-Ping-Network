import type { Dispatch, SetStateAction } from 'react'
import type { Graph, MapNode, MapEdge, MapSide } from '../../../types/topology'
import type { ConnectionSource } from '../types'
import { connectNodes, uniqueId, splitConnection, edgePoints, insertBend } from '../domain'
type Setter<T> = Dispatch<SetStateAction<T>>
interface Props {
  editor: { graph: Graph | null; commit: (graph: Graph) => void }
  editable: boolean
  tool: 'select' | 'pan'
  connecting: ConnectionSource | null
  setConnecting: Setter<ConnectionSource | null>
  setSelected: Setter<string[]>
  setEdgeId: Setter<string | null>
  setHint: Setter<string>
  freePort: (id: string, side: MapSide) => number
  routedEdges: MapEdge[]
  nodeMap: Map<string, MapNode>
  edge?: MapEdge
}
/** Conexões entre balões e junções são confirmadas como uma única operação de undo. */
export function useMapConnectionCommands({
  editor,
  editable,
  tool,
  connecting,
  setConnecting,
  setSelected,
  setEdgeId,
  setHint,
  freePort,
  routedEdges,
  nodeMap,
  edge,
}: Props) {
  const choose = (id: string) => {
    if (tool !== 'select') return
    if (connecting && editable && editor.graph) {
      editor.commit(
        connectNodes(
          editor.graph,
          connecting.id,
          id,
          uniqueId(),
          connecting.side,
          undefined,
          connecting.offset,
        ),
      )
      setConnecting(null)
    } else {
      setSelected([id])
      setEdgeId(null)
    }
  }
  const selectPort = (id: string, side: MapSide, offset = freePort(id, side)) => {
    if (!editable || !editor.graph) return
    if (connecting && connecting.id !== id) {
      editor.commit(
        connectNodes(
          editor.graph,
          connecting.id,
          id,
          uniqueId(),
          connecting.side,
          side,
          connecting.offset,
          offset,
        ),
      )
      setConnecting(null)
    } else
      setConnecting(
        connecting?.id === id && connecting.side === side && connecting.offset === offset
          ? null
          : { id, side, offset },
      )
    setSelected([id])
    setEdgeId(null)
  }
  const connectLine = (id: string) => {
    if (!editable || !editor.graph) return
    const geometry = routedEdges.find((e) => e.id === id)
    if (!geometry) return
    if (editor.graph.edges.length + (connecting ? 2 : 1) > 2000) {
      setHint('Limite de conexões atingido.')
      return
    }
    const junctionId = uniqueId()
    let next = splitConnection(editor.graph, geometry, junctionId, uniqueId())
    if (next === editor.graph) {
      setHint('Sem espaço para outra junção nesta linha.')
      return
    }
    if (connecting)
      next = connectNodes(
        next,
        connecting.id,
        junctionId,
        uniqueId(),
        connecting.side,
        undefined,
        connecting.offset,
      )
    editor.commit(next)
    setSelected([junctionId])
    setEdgeId(null)
    setConnecting(connecting ? null : { id: junctionId })
    setHint(
      'Junção criada. Conecte a um balão ou ao + de outra linha. Salve o mapa para manter a ramificação.',
    )
  }
  const addBend = (raw?: { x: number; y: number }) => {
    if (!editor.graph || !edge || !editable) return
    const source = nodeMap.get(edge.source),
      target = nodeMap.get(edge.target)
    if (!source || !target) return
    const geometry = routedEdges.find((e) => e.id === edge.id) ?? edge
    const points = edgePoints(source, target, geometry)
    let start = points[0]!,
      end = points[1]!,
      distance = -1
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!,
        b = points[i + 1]!,
        d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d > distance) {
        distance = d
        start = a
        end = b
      }
    }
    const point = raw ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    editor.commit({
      ...editor.graph,
      edges: editor.graph.edges.map((e) =>
        e.id === edge.id ? insertBend(e, source, target, point, geometry) : e,
      ),
    })
  }

  return { choose, selectPort, connectLine, addBend }
}
