import { useMemo } from 'react'
import type { Graph, MapEdge, MapSide } from '../../types/topology'
import { resolvedEdges } from '../../features/topology/domain'
import { ColorControl } from './ColorControl'
import styles from './NetworkMap.module.css'
interface Props {
  edge: MapEdge
  graph: Graph
  onChange: (changes: Partial<MapEdge>) => void
  onAddBend: () => void
}
/** Propriedades da conexão; a confirmação e a persistência ficam no editor. */
export function MapEdgeProperties({ edge, graph, onChange: changeEdge, onAddBend }: Props) {
  const edgeGeometry = useMemo(
    () => resolvedEdges(graph).find((e) => e.id === edge.id),
    [edge, graph],
  )
  return (
    <>
      <strong>Pontos de ligação</strong>
      {(['source', 'target'] as const).map((end) => {
        const resolved = edgeGeometry ?? edge
        const sideKey = end === 'source' ? 'sourceSide' : 'targetSide',
          offsetKey = end === 'source' ? 'sourceOffset' : 'targetOffset'
        const label = end === 'source' ? 'Saída' : 'Entrada'
        return (
          <div key={end} className={styles.textBlockEditor}>
            <label>
              Lado da {label.toLowerCase()}
              <select
                value={edge[sideKey] ?? ''}
                onChange={(e) =>
                  changeEdge({ [sideKey]: (e.target.value || undefined) as MapSide | undefined })
                }
              >
                <option value="">Automático</option>
                <option value="top">Superior</option>
                <option value="right">Direito</option>
                <option value="bottom">Inferior</option>
                <option value="left">Esquerdo</option>
              </select>
            </label>
            <label>
              {label}: posição ({Math.round((resolved[offsetKey] ?? 0.5) * 100)}%)
              <input
                type="range"
                min={5}
                max={95}
                value={Math.round((resolved[offsetKey] ?? 0.5) * 100)}
                onChange={(e) => changeEdge({ [offsetKey]: Number(e.target.value) / 100 })}
              />
            </label>
            <button type="button" onClick={() => changeEdge({ [offsetKey]: undefined })}>
              Distribuir automaticamente
            </button>
          </div>
        )
      })}
      <small>
        Os pontos automáticos são separados na borda. Use a mesma posição na saída e entrada para
        desenhar linhas paralelas entre balões alinhados.
      </small>
      <ColorControl
        label="Cor da linha"
        value={edge.stroke}
        fallback="#64748b"
        presets
        onChange={(stroke) => changeEdge({ stroke })}
        onClear={() => changeEdge({ stroke: undefined })}
      />
      <ColorControl
        label="Texto da linha"
        value={edge.labelColor}
        fallback="#202124"
        onChange={(labelColor) => changeEdge({ labelColor })}
        onClear={() => changeEdge({ labelColor: undefined })}
      />
      <label>
        Espessura ({edge.lineWidth ?? 2})
        <input
          type="range"
          min={1}
          max={8}
          value={edge.lineWidth ?? 2}
          onChange={(e) => changeEdge({ lineWidth: Number(e.target.value) })}
        />
      </label>
      <label>
        Traço
        <select
          value={edge.lineStyle ?? 'solid'}
          onChange={(e) => changeEdge({ lineStyle: e.target.value as MapEdge['lineStyle'] })}
        >
          <option value="solid">Contínuo</option>
          <option value="dashed">Tracejado</option>
          <option value="dotted">Pontilhado</option>
        </select>
      </label>
      <button onClick={onAddBend} disabled={(edge.bends?.length ?? 0) >= 24}>
        Adicionar ponto de dobra
      </button>
      <small>Arraste o ponto pela grade. Duplo clique no ponto para removê-lo.</small>
    </>
  )
}
