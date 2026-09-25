import { useState } from 'react'
import type { Graph, MapEdge, MapNode, NodeColor } from '../../types/topology'
import type { HostSnapshot } from '../../types/monitor'
import styles from './NetworkMap.module.css'
interface Props { node?: MapNode; edge?: MapEdge; graph: Graph; host?: HostSnapshot; commit: (g: Graph) => void; onDetails: (id: string) => void; onConnect: () => void; onChild: () => void; onDelete: () => void; onAddBend: () => void }
export function MapInspector({ node, edge, graph, host, commit, onDetails, onConnect, onChild, onDelete, onAddBend }: Props) {
  const [label, setLabel] = useState(edge?.label ?? node?.label ?? '')
  return <aside className={styles.inspector} aria-label="Elemento selecionado">
    <strong>{edge ? 'Conexão' : host ? host.name : 'Tópico'}</strong>
    {host && <><span>{host.address}</span><span>{host.suspended ?? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status]}</span><button onClick={() => onDetails(host.id)}>Abrir status e histórico</button></>}
    {(!node?.hostId || edge) && <form onSubmit={e => {
      e.preventDefault()
      if (edge) commit({ ...graph, edges: graph.edges.map(x => x.id === edge.id ? { ...x, label: label.trim() } : x) })
      else if (node && label.trim()) commit({ ...graph, nodes: graph.nodes.map(x => x.id === node.id ? { ...x, label: label.trim() } : x) })
    }}><label>{edge ? 'Nome da conexão' : 'Nome do tópico'}<input aria-label={edge ? 'Nome da conexão' : 'Nome do tópico'} maxLength={edge ? 80 : 100} value={label} onChange={e => setLabel(e.target.value)} /></label><button type="submit">Aplicar nome</button></form>}
    {node && <><label>Cor do balão<select value={node.color} onChange={e => commit({ ...graph, nodes: graph.nodes.map(x => x.id === node.id ? { ...x, color: e.target.value as NodeColor } : x) })}>
      {(['neutral', 'blue', 'green', 'orange', 'purple', 'pink'] as const).map((color, i) => <option key={color} value={color}>{['Padrão', 'Azul', 'Verde', 'Laranja', 'Roxo', 'Rosa'][i]}</option>)}
    </select></label><button onClick={onChild}>Adicionar subtópico</button><button onClick={onConnect}>Conectar a outro balão</button></>}
    {edge && <><button onClick={onAddBend} disabled={(edge.bends?.length ?? 0) >= 24}>Adicionar ponto de dobra</button><small>Arraste o ponto pela grade. Duplo clique no ponto para removê-lo.</small></>}
    {(!node?.hostId || edge) && <button onClick={onDelete}>Excluir {edge ? 'conexão' : 'tópico'}</button>}
    {node?.hostId && <small>Nome e endereço do dispositivo são editados em Dispositivos. A cor do ponto indica o status ICMP.</small>}
  </aside>
}
