import type { RefObject, PointerEvent as ReactPointerEvent } from 'react'
import { Plus } from 'lucide-react'
import type { Graph, MapEdge, MapNode, MapPoint, Viewport } from '../../types/topology'
import { junctionPoint, edgeRoute, edgePoints, worldPoint } from '../../features/topology/domain'
import { privateLabel } from '../../utils/privacy'
import styles from './NetworkMap.module.css'
interface Props {
  graph: Graph
  edges: MapEdge[]
  nodeMap: Map<string, MapNode>
  connecting: boolean
  edgeId: string | null
  selected: string[]
  editable: boolean
  tool: 'select' | 'pan'
  canvas: RefObject<HTMLDivElement | null>
  view: Viewport
  start: (event: ReactPointerEvent) => void
  startBend: (event: ReactPointerEvent<SVGCircleElement>, edgeId: string, index: number) => void
  connectLine: (id: string) => void
  onSelect: (id: string) => void
  onInsertBend: (edge: MapEdge, point: MapPoint) => void
  onRemoveBend: (id: string, index: number) => void
}
/** SVG de conexões: geometria pura e comandos explícitos, sem persistência ou seleção própria. */
export function MapEdges({
  graph,
  edges,
  nodeMap,
  connecting,
  edgeId,
  selected,
  editable,
  tool,
  canvas,
  view,
  start,
  startBend,
  connectLine,
  onSelect,
  onInsertBend,
  onRemoveBend,
}: Props) {
  return (
    <svg
      className={styles.edges}
      data-connecting={Boolean(connecting)}
      aria-label="Conexões do mapa"
    >
      {edges.map((e) => {
        const port = junctionPoint(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
        const curve = edgeRoute(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
        return (
          <g key={e.id} data-selected={e.id === edgeId}>
            <path
              className={styles.edgeLine}
              d={curve.path}
              style={{
                stroke: e.stroke ?? undefined,
                strokeWidth: e.lineWidth ?? undefined,
                strokeDasharray:
                  e.lineStyle === 'dashed' ? '10 7' : e.lineStyle === 'dotted' ? '2 6' : undefined,
              }}
            />
            <path
              className={styles.edgeHit}
              d={curve.path}
              role="button"
              tabIndex={0}
              aria-label={privateLabel(
                `Conexão ${e.label || `${nodeMap.get(e.source)!.label} para ${nodeMap.get(e.target)!.label}`}`,
              )}
              onPointerDown={(event) => {
                if (tool === 'pan' || !editable) {
                  start(event)
                  return
                }
                event.stopPropagation()
                onSelect(e.id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!editable || tool !== 'select' || !graph) return
                const rect = canvas.current!.getBoundingClientRect()
                const point = worldPoint(
                  { x: event.clientX - rect.left, y: event.clientY - rect.top },
                  view,
                )
                onInsertBend(e, point)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(e.id)
                }
              }}
            />
            {editable &&
              tool === 'select' &&
              (e.id === edgeId || selected.includes(e.source) || selected.includes(e.target)) &&
              edgePoints(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
                .filter((_, i, points) => i === 0 || i === points.length - 1)
                .map((point, index) => (
                  <circle
                    key={`anchor-${index}`}
                    className={styles.endpoint}
                    cx={point.x}
                    cy={point.y}
                    r={4}
                  />
                ))}
            {editable && tool === 'select' && port && (
              <foreignObject
                x={port.x - 12}
                y={port.y - 12}
                width={24}
                height={24}
                className={styles.linePort}
              >
                <button
                  type="button"
                  title="Criar junção nesta linha"
                  aria-label="Conectar nesta linha"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    connectLine(e.id)
                  }}
                >
                  <Plus size={14} />
                </button>
              </foreignObject>
            )}
            {e.label && (
              <text
                x={curve.x}
                y={curve.y - 10}
                textAnchor="middle"
                className={styles.edgeLabel}
                style={{
                  fill: e.labelColor ?? undefined,
                  stroke: graph.appearance?.background ?? undefined,
                }}
              >
                {e.label.split('\n').map((line, index) => (
                  <tspan key={index} x={curve.x} dy={index ? 15 : 0}>
                    {privateLabel(line)}
                  </tspan>
                ))}
              </text>
            )}
            {e.id === edgeId &&
              editable &&
              tool === 'select' &&
              e.bends?.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  className={styles.bend}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ponto ${index + 1} da conexão; arraste para ajustar, Delete para remover`}
                  onPointerDown={(event) => startBend(event, e.id, index)}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    onRemoveBend(e.id, index)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                      event.stopPropagation()
                      event.preventDefault()
                      onRemoveBend(e.id, index)
                    }
                  }}
                />
              ))}
          </g>
        )
      })}
    </svg>
  )
}
