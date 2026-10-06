import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Plus } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import type { MapNode, MapSide } from '../../types/topology'
import { anchor, nodeSize, CLOUD_PATH, CLOUD_VIEW_HEIGHT } from '../../features/topology/domain'
import { privateLabel } from '../../utils/privacy'
import { formatLatency } from '../../utils/formatters'
import styles from './NetworkMap.module.css'

import type { ConnectionSource } from '../../features/topology/types'
interface Props {
  n: MapNode
  host?: HostSnapshot
  selected: boolean
  connecting: ConnectionSource | null
  editable: boolean
  tool: 'select' | 'pan'
  portChoices: Map<string, number[]>
  start: (event: ReactPointerEvent, id?: string) => void
  choose: (id: string) => void
  onDetails: (id: string) => void
  selectPort: (id: string, side: MapSide, offset?: number) => void
}
/** Renderiza um balão e suas portas. O estado de edição pertence ao controlador do mapa. */
export function MapNodeView({
  n,
  host,
  selected,
  connecting,
  editable,
  tool,
  portChoices,
  start,
  choose,
  onDetails,
  selectPort,
}: Props) {
  const status =
    host?.suspended ??
    (host
      ? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status]
      : 'Tópico')
  const size = nodeSize(n)
  return (
    <div
      className={styles.node}
      data-kind={n.kind}
      data-color={n.color}
      data-shape={n.shape ?? 'rounded'}
      data-selected={selected}
      data-source={connecting?.id === n.id}
      data-node-id={n.id}
      data-text-align={
        n.textAlign ??
        (['ellipse', 'circle', 'cloud', 'diamond'].includes(n.shape ?? '') ? 'center' : 'left')
      }
      style={
        {
          left: n.x,
          top: n.y,
          width: size.width,
          height: size.height,
          '--node-fill': n.fill ?? 'var(--surface)',
          '--node-outline': n.outline ?? 'var(--node-color)',
          '--node-text': n.textColor ?? 'var(--text)',
        } as CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label={`${privateLabel(host?.name ?? n.label, host?.address)}, ${status}`}
      aria-pressed={selected}
      onPointerDown={(e) => start(e, n.id)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (tool !== 'select') return
        if (host) onDetails(host.id)
        else choose(n.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          choose(n.id)
        }
      }}
    >
      {n.shape === 'cloud' && (
        <svg
          className={styles.cloudOutline}
          viewBox={`0 0 216 ${CLOUD_VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={CLOUD_PATH} />
        </svg>
      )}
      <div className={styles.nodeContent} data-map-text>
        <span className={styles.nodeTitle}>
          {host && (
            <i className={styles.dot} data-status={host.suspended ? 'unknown' : host.status} />
          )}
          <strong>{privateLabel(host?.name ?? n.label, host?.address)}</strong>
        </span>
        {(host
          ? 'Dispositivo monitorado'
          : privateLabel(n.subtitle ?? 'Tópico de organização')) && (
          <span className={styles.address}>
            {host ? 'Dispositivo monitorado' : privateLabel(n.subtitle ?? 'Tópico de organização')}
          </span>
        )}
        <span className={styles.nodeBottom}>
          <span>{host ? status : privateLabel(n.caption ?? 'Tópico')}</span>
          {host && <b>{formatLatency(host.latencyMs)}</b>}
        </span>
        {n.texts
          ?.filter((text) => text.text)
          .map((text) => (
            <div
              key={text.id}
              className={styles.extraText}
              data-kind={text.kind}
              style={{ textAlign: text.align }}
            >
              {privateLabel(text.text)}
            </div>
          ))}
      </div>
      {editable &&
        tool === 'select' &&
        (n.kind === 'junction'
          ? (['top', 'left', 'right', 'bottom'] as const)
          : (['top', 'right', 'bottom', 'left'] as const)
        ).flatMap((side) =>
          (n.kind === 'junction' ? [0.5] : (portChoices.get(`${n.id}:${side}`) ?? [0.5])).map(
            (offset) => (
              <button
                key={`${side}:${offset}`}
                type="button"
                className={styles.port}
                data-side={side}
                style={{
                  left:
                    anchor(n, side, offset).x -
                    n.x +
                    (n.kind === 'junction'
                      ? side === 'left'
                        ? -24
                        : side === 'right'
                          ? 24
                          : 0
                      : 0),
                  top:
                    anchor(n, side, offset).y -
                    n.y +
                    (n.kind === 'junction'
                      ? side === 'top'
                        ? -24
                        : side === 'bottom'
                          ? 24
                          : 0
                      : 0),
                }}
                title={`Conectar pelo lado ${{ top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
                aria-label={`Conectar ${privateLabel(n.label)} pelo lado ${{ top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
                aria-pressed={
                  connecting?.id === n.id &&
                  connecting.side === side &&
                  connecting.offset === offset
                }
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  selectPort(n.id, side, offset)
                }}
              >
                <Plus size={13} />
              </button>
            ),
          ),
        )}
    </div>
  )
}
