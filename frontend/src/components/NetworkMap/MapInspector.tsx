import { useState } from 'react'
import type { Graph, MapEdge, MapNode, NodeColor, NodeShape } from '../../types/topology'
import type { HostSnapshot } from '../../types/monitor'
import { nodeSize } from '../../utils/topology'
import styles from './NetworkMap.module.css'

const shapes: { value: NodeShape; label: string }[] = [
  { value: 'rounded', label: 'Retângulo arredondado' }, { value: 'rectangle', label: 'Retângulo' },
  { value: 'pill', label: 'Cápsula' }, { value: 'ellipse', label: 'Elipse' },
  { value: 'circle', label: 'Círculo' }, { value: 'cloud', label: 'Nuvem' }, { value: 'diamond', label: 'Losango' },
]
const swatches = ['#243d81', '#005fb8', '#e36100', '#7da642', '#137d46', '#c64449', '#784aa7', '#303237']
const readableText = (hex: string) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722 > .179 ? '#202124' : '#ffffff'
}

export function ColorControl({ label, value, fallback, onChange, onClear, presets = false }: {
  label: string; value?: string; fallback: string; onChange: (hex: string) => void; onClear: () => void; presets?: boolean
}) {
  return <div className={styles.colorControl}>
    <label>{label}<span className={styles.colorPicker}><input type="color" aria-label={label} value={value ?? fallback} onChange={e => onChange(e.target.value)} /><code>{value ?? 'Tema'}</code></span></label>
    {presets && <div className={styles.swatches} aria-label={`Cores prontas para ${label}`}>
      {swatches.map(hex => <button key={hex} type="button" className={styles.swatch} style={{ backgroundColor: hex }} title={hex} aria-label={`${label}: ${hex}`} onClick={() => onChange(hex)} />)}
    </div>}
    {value && <button type="button" onClick={onClear}>Usar cor padrão</button>}
  </div>
}

interface Props { node?: MapNode; edge?: MapEdge; graph: Graph; host?: HostSnapshot; commit: (g: Graph) => void; onDetails: (id: string) => void; onConnect: () => void; onChild: () => void; onDelete: () => void; onAddBend: () => void }
export function MapInspector({ node, edge, graph, host, commit, onDetails, onConnect, onChild, onDelete, onAddBend }: Props) {
  const [label, setLabel] = useState(edge?.label ?? node?.label ?? '')
  const changeNode = (changes: Partial<MapNode>) => { if (node) commit({ ...graph, nodes: graph.nodes.map(x => x.id === node.id ? { ...x, ...changes } : x) }) }
  const changeEdge = (changes: Partial<MapEdge>) => { if (edge) commit({ ...graph, edges: graph.edges.map(x => x.id === edge.id ? { ...x, ...changes } : x) }) }
  const dimensions = node ? nodeSize(node) : null
  return <aside className={styles.inspector} aria-label="Elemento selecionado" onPointerDown={e => e.stopPropagation()}>
    <strong>{edge ? 'Conexão' : host ? host.name : 'Tópico'}</strong>
    {host && <><span>{host.address}</span><span>{host.suspended ?? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status]}</span><button onClick={() => onDetails(host.id)}>Abrir status e histórico</button></>}
    {(!node?.hostId || edge) && <form onSubmit={e => {
      e.preventDefault()
      if (edge) changeEdge({ label: label.trim() })
      else if (label.trim()) changeNode({ label: label.trim() })
    }}><label>{edge ? 'Nome da conexão' : 'Nome do tópico'}<input maxLength={edge ? 80 : 100} value={label} onChange={e => setLabel(e.target.value)} /></label><button type="submit">Aplicar nome</button></form>}
    {node && <>
      <label>Forma<select value={node.shape ?? 'rounded'} onChange={e => changeNode({ shape: e.target.value as NodeShape, width: undefined, height: undefined })}>
        {shapes.map(shape => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
      </select></label>
      <div className={styles.dimensions}>
        <label>Largura<input type="number" min={96} max={576} step={24} value={dimensions!.width} onChange={e => { const width = Number(e.target.value); if (width >= 96 && width <= 576) changeNode({ width }) }} /></label>
        <label>Altura<input type="number" min={72} max={576} step={24} value={dimensions!.height} onChange={e => { const height = Number(e.target.value); if (height >= 72 && height <= 576) changeNode({ height }) }} /></label>
      </div>
      <label>Cor de referência<select value={node.color} onChange={e => changeNode({ color: e.target.value as NodeColor })}>
        {(['neutral', 'blue', 'green', 'orange', 'purple', 'pink'] as const).map((color, i) => <option key={color} value={color}>{['Padrão', 'Azul', 'Verde', 'Laranja', 'Roxo', 'Rosa'][i]}</option>)}
      </select></label>
      <ColorControl label="Preenchimento" value={node.fill} fallback="#ffffff" presets onChange={fill => changeNode({ fill, textColor: readableText(fill) })} onClear={() => changeNode({ fill: undefined, textColor: undefined })} />
      <ColorControl label="Borda" value={node.outline} fallback="#6a9ec4" onChange={outline => changeNode({ outline })} onClear={() => changeNode({ outline: undefined })} />
      <ColorControl label="Texto" value={node.textColor} fallback="#202124" onChange={textColor => changeNode({ textColor })} onClear={() => changeNode({ textColor: undefined })} />
      <button onClick={onChild}>Adicionar subtópico</button><button onClick={onConnect}>Conectar a outro balão</button>
    </>}
    {edge && <>
      <ColorControl label="Cor da linha" value={edge.stroke} fallback="#64748b" presets onChange={stroke => changeEdge({ stroke })} onClear={() => changeEdge({ stroke: undefined })} />
      <ColorControl label="Texto da linha" value={edge.labelColor} fallback="#202124" onChange={labelColor => changeEdge({ labelColor })} onClear={() => changeEdge({ labelColor: undefined })} />
      <label>Espessura ({edge.lineWidth ?? 2})<input type="range" min={1} max={8} value={edge.lineWidth ?? 2} onChange={e => changeEdge({ lineWidth: Number(e.target.value) })} /></label>
      <label>Traço<select value={edge.lineStyle ?? 'solid'} onChange={e => changeEdge({ lineStyle: e.target.value as MapEdge['lineStyle'] })}>
        <option value="solid">Contínuo</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option>
      </select></label>
      <button onClick={onAddBend} disabled={(edge.bends?.length ?? 0) >= 24}>Adicionar ponto de dobra</button><small>Arraste o ponto pela grade. Duplo clique no ponto para removê-lo.</small>
    </>}
    {(!node?.hostId || edge) && <button onClick={onDelete}>Excluir {edge ? 'conexão' : 'tópico'}</button>}
    {node?.hostId && <small>Nome e endereço são editados em Dispositivos. A cor do ponto indica o status ICMP.</small>}
  </aside>
}

export function MapAppearance({ graph, commit, onClose }: { graph: Graph; commit: (g: Graph) => void; onClose: () => void }) {
  const appearance = graph.appearance ?? {}
  const change = (changes: Partial<NonNullable<Graph['appearance']>>) => commit({ ...graph, appearance: { ...appearance, ...changes } })
  return <aside className={styles.inspector} aria-label="Aparência do mapa" onPointerDown={e => e.stopPropagation()}>
    <strong>Aparência do mapa</strong>
    <ColorControl label="Fundo" value={appearance.background} fallback="#ffffff" onChange={background => change({ background })} onClear={() => change({ background: undefined })} />
    <ColorControl label="Grade" value={appearance.gridColor} fallback="#d9d9d9" onChange={gridColor => change({ gridColor })} onClear={() => change({ gridColor: undefined })} />
    <label className={styles.check}><input type="checkbox" checked={appearance.showGrid !== false} onChange={e => change({ showGrid: e.target.checked })} /> Mostrar grade</label>
    <small>As cores e o desenho são compartilhados quando o mapa é salvo.</small>
    <button type="button" onClick={onClose}>Fechar</button>
  </aside>
}
