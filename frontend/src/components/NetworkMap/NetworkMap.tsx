import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Network, Plus, Minus, Maximize, Undo2, Redo2, Save, MousePointer2, Link2, Hand } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import type { Graph, MapNode, MapSide, Viewport } from '../../types/topology'
import { useTopology } from '../../hooks/useTopology'
import { GRID, connectNodes, edgePoints, edgeRoute, fitNodes, initialGraph, insertBend, snap, snapPoint, uniqueId, worldPoint, zoomAt } from '../../utils/topology'
import { formatLatency } from '../../utils/formatters'
import { MapInspector } from './MapInspector'
import styles from './NetworkMap.module.css'

interface Props { hosts: HostSnapshot[]; visibleIds: string[]; ready: boolean; tv: boolean; onDetails: (id: string) => void; onDevices: () => void; onExitTv: () => void }
type Gesture = { pointer: number; startX: number; startY: number; view: Viewport; graph: Graph; ids: string[]; bend?: { edgeId: string; index: number }; moved: boolean; capture: Element }
export function NetworkMap({ hosts, visibleIds, ready, tv, onDetails, onDevices, onExitTv }: Props) {
  const editor = useTopology(hosts, ready)
  const [view, setView] = useState<Viewport>({ x: 50, y: 50, zoom: .8 })
  const [selected, setSelected] = useState<string[]>([])
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<{ id: string; side?: MapSide } | null>(null)
  const [tool, setTool] = useState<'select' | 'pan'>('select')
  const [locked, setLocked] = useState(false)
  const [preview, setPreview] = useState<Graph | null>(null)
  const [hint, setHint] = useState('')
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const didFit = useRef(false)
  const lastFitKey = useRef('')
  const graph = preview ?? editor.graph
  const editable = !tv && !locked && !editor.busy
  const hostMap = useMemo(() => new Map(hosts.map(h => [h.id, h])), [hosts])
  const visibleSet = new Set(visibleIds)
  const nodes = graph?.nodes.filter(n => !n.hostId || visibleSet.has(n.hostId)) ?? []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges = graph?.edges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target)) ?? []
  const node = nodes.find(n => selected.length === 1 && selected[0] === n.id)
  const edge = edges.find(e => e.id === edgeId)
  const visibleKey = [...visibleIds].sort().join('|')
  const fit = () => {
    if (canvas.current) setView(fitNodes(nodes, canvas.current.clientWidth, canvas.current.clientHeight))
  }
  useEffect(() => {
    if (!tv) return
    const update = () => { if (canvas.current && graph) setView(fitNodes(graph.nodes.filter(n => !n.hostId || visibleSet.has(n.hostId)), canvas.current.clientWidth, canvas.current.clientHeight)) }
    const frame = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    document.addEventListener('fullscreenchange', update)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); document.removeEventListener('fullscreenchange', update) }
  // Refit on entering TV mode; regular map editing should retain the user's camera.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tv])
  // Fit once on opening; later monitoring snapshots never disturb a user's camera.
  useEffect(() => {
    if (!graph || !canvas.current) return
    if (!didFit.current || (tv && lastFitKey.current !== visibleKey)) {
      const displayed = graph.nodes.filter(n => !n.hostId || visibleKey.split('|').includes(n.hostId))
      setView(fitNodes(displayed, canvas.current.clientWidth, canvas.current.clientHeight)); didFit.current = true; lastFitKey.current = visibleKey
    }
  }, [graph, tv, visibleKey])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('[aria-label="Elemento selecionado"]')) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      setView(v => zoomAt(v, v.zoom * Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const addTopic = (parent?: MapNode, point?: { x: number; y: number }) => {
    if (!editor.graph || !editable) return
    if (editor.graph.nodes.length >= 600) { setHint('Limite de 600 balões atingido.'); return }
    const id = uniqueId(), center = point ?? worldPoint({ x: (canvas.current?.clientWidth ?? 800) / 2, y: (canvas.current?.clientHeight ?? 600) / 2 }, view)
    let next: Graph = { ...editor.graph, nodes: [...editor.graph.nodes, { id, label: 'Novo tópico', color: parent?.color ?? 'blue',
      x: snap(parent ? parent.x + 312 : center.x - 108), y: snap(parent ? parent.y + 144 : center.y - 48) }] }
    if (parent) next = connectNodes(next, parent.id, id, uniqueId())
    editor.commit(next); setSelected([id]); setEdgeId(null); setConnecting(null)
  }
  const remove = () => {
    if (!editor.graph || !editable) return
    const removable = new Set(editor.graph.nodes.filter(n => selected.includes(n.id) && !n.hostId).map(n => n.id))
    editor.commit({ nodes: editor.graph.nodes.filter(n => !removable.has(n.id)), edges: editor.graph.edges.filter(e => e.id !== edgeId && !removable.has(e.source) && !removable.has(e.target)) })
    if (selected.some(id => editor.graph!.nodes.some(n => n.id === id && n.hostId))) setHint('Remova ou oculte dispositivos em Dispositivos.')
    setSelected([]); setEdgeId(null)
  }
  const start = (event: ReactPointerEvent, id?: string) => {
    if (!editor.graph || event.button !== 0 || gesture.current) return
    event.stopPropagation()
    canvas.current?.focus({ preventScroll: true })
    if (connecting && id && editable) {
      editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side)); setConnecting(null); return
    }
    const dragging = id && editable && tool === 'select'
    let ids = dragging ? (selected.includes(id) ? selected : event.shiftKey ? [...selected, id] : [id]) : []
    if (dragging && event.shiftKey && selected.includes(id)) ids = selected.filter(x => x !== id)
    if (dragging) { setSelected(ids); setEdgeId(null) }
    else if (!id) { setSelected([]); setEdgeId(null) }
    gesture.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, view, graph: editor.graph, ids, moved: false, capture: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startBend = (event: ReactPointerEvent<SVGCircleElement>, edgeId: string, index: number) => {
    if (!editor.graph || !editable || gesture.current || event.button !== 0) return
    event.stopPropagation()
    setEdgeId(edgeId); setSelected([])
    gesture.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      view, graph: editor.graph, ids: [], bend: { edgeId, index }, moved: false, capture: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveBend = (original: Graph, edgeId: string, index: number, dx: number, dy: number, zoom: number) => ({ ...original,
    edges: original.edges.map(edge => edge.id !== edgeId ? edge : ({ ...edge, bends: edge.bends?.map((point, i) => i === index ? snapPoint({ x: point.x + dx / zoom, y: point.y + dy / zoom }) : point) })) })
  const move = (event: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY
    if (Math.hypot(dx, dy) < 3 && !g.moved) return
    g.moved = true
    if (g.bend) setPreview(moveBend(g.graph, g.bend.edgeId, g.bend.index, dx, dy, g.view.zoom))
    else if (!g.ids.length) setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
    else setPreview({ ...g.graph, nodes: g.graph.nodes.map(n => g.ids.includes(n.id) ? { ...n, x: snap(n.x + dx / g.view.zoom), y: snap(n.y + dy / g.view.zoom) } : n) })
  }
  const end = (event: ReactPointerEvent, cancelled = false) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    if (!cancelled && g.moved && g.bend) editor.commit(moveBend(g.graph, g.bend.edgeId, g.bend.index, event.clientX - g.startX, event.clientY - g.startY, g.view.zoom))
    else if (!cancelled && g.moved && g.ids.length) {
      const dx = (event.clientX - g.startX) / g.view.zoom, dy = (event.clientY - g.startY) / g.view.zoom
      editor.commit({ ...g.graph, nodes: g.graph.nodes.map(n => g.ids.includes(n.id) ? { ...n, x: snap(n.x + dx), y: snap(n.y + dy) } : n) })
    }
    gesture.current = null; setPreview(null)
    if (g.capture.hasPointerCapture(event.pointerId)) g.capture.releasePointerCapture(event.pointerId)
  }
  const zoom = (factor: number) => setView(v => zoomAt(v, v.zoom * factor, { x: (canvas.current?.clientWidth ?? 800) / 2, y: (canvas.current?.clientHeight ?? 600) / 2 }))
  const choose = (id: string) => {
    if (connecting && editable && editor.graph) { editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side)); setConnecting(null) }
    else { setSelected([id]); setEdgeId(null) }
  }
  const selectPort = (id: string, side: MapSide) => {
    if (!editable || !editor.graph) return
    if (connecting && connecting.id !== id) {
      editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side, side)); setConnecting(null)
    } else setConnecting(connecting?.id === id && connecting.side === side ? null : { id, side })
    setSelected([id]); setEdgeId(null)
  }
  const addBend = (raw?: { x: number; y: number }) => {
    if (!editor.graph || !edge || !editable) return
    const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
    if (!source || !target) return
    const points = edgePoints(source, target, edge)
    let start = points[0]!, end = points[1]!, distance = -1
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!, d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d > distance) { distance = d; start = a; end = b }
    }
    const point = raw ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    editor.commit({ ...editor.graph, edges: editor.graph.edges.map(e => e.id === edge.id ? insertBend(e, source, target, point) : e) })
  }
  return <section id="infrastructure-map" className={styles.map} data-tv={tv} aria-label="Mapa interativo da rede" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea')) return
    if (event.key === 'Escape') { setConnecting(null); setSelected([]); setEdgeId(null); return }
    if (!editable || !editor.graph) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void editor.save() }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
    else if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && node) { setConnecting({ id: node.id }) }
    else if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addTopic(event.shiftKey ? node : undefined) }
    else if (event.key.startsWith('Arrow') && selected.length) {
      event.preventDefault(); const step = event.shiftKey ? 40 : 10
      editor.commit({ ...editor.graph, nodes: editor.graph.nodes.map(n => !selected.includes(n.id) ? n : { ...n,
        x: snap(n.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
        y: snap(n.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)) }) })
    }
  }}>
    <header className={styles.toolbar}>
      <div className={styles.brand}><Network size={19} /><strong>Mapa da rede</strong><span>{nodes.length} balões</span></div>
      <div className={styles.tools}>
        <button aria-label="Selecionar e arrastar balões" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
        <button aria-label="Mover o mapa" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}><Hand size={17} /></button>
        <button disabled={!editable || !graph} onClick={() => addTopic()}><Plus size={16} /> Tópico</button>
        <button disabled={!editable || !node} aria-pressed={Boolean(connecting)} onClick={() => setConnecting(connecting ? null : node ? { id: node.id } : null)}><Link2 size={16} /> Conectar</button>
        <button disabled={!editable || !editor.canUndo} aria-label="Desfazer" onClick={editor.undo}><Undo2 size={17} /></button>
        <button disabled={!editable || !editor.canRedo} aria-label="Refazer" onClick={editor.redo}><Redo2 size={17} /></button>
        {!tv && <button onClick={() => { setLocked(!locked); setConnecting(null) }} aria-pressed={locked}>{locked ? 'Editar mapa' : 'Bloquear edição'}</button>}
        <button className={styles.save} disabled={!editor.dirty || editor.busy || tv} onClick={() => void editor.save()}><Save size={16} />{editor.busy ? 'Aguarde…' : 'Salvar mapa'}</button>
      </div>
    </header>
    <div className={styles.status}>
      <span>{tv ? 'Apresentação • edição bloqueada' : editor.dirty ? 'Alterações não salvas' : 'Mapa salvo no servidor'}</span>
      <button disabled={editor.busy} onClick={() => { if (!editor.dirty || window.confirm('Descartar alterações locais e recarregar o mapa salvo?')) { didFit.current = false; void editor.load() } }}>Recarregar</button>
        <button onClick={onDevices}>Gerenciar dispositivos</button>
      <button disabled={!editable || !graph} onClick={() => {
        if (!editor.graph || !window.confirm('Reorganizar as posições por setor? Tópicos e conexões personalizados serão preservados.')) return
        const layout = initialGraph(hosts), positions = new Map(layout.nodes.map(n => [n.id, n]))
        editor.commit({ ...editor.graph, nodes: editor.graph.nodes.map((n, i) => ({ ...n, x: snap(positions.get(n.id)?.x ?? 1100 + Math.floor(i / 8) * 312), y: snap(positions.get(n.id)?.y ?? (i % 8) * 144) })) })
      }}>Organizar por setor</button>
    </div>
    {!tv && editor.error && <p className={styles.message} role="alert">{editor.error} As alterações locais foram mantidas.</p>}
    {!tv && hint && <p className={styles.message} role="status">{hint} <button onClick={() => setHint('')}>Fechar</button></p>}
    {connecting && editable && <p className={styles.message} role="status">Clique no balão de destino para conectar. Esc cancela.</p>}
    {tv && <button type="button" className={styles.exitTv} onClick={onExitTv}>Sair do modo TV</button>}
    <div ref={canvas} className={styles.canvas} tabIndex={0} aria-label="Área do mapa: arraste balões ou o fundo, use a roda para zoom" data-tool={tool} data-locked={!editable}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px` }}
      onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)}
      onDoubleClick={e => {
        if (e.target !== canvas.current || !editable) return
        const rect = canvas.current.getBoundingClientRect()
        addTopic(undefined, worldPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view))
      }}>
      {!graph && <p className={styles.loading}>{editor.busy ? 'Carregando o mapa…' : ready ? 'Recarregue para tentar abrir o mapa.' : 'Aguardando o monitoramento…'}</p>}
      {graph && !nodes.length && <p className={styles.loading}>Nenhum dispositivo visível. Cadastre dispositivos ou adicione um tópico.</p>}
      <div className={styles.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className={styles.edges} aria-label="Conexões do mapa">
          {edges.map(e => {
            const curve = edgeRoute(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
            return <g key={e.id} data-selected={e.id === edgeId}>
              <path className={styles.edgeLine} d={curve.path} />
              <path className={styles.edgeHit} d={curve.path} role="button" tabIndex={0} aria-label={`Conexão ${e.label || `${nodeMap.get(e.source)!.label} para ${nodeMap.get(e.target)!.label}`}`}
                onPointerDown={event => { event.stopPropagation(); setEdgeId(e.id); setSelected([]) }}
                onDoubleClick={event => {
                  event.stopPropagation()
                  if (!editable || !editor.graph) return
                  const rect = canvas.current!.getBoundingClientRect()
                  const point = worldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, view)
                  editor.commit({ ...editor.graph, edges: editor.graph.edges.map(item => item.id === e.id ? insertBend(item, nodeMap.get(e.source)!, nodeMap.get(e.target)!, point) : item) })
                }}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEdgeId(e.id); setSelected([]) } }} />
              {e.label && <text x={curve.x} y={curve.y - 10} textAnchor="middle" className={styles.edgeLabel}>{e.label}</text>}
              {e.id === edgeId && editable && e.bends?.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={10} className={styles.bend}
                role="button" tabIndex={0} aria-label={`Ponto ${index + 1} da conexão; arraste para ajustar, Delete para remover`}
                onPointerDown={event => startBend(event, e.id, index)}
                onDoubleClick={event => { event.stopPropagation(); editor.commit({ ...editor.graph!, edges: editor.graph!.edges.map(item => item.id === e.id ? { ...item, bends: item.bends?.filter((_, i) => i !== index) } : item) }) }}
                onKeyDown={event => { if (event.key === 'Delete' || event.key === 'Backspace') { event.stopPropagation(); event.preventDefault(); editor.commit({ ...editor.graph!, edges: editor.graph!.edges.map(item => item.id === e.id ? { ...item, bends: item.bends?.filter((_, i) => i !== index) } : item) }) } }} />)}
            </g>
          })}
        </svg>
        {nodes.map(n => {
          const host = n.hostId ? hostMap.get(n.hostId) : undefined
          const status = host?.suspended ?? (host ? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status] : 'Tópico')
          return <div key={n.id} className={styles.node} data-color={n.color} data-selected={selected.includes(n.id)} data-source={connecting?.id === n.id} data-node-id={n.id}
            style={{ left: n.x, top: n.y }} role="button" tabIndex={0} aria-label={`${host?.name ?? n.label}, ${status}`} aria-pressed={selected.includes(n.id)}
            onPointerDown={e => start(e, n.id)} onDoubleClick={e => { e.stopPropagation(); if (host) onDetails(host.id); else choose(n.id) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(n.id) } }}>
            <span className={styles.nodeTitle}><i className={styles.dot} data-status={host?.suspended ? 'unknown' : host?.status ?? 'topic'} /><strong>{host?.name ?? n.label}</strong></span>
            <span className={styles.address}>{host?.address ?? 'Tópico de organização'}</span>
            <span className={styles.nodeBottom}><span>{status}</span>{host && <b>{formatLatency(host.latencyMs)}</b>}</span>
            {editable && (['top', 'right', 'bottom', 'left'] as const).map(side => <button key={side} type="button" className={styles.port} data-side={side} title={`Conectar pelo lado ${ { top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
              aria-label={`Conectar ${n.label} pelo lado ${ { top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
              aria-pressed={connecting?.id === n.id && connecting.side === side}
              onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); selectPort(n.id, side) }}><Plus size={13} /></button>)}
          </div>
        })}
      </div>
      {editable && graph && (node || edge) && <div onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><MapInspector key={`${node?.id ?? edge?.id}:${node?.label ?? edge?.label}`} node={node} edge={edge} graph={graph} host={node?.hostId ? hostMap.get(node.hostId) : undefined} commit={editor.commit} onDetails={onDetails} onConnect={() => setConnecting(node ? { id: node.id } : null)} onChild={() => addTopic(node)} onDelete={remove} onAddBend={() => addBend()} /></div>}
      <div className={styles.zoom} onPointerDown={e => e.stopPropagation()}>
        <button aria-label="Diminuir zoom" onClick={() => zoom(1 / 1.2)}><Minus size={17} /></button><span>{Math.round(view.zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" onClick={() => zoom(1.2)}><Plus size={17} /></button><button aria-label="Enquadrar mapa" onClick={fit}><Maximize size={17} /></button>
      </div>
    </div>
    <footer className={styles.help}><span>Arraste balões ou o fundo • Duplo clique na linha: criar dobra • Arraste o ponto azul para ajustar • Duplo clique no ponto: remover</span>
      <details><summary>Atalhos e informações</summary><p>N: tópico • Shift + N: subtópico • C: conectar • setas: mover seleção • Delete: excluir tópico/conexão • Ctrl + Z / Ctrl + Shift + Z: desfazer/refazer • Ctrl + S: salvar.</p><p>Conexões são organizadas manualmente e não comprovam ligações físicas descobertas por ping. Salve para compartilhar o mapa com outras telas.</p></details>
    </footer>
  </section>
}
