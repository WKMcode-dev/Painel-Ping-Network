import { useMemo, useState } from 'react'
import type { Graph, MapEdge, MapNode, NodeColor, NodeShape, MapText, TextAlign, MapSide } from '../../types/topology'
import type { HostSnapshot } from '../../types/monitor'
import { nodeSize, uniqueId, resolvedEdges } from '../../utils/topology'
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

interface Props { node?: MapNode; edge?: MapEdge; graph: Graph; host?: HostSnapshot; commit: (g: Graph) => void; onDetails: (id: string) => void; onConnect: () => void; onChild: () => void; onDelete: () => void; onAddBend: () => void; onRegister: (name: string, address: string) => Promise<void> }
export function MapInspector({ node, edge, graph, host, commit, onDetails, onConnect, onChild, onDelete, onAddBend, onRegister }: Props) {
  const [subtitle, setSubtitle] = useState(node?.subtitle ?? 'Tópico de organização')
  const [caption, setCaption] = useState(node?.caption ?? 'Tópico')
  const [texts, setTexts] = useState<MapText[]>(node?.texts ?? [])
  const [address, setAddress] = useState('')
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState(edge?.label ?? node?.label ?? '')
  const changeNode = (changes: Partial<MapNode>) => { if (node) commit({ ...graph, nodes: graph.nodes.map(x => x.id === node.id ? { ...x, ...changes } : x) }) }
  const changeEdge = (changes: Partial<MapEdge>) => { if (edge) commit({ ...graph, edges: graph.edges.map(x => x.id === edge.id ? { ...x, ...changes } : x) }) }
  const edgeGeometry = useMemo(() => edge ? resolvedEdges(graph).find(e => e.id === edge.id) : undefined, [edge, graph])
  const dimensions = node ? nodeSize(node) : null
  if (node?.kind === 'junction') return <aside className={styles.inspector} onPointerDown={e => e.stopPropagation()}><strong>Junção de conexões</strong><p>Arraste o ponto para ajustar a ramificação. Os + nas linhas criam novas junções com espaçamento.</p><ColorControl label="Cor da junção" value={node.outline} fallback="#303237" onChange={outline => changeNode({ outline })} onClear={() => changeNode({ outline: undefined })} presets /><button onClick={onConnect}>Conectar</button><button onClick={onDelete}>Remover junção e suas ligações</button></aside>
  return <aside className={styles.inspector} aria-label="Elemento selecionado" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <strong>{edge ? 'Conexão' : host ? host.name : 'Tópico'}</strong>
    {host && <><span>{host.address}</span><span>{host.suspended ?? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status]}</span><button onClick={() => onDetails(host.id)}>Abrir status e histórico</button></>}
    {(!node?.hostId || edge) && <form onSubmit={e => {
      e.preventDefault()
      if (edge) changeEdge({ label: label.trim() })
      else if (label.trim()) changeNode({ label: label.trim(), subtitle, caption, texts })
    }}><label>{edge ? 'Nome da conexão' : 'Nome do tópico'}<textarea rows={3} maxLength={edge ? 80 : 1000} value={label} onChange={e => setLabel(e.target.value)} /></label>{node && <><label>Subtítulo (vazio para ocultar)<textarea rows={3} maxLength={2000} value={subtitle} onChange={e => setSubtitle(e.target.value)} /></label><label>Texto inferior (vazio para ocultar)<textarea rows={3} maxLength={2000} value={caption} onChange={e => setCaption(e.target.value)} /></label></>}<button type="submit">Aplicar textos</button></form>}
    {node && !node.hostId && <form onSubmit={async e => {
      e.preventDefault(); setRegistering(true); setError('')
      try { await onRegister(label.trim() || node.label, address.trim()) }
      catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível cadastrar') }
      finally { setRegistering(false) }
    }}><label>IP ou hostname para monitorar<input required maxLength={253} value={address} onChange={e => setAddress(e.target.value)} /></label><button disabled={registering} type="submit">{registering ? 'Cadastrando…' : 'Cadastrar dispositivo neste balão'}</button>{error && <small role="alert">{error}</small>}</form>}
    {node && <>
      <label>Alinhamento dos textos<select value={node.textAlign ?? (['ellipse', 'circle', 'cloud', 'diamond'].includes(node.shape ?? '') ? 'center' : 'left')} onChange={e => changeNode({ textAlign: e.target.value as TextAlign })}>
        <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
      </select></label>
      <form onSubmit={e => { e.preventDefault(); changeNode({ texts, ...(!node.hostId && label.trim() ? { label: label.trim(), subtitle, caption } : {}) }) }}>
        <strong>Blocos adicionais</strong>
        {texts.map((text, index) => <fieldset className={styles.textBlockEditor} key={text.id}>
          <legend>Bloco {index + 1}</legend>
          <label>Tipo<select value={text.kind} onChange={e => setTexts(list => list.map(t => t.id === text.id ? { ...t, kind: e.target.value as MapText['kind'] } : t))}>
            <option value="title">Título</option><option value="subtitle">Subtítulo</option><option value="text">Texto</option>
          </select></label>
          <label>Conteúdo<textarea rows={3} maxLength={4000} value={text.text} onChange={e => setTexts(list => list.map(t => t.id === text.id ? { ...t, text: e.target.value } : t))} /></label>
          <label>Alinhamento do bloco<select value={text.align ?? ''} onChange={e => setTexts(list => list.map(t => t.id === text.id ? { ...t, align: (e.target.value || undefined) as TextAlign | undefined } : t))}>
            <option value="">Usar alinhamento do balão</option><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
          </select></label>
          <div className={styles.blockActions}>
            <button type="button" disabled={index === 0} onClick={() => setTexts(list => { const next = [...list]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next })}>Subir</button>
            <button type="button" disabled={index === texts.length - 1} onClick={() => setTexts(list => { const next = [...list]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next })}>Descer</button>
            <button type="button" onClick={() => setTexts(list => list.filter(t => t.id !== text.id))}>Remover</button>
          </div>
        </fieldset>)}
        <button type="button" disabled={texts.length >= 30} onClick={() => setTexts(list => [...list, { id: uniqueId(), kind: 'text', text: '' }])}>Adicionar bloco de texto</button>
        <small>Shift + Enter cria uma nova linha. Clique em Aplicar blocos e depois Salvar mapa. Até 30 blocos por balão.</small>
        <button type="submit">Aplicar blocos</button>
      </form>
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
      <strong>Pontos de ligação</strong>
      {(['source', 'target'] as const).map(end => {
        const resolved = edgeGeometry ?? edge
        const sideKey = end === 'source' ? 'sourceSide' : 'targetSide', offsetKey = end === 'source' ? 'sourceOffset' : 'targetOffset'
        const label = end === 'source' ? 'Saída' : 'Entrada'
        return <div key={end} className={styles.textBlockEditor}>
          <label>Lado da {label.toLowerCase()}<select value={edge[sideKey] ?? ''} onChange={e => changeEdge({ [sideKey]: (e.target.value || undefined) as MapSide | undefined })}>
            <option value="">Automático</option><option value="top">Superior</option><option value="right">Direito</option><option value="bottom">Inferior</option><option value="left">Esquerdo</option>
          </select></label>
          <label>{label}: posição ({Math.round((resolved[offsetKey] ?? .5) * 100)}%)<input type="range" min={5} max={95} value={Math.round((resolved[offsetKey] ?? .5) * 100)} onChange={e => changeEdge({ [offsetKey]: Number(e.target.value) / 100 })} /></label>
          <button type="button" onClick={() => changeEdge({ [offsetKey]: undefined })}>Distribuir automaticamente</button>
        </div>
      })}
      <small>Os pontos automáticos são separados na borda. Use a mesma posição na saída e entrada para desenhar linhas paralelas entre balões alinhados.</small>
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
  return <aside className={styles.inspector} aria-label="Aparência do mapa" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <strong>Aparência do mapa</strong>
    <ColorControl label="Fundo" value={appearance.background} fallback="#ffffff" onChange={background => change({ background })} onClear={() => change({ background: undefined })} />
    <ColorControl label="Grade" value={appearance.gridColor} fallback="#d9d9d9" onChange={gridColor => change({ gridColor })} onClear={() => change({ gridColor: undefined })} />
    <label className={styles.check}><input type="checkbox" checked={appearance.showGrid !== false} onChange={e => change({ showGrid: e.target.checked })} /> Mostrar grade</label>
    <small>As cores e o desenho são compartilhados quando o mapa é salvo.</small>
    <button type="button" onClick={onClose}>Fechar</button>
  </aside>
}
