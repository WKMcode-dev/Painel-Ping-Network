import type { Dispatch, SetStateAction, RefObject, PointerEvent as ReactPointerEvent } from 'react'
import type { Graph, MapNode, Viewport } from '../../../types/topology'
import type { ConnectionSource, MapGesture } from '../types'
import {
  connectNodes,
  uniqueId,
  snapPoint,
  worldPoint,
  rectangleSelection,
  translateSelection,
} from '../domain'

type Setter<T> = Dispatch<SetStateAction<T>>
interface Props {
  editor: { graph: Graph | null; commit: (graph: Graph) => void }
  editable: boolean
  tool: 'select' | 'pan'
  selected: string[]
  setSelected: Setter<string[]>
  setEdgeId: Setter<string | null>
  connecting: ConnectionSource | null
  setConnecting: Setter<ConnectionSource | null>
  view: Viewport
  setView: Setter<Viewport>
  setWheelPanning: Setter<boolean>
  setPreview: Setter<Graph | null>
  setMarquee: Setter<{ x: number; y: number; width: number; height: number } | null>
  nodes: MapNode[]
  canvas: RefObject<HTMLDivElement | null>
  gesture: RefObject<MapGesture | null>
}
/** Cada gesto usa um snapshot inicial e só confirma uma edição ao soltar o ponteiro.
 * Preview não entra no histórico; cancelar restaura câmera/seleção sem salvar o arraste. */
export function useMapGestures({
  editor,
  editable,
  tool,
  selected,
  setSelected,
  setEdgeId,
  connecting,
  setConnecting,
  view,
  setView,
  setWheelPanning,
  setPreview,
  setMarquee,
  nodes,
  canvas,
  gesture,
}: Props) {
  const start = (event: ReactPointerEvent, id?: string) => {
    if (!editor.graph || event.button !== 0 || gesture.current) return
    event.stopPropagation()
    setWheelPanning(false)
    canvas.current?.focus({ preventScroll: true })
    if (connecting && id && editable && tool === 'select') {
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
      return
    }
    const dragging = id && editable && tool === 'select'
    let ids = dragging
      ? selected.includes(id)
        ? selected
        : event.shiftKey
          ? [...selected, id]
          : [id]
      : []
    if (dragging && event.shiftKey && selected.includes(id)) ids = selected.filter((x) => x !== id)
    if (dragging) {
      setSelected(ids)
      setEdgeId(null)
    } else if (!id && tool === 'select') {
      if (!event.shiftKey) setSelected([])
      setEdgeId(null)
    }
    gesture.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view,
      graph: editor.graph,
      ids,
      mode: tool === 'pan' ? 'pan' : id ? 'nodes' : 'marquee',
      additive: event.shiftKey ? selected : [],
      moved: false,
      capture: event.currentTarget,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startBend = (event: ReactPointerEvent<SVGCircleElement>, edgeId: string, index: number) => {
    if (!editor.graph || !editable || tool !== 'select' || gesture.current || event.button !== 0)
      return
    event.stopPropagation()
    setEdgeId(edgeId)
    setSelected([])
    gesture.current = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view,
      graph: editor.graph,
      ids: [],
      bend: { edgeId, index },
      moved: false,
      capture: event.currentTarget,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveBend = (
    original: Graph,
    edgeId: string,
    index: number,
    dx: number,
    dy: number,
    zoom: number,
  ) => ({
    ...original,
    edges: original.edges.map((edge) =>
      edge.id !== edgeId
        ? edge
        : {
            ...edge,
            bends: edge.bends?.map((point, i) =>
              i === index ? snapPoint({ x: point.x + dx / zoom, y: point.y + dy / zoom }) : point,
            ),
          },
    ),
  })
  const move = (event: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    const dx = event.clientX - g.startX,
      dy = event.clientY - g.startY
    if (Math.hypot(dx, dy) < 3 && !g.moved) return
    g.moved = true
    if (g.bend) setPreview(moveBend(g.graph, g.bend.edgeId, g.bend.index, dx, dy, g.view.zoom))
    else if (g.mode === 'marquee') {
      const rect = canvas.current!.getBoundingClientRect()
      const start = { x: g.startX - rect.left, y: g.startY - rect.top },
        end = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setMarquee({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      })
      setSelected([
        ...new Set([
          ...(g.additive ?? []),
          ...rectangleSelection(nodes, worldPoint(start, g.view), worldPoint(end, g.view)),
        ]),
      ])
    } else if (g.mode === 'pan') setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
    else setPreview(translateSelection(g.graph, g.ids, dx / g.view.zoom, dy / g.view.zoom))
  }
  const end = (event: ReactPointerEvent, cancelled = false) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    if (!cancelled && g.moved && g.bend)
      editor.commit(
        moveBend(
          g.graph,
          g.bend.edgeId,
          g.bend.index,
          event.clientX - g.startX,
          event.clientY - g.startY,
          g.view.zoom,
        ),
      )
    else if (!cancelled && g.moved && g.mode === 'nodes' && g.ids.length) {
      const dx = (event.clientX - g.startX) / g.view.zoom,
        dy = (event.clientY - g.startY) / g.view.zoom
      editor.commit(translateSelection(g.graph, g.ids, dx, dy))
    }
    if (cancelled && g.mode === 'pan') setView(g.view)
    if (cancelled && g.mode === 'marquee') setSelected(g.additive ?? [])
    gesture.current = null
    setPreview(null)
    setMarquee(null)
    if (g.capture.hasPointerCapture(event.pointerId))
      g.capture.releasePointerCapture(event.pointerId)
  }

  return { start, startBend, move, end }
}
