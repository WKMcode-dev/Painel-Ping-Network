import type { Graph } from '../../types/topology'
import { ColorControl } from './ColorControl'
import styles from './NetworkMap.module.css'

export function MapAppearance({
  graph,
  commit,
  onClose,
}: {
  graph: Graph
  commit: (g: Graph) => void
  onClose: () => void
}) {
  const appearance = graph.appearance ?? {}
  const change = (changes: Partial<NonNullable<Graph['appearance']>>) =>
    commit({ ...graph, appearance: { ...appearance, ...changes } })
  return (
    <aside
      className={styles.inspector}
      aria-label="Aparência do mapa"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <strong>Aparência do mapa</strong>
      <ColorControl
        label="Fundo"
        value={appearance.background}
        fallback="#ffffff"
        onChange={(background) => change({ background })}
        onClear={() => change({ background: undefined })}
      />
      <ColorControl
        label="Grade"
        value={appearance.gridColor}
        fallback="#d9d9d9"
        onChange={(gridColor) => change({ gridColor })}
        onClear={() => change({ gridColor: undefined })}
      />
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={appearance.showGrid !== false}
          onChange={(e) => change({ showGrid: e.target.checked })}
        />{' '}
        Mostrar grade
      </label>
      <small>As cores e o desenho são compartilhados quando o mapa é salvo.</small>
      <button type="button" onClick={onClose}>
        Fechar
      </button>
    </aside>
  )
}
