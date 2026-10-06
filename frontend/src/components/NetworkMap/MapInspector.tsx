import { MapTextBlocks } from './MapTextBlocks'
import { MapEdgeProperties } from './MapEdgeProperties'
import { ColorControl } from './ColorControl'
import { readableText } from '../../features/topology/domain/colors'
import { useState } from 'react'
import type {
  Graph,
  MapEdge,
  MapNode,
  NodeColor,
  NodeShape,
  MapText,
  TextAlign,
} from '../../types/topology'
import type { HostSnapshot } from '../../types/monitor'
import { snap, nodeSize } from '../../utils/topology'
import styles from './NetworkMap.module.css'

const shapes: { value: NodeShape; label: string }[] = [
  { value: 'rounded', label: 'Retângulo arredondado' },
  { value: 'rectangle', label: 'Retângulo' },
  { value: 'pill', label: 'Cápsula' },
  { value: 'ellipse', label: 'Elipse' },
  { value: 'circle', label: 'Círculo' },
  { value: 'cloud', label: 'Nuvem' },
  { value: 'diamond', label: 'Losango' },
]
interface Props {
  node?: MapNode
  edge?: MapEdge
  graph: Graph
  host?: HostSnapshot
  commit: (g: Graph) => void
  onDetails: (id: string) => void
  onConnect: () => void
  onChild: () => void
  onDelete: () => void
  onAddBend: () => void
  onRegister: (name: string, address: string) => Promise<void>
}
export function MapInspector({
  node,
  edge,
  graph,
  host,
  commit,
  onDetails,
  onConnect,
  onChild,
  onDelete,
  onAddBend,
  onRegister,
}: Props) {
  const [subtitle, setSubtitle] = useState(node?.subtitle ?? 'Tópico de organização')
  const [caption, setCaption] = useState(node?.caption ?? 'Tópico')
  const [texts, setTexts] = useState<MapText[]>(node?.texts ?? [])
  const [address, setAddress] = useState('')
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState(edge?.label ?? node?.label ?? '')
  const changeNode = (changes: Partial<MapNode>) => {
    if (node)
      commit({
        ...graph,
        nodes: graph.nodes.map((x) => (x.id === node.id ? { ...x, ...changes } : x)),
      })
  }
  const changeEdge = (changes: Partial<MapEdge>) => {
    if (edge)
      commit({
        ...graph,
        edges: graph.edges.map((x) => (x.id === edge.id ? { ...x, ...changes } : x)),
      })
  }
  const dimensions = node ? nodeSize(node) : null
  if (node?.kind === 'junction')
    return (
      <aside className={styles.inspector} onPointerDown={(e) => e.stopPropagation()}>
        <strong>Junção de conexões</strong>
        <p>
          Arraste o ponto para ajustar a ramificação. Os + nas linhas criam novas junções com
          espaçamento.
        </p>
        <ColorControl
          label="Cor da junção"
          value={node.outline}
          fallback="#303237"
          onChange={(outline) => changeNode({ outline })}
          onClear={() => changeNode({ outline: undefined })}
          presets
        />
        <button onClick={onConnect}>Conectar</button>
        <button onClick={onDelete}>Remover junção e suas ligações</button>
      </aside>
    )
  return (
    <aside
      className={styles.inspector}
      aria-label="Elemento selecionado"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <strong>{edge ? 'Conexão' : host ? host.name : 'Tópico'}</strong>
      {host && (
        <>
          <span>Endereço disponível nos detalhes</span>
          <span>
            {host.suspended ??
              { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status]}
          </span>
          <button onClick={() => onDetails(host.id)}>Abrir status e histórico</button>
        </>
      )}
      {(!node?.hostId || edge) && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (edge) changeEdge({ label: label.trim() })
            else if (label.trim()) changeNode({ label: label.trim(), subtitle, caption, texts })
          }}
        >
          <label>
            {edge ? 'Nome da conexão' : 'Nome do tópico'}
            <textarea
              rows={3}
              maxLength={edge ? 80 : 1000}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          {node && (
            <>
              <label>
                Subtítulo (vazio para ocultar)
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </label>
              <label>
                Texto inferior (vazio para ocultar)
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
            </>
          )}
          <button type="submit">Aplicar textos</button>
        </form>
      )}
      {node && !node.hostId && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setRegistering(true)
            setError('')
            try {
              await onRegister(label.trim() || node.label, address.trim())
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Não foi possível cadastrar')
            } finally {
              setRegistering(false)
            }
          }}
        >
          <label>
            IP ou hostname para monitorar
            <input
              required
              maxLength={253}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <button disabled={registering} type="submit">
            {registering ? 'Cadastrando…' : 'Cadastrar dispositivo neste balão'}
          </button>
          {error && <small role="alert">{error}</small>}
        </form>
      )}
      {node && (
        <>
          <label>
            Alinhamento dos textos
            <select
              value={
                node.textAlign ??
                (['ellipse', 'circle', 'cloud', 'diamond'].includes(node.shape ?? '')
                  ? 'center'
                  : 'left')
              }
              onChange={(e) => changeNode({ textAlign: e.target.value as TextAlign })}
            >
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <MapTextBlocks
            texts={texts}
            setTexts={setTexts}
            onApply={() =>
              changeNode({
                texts,
                ...(!node.hostId && label.trim() ? { label: label.trim(), subtitle, caption } : {}),
              })
            }
          />
          <small>
            Se faltar espaço para novos pontos de ligação, aumente a largura ou a altura do
            elemento.
          </small>
          <label>
            Forma
            <select
              value={node.shape ?? 'rounded'}
              onChange={(e) =>
                changeNode({
                  shape: e.target.value as NodeShape,
                  width: undefined,
                  height: undefined,
                })
              }
            >
              {shapes.map((shape) => (
                <option key={shape.value} value={shape.value}>
                  {shape.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.dimensions}>
            <label>
              Largura
              <input
                type="number"
                min={96}
                max={576}
                step={12}
                value={dimensions!.width}
                onChange={(e) => {
                  const width = Number(e.target.value)
                  if (width >= 96 && width <= 576) changeNode({ width: snap(width) })
                }}
              />
            </label>
            <label>
              Altura
              <input
                type="number"
                min={72}
                max={576}
                step={12}
                value={dimensions!.height}
                onChange={(e) => {
                  const height = Number(e.target.value)
                  if (height >= 72 && height <= 576) changeNode({ height: snap(height) })
                }}
              />
            </label>
          </div>
          <label>
            Cor de referência
            <select
              value={node.color}
              onChange={(e) => changeNode({ color: e.target.value as NodeColor })}
            >
              {(['neutral', 'blue', 'green', 'orange', 'purple', 'pink'] as const).map(
                (color, i) => (
                  <option key={color} value={color}>
                    {['Padrão', 'Azul', 'Verde', 'Laranja', 'Roxo', 'Rosa'][i]}
                  </option>
                ),
              )}
            </select>
          </label>
          <ColorControl
            label="Preenchimento"
            value={node.fill}
            fallback="#ffffff"
            presets
            onChange={(fill) => changeNode({ fill, textColor: readableText(fill) })}
            onClear={() => changeNode({ fill: undefined, textColor: undefined })}
          />
          <ColorControl
            label="Borda"
            value={node.outline}
            fallback="#6a9ec4"
            onChange={(outline) => changeNode({ outline })}
            onClear={() => changeNode({ outline: undefined })}
          />
          <ColorControl
            label="Texto"
            value={node.textColor}
            fallback="#202124"
            onChange={(textColor) => changeNode({ textColor })}
            onClear={() => changeNode({ textColor: undefined })}
          />
          <button onClick={onChild}>Adicionar subtópico</button>
          <button onClick={onConnect}>Conectar a outro balão</button>
        </>
      )}
      {edge && (
        <MapEdgeProperties edge={edge} graph={graph} onChange={changeEdge} onAddBend={onAddBend} />
      )}
      {(!node?.hostId || edge) && (
        <button onClick={onDelete}>Excluir {edge ? 'conexão' : 'tópico'}</button>
      )}
      {node?.hostId && (
        <small>
          Nome e endereço são editados em Dispositivos. A cor do ponto indica o status ICMP.
        </small>
      )}
    </aside>
  )
}
