import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Network, Plus, Minus, Maximize, Undo2, Redo2, Save, MousePointer2, Link2, Hand } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import type { Graph, MapNode, Viewport } from '../../types/topology'
import { useTopology } from '../../hooks/useTopology'
import { clampCoordinate, connectNodes, edgeCurve, fitNodes, initialGraph, uniqueId, worldPoint, zoomAt } from '../../utils/topology'
import { formatLatency } from '../../utils/formatters'
import { MapInspector } from './MapInspector'
import styles from './NetworkMap.module.css'

interface Props { hosts: HostSnapshot[]; visibleIds: string[]; ready: boolean; active: boolean; tv: boolean; onDetails: (id: string) => void; onSettings: () => void }
type Gesture = { pointer: number; startX: number; startY: number; view: Viewport; graph: Graph; ids: string[]; moved: boolean; capture: Element }
export function NetworkMap({ hosts, visibleIds, ready, active, tv, onDetails, onSettings }: Props) {
  const editor = useTopology(hosts, ready)
  const [view, setView] = useState<Viewport>({ x: 50, y: 50, zoom: .8 })
  const [selected, setSelected] = useState<string[]>([])
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
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
  // Fit once on opening; later monitoring snapshots never disturb a user's camera.
  useEffect(() => {
    if (!active || !graph || !canvas.current) return
    if (!didFit.current || (tv && lastFitKey.current !== visibleKey)) {
      const displayed = graph.nodes.filter(n => !n.hostId || visibleKey.split('|').includes(n.hostId))
      setView(fitNodes(displayed, canvas.current.clientWidth, canvas.current.clientHeight)); didFit.current = true; lastFitKey.current = visibleKey
    }
  }, [active, graph, tv, visibleKey])
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
      x: clampCoordinate(parent ? parent.x + 320 : center.x - 112), y: clampCoordinate(parent ? parent.y + 140 : center.y - 50) }] }
    if (parent) next = connectNodes(next, parent.id, id, uniqueId())
    editor.commit(next); setSelected([id]); setEdgeId(null); setConnecting(null)
  }
  const remove = () => {
    if (!editor.graph || !editable) return
    const removable = new Set(editor.graph.nodes.filter(n => selected.includes(n.id) && !n.hostId).map(n => n.id))
    editor.commit({ nodes: editor.graph.nodes.filter(n => !removable.has(n.id)), edges: editor.graph.edges.filter(e => e.id !== edgeId && !removable.has(e.source) && !removable.has(e.target)) })
    if (selected.some(id => editor.graph!.nodes.some(n => n.id === id && n.hostId))) setHint('Dispositivos são removidos pelo cadastro. Você pode ocultá-los deste painel nas configurações.')
    setSelected([]); setEdgeId(null)
  }
  const start = (event: ReactPointerEvent, id?: string) => {
    if (!editor.graph || event.button !== 0 || gesture.current) return
    event.stopPropagation()
    canvas.current?.focus({ preventScroll: true })
    if (connecting && id && editable) {
      editor.commit(connectNodes(editor.graph, connecting, id, uniqueId())); setConnecting(null); return
    }
    const dragging = id && editable && tool === 'select'
    let ids = dragging ? (selected.includes(id) ? selected : event.shiftKey ? [...selected, id] : [id]) : []
    if (dragging && event.shiftKey && selected.includes(id)) ids = selected.filter(x => x !== id)
    if (dragging) { setSelected(ids); setEdgeId(null) }
    else if (!id) { setSelected([]); setEdgeId(null) }
    gesture.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, view, graph: editor.graph, ids, moved: false, capture: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY
    if (Math.hypot(dx, dy) < 3 && !g.moved) return
    g.moved = true
    if (!g.ids.length) setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
    else setPreview({ ...g.graph, nodes: g.graph.nodes.map(n => g.ids.includes(n.id) ? { ...n, x: clampCoordinate(n.x + dx / g.view.zoom), y: clampCoordinate(n.y + dy / g.view.zoom) } : n) })
  }
  const end = (event: ReactPointerEvent, cancelled = false) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    if (!cancelled && g.moved && g.ids.length) {
      const dx = (event.clientX - g.startX) / g.view.zoom, dy = (event.clientY - g.startY) / g.view.zoom
      editor.commit({ ...g.graph, nodes: g.graph.nodes.map(n => g.ids.includes(n.id) ? { ...n, x: clampCoordinate(n.x + dx), y: clampCoordinate(n.y + dy) } : n) })
    }
    gesture.current = null; setPreview(null)
    if (g.capture.hasPointerCapture(event.pointerId)) g.capture.releasePointerCapture(event.pointerId)
  }
  const zoom = (factor: number) => setView(v => zoomAt(v, v.zoom * factor, { x: (canvas.current?.clientWidth ?? 800) / 2, y: (canvas.current?.clientHeight ?? 600) / 2 }))
  const choose = (id: string) => {
    if (connecting && editable && editor.graph) { editor.commit(connectNodes(editor.graph, connecting, id, uniqueId())); setConnecting(null) }
    else { setSelected([id]); setEdgeId(null) }
  }
  return <section className={styles.map} aria-label="Mapa interativo da rede" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea') || !active) return
    if (event.key === 'Escape') { setConnecting(null); setSelected([]); setEdgeId(null); return }
    if (!editable || !editor.graph) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void editor.save() }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
    else if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && node) { setConnecting(node.id) }
    else if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addTopic(event.shiftKey ? node : undefined) }
    else if (event.key.startsWith('Arrow') && selected.length) {
      event.preventDefault(); const step = event.shiftKey ? 40 : 10
      editor.commit({ ...editor.graph, nodes: editor.graph.nodes.map(n => !selected.includes(n.id) ? n : { ...n,
        x: clampCoordinate(n.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
        y: clampCoordinate(n.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)) }) })
    }
  }}>
    <header className={styles.toolbar}>
      <div className={styles.brand}><Network size={19} /><strong>Mapa da rede</strong><span>{nodes.length} balões</span></div>
      <div className={styles.tools}>
        <button aria-label="Selecionar e arrastar balões" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
        <button aria-label="Mover o mapa" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}><Hand size={17} /></button>
        <button disabled={!editable || !graph} onClick={() => addTopic()}><Plus size={16} /> Tópico</button>
        <button disabled={!editable || !node} aria-pressed={Boolean(connecting)} onClick={() => setConnecting(connecting ? null : node?.id ?? null)}><Link2 size={16} /> Conectar</button>
        <button disabled={!editable || !editor.canUndo} aria-label="Desfazer" onClick={editor.undo}><Undo2 size={17} /></button>
        <button disabled={!editable || !editor.canRedo} aria-label="Refazer" onClick={editor.redo}><Redo2 size={17} /></button>
        {!tv && <button onClick={() => { setLocked(!locked); setConnecting(null) }} aria-pressed={locked}>{locked ? 'Editar mapa' : 'Bloquear edição'}</button>}
        <button className={styles.save} disabled={!editor.dirty || editor.busy || tv} onClick={() => void editor.save()}><Save size={16} />{editor.busy ? 'Aguarde…' : 'Salvar mapa'}</button>
      </div>
    </header>
    <div className={styles.status}>
      <span>{tv ? 'Apresentação • edição bloqueada' : editor.dirty ? 'Alterações não salvas' : 'Mapa salvo no servidor'}</span>
      <button disabled={editor.busy} onClick={() => { if (!editor.dirty || window.confirm('Descartar alterações locais e recarregar o mapa salvo?')) { didFit.current = false; void editor.load() } }}>Recarregar</button>
      <button onClick={onSettings}>Cadastrar dispositivo</button>
      <button disabled={!editable || !graph} onClick={() => {
        if (!editor.graph || !window.confirm('Reorganizar as posições por setor? Tópicos e conexões personalizados serão preservados.')) return
        const layout = initialGraph(hosts), positions = new Map(layout.nodes.map(n => [n.id, n]))
        editor.commit({ ...editor.graph, nodes: editor.graph.nodes.map((n, i) => ({ ...n, x: positions.get(n.id)?.x ?? 1100 + Math.floor(i / 8) * 300, y: positions.get(n.id)?.y ?? (i % 8) * 140 })) })
      }}>Organizar por setor</button>
    </div>
    {editor.error && <p className={styles.message} role="alert">{editor.error} As alterações locais foram mantidas.</p>}
    {hint && <p className={styles.message} role="status">{hint} <button onClick={() => setHint('')}>Fechar</button></p>}
    {connecting && editable && <p className={styles.message} role="status">Clique no balão de destino para conectar. Esc cancela.</p>}
    <div ref={canvas} className={styles.canvas} tabIndex={0} aria-label="Área do mapa: arraste balões ou o fundo, use a roda para zoom" data-tool={tool} data-locked={!editable}
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
            const curve = edgeCurve(nodeMap.get(e.source)!, nodeMap.get(e.target)!)
            return <g key={e.id} data-selected={e.id === edgeId}>
              <path className={styles.edgeLine} d={curve.path} />
              <path className={styles.edgeHit} d={curve.path} role="button" tabIndex={0} aria-label={`Conexão ${e.label || `${nodeMap.get(e.source)!.label} para ${nodeMap.get(e.target)!.label}`}`} onPointerDown={event => { event.stopPropagation(); setEdgeId(e.id); setSelected([]) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEdgeId(e.id); setSelected([]) } }} />
              {e.label && <text x={curve.x} y={curve.y - 10} textAnchor="middle" className={styles.edgeLabel}>{e.label}</text>}
            </g>
          })}
        </svg>
        {nodes.map(n => {
          const host = n.hostId ? hostMap.get(n.hostId) : undefined
          const status = host?.suspended ?? (host ? { online: 'On-line', offline: 'Off-line', unknown: 'Verificando' }[host.status] : 'Tópico')
          return <div key={n.id} className={styles.node} data-color={n.color} data-selected={selected.includes(n.id)} data-source={connecting === n.id} data-node-id={n.id}
            style={{ left: n.x, top: n.y }} role="button" tabIndex={0} aria-label={`${host?.name ?? n.label}, ${status}`} aria-pressed={selected.includes(n.id)}
            onPointerDown={e => start(e, n.id)} onDoubleClick={e => { e.stopPropagation(); if (host) onDetails(host.id); else choose(n.id) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(n.id) } }}>
            <span className={styles.nodeTitle}><i className={styles.dot} data-status={host?.suspended ? 'unknown' : host?.status ?? 'topic'} /><strong>{host?.name ?? n.label}</strong></span>
            <span className={styles.address}>{host?.address ?? 'Tópico de organização'}</span>
            <span className={styles.nodeBottom}><span>{status}</span>{host && <b>{formatLatency(host.latencyMs)}</b>}</span>
          </div>
        })}
      </div>
      {editable && graph && (node || edge) && <div onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><MapInspector key={`${node?.id ?? edge?.id}:${node?.label ?? edge?.label}`} node={node} edge={edge} graph={graph} host={node?.hostId ? hostMap.get(node.hostId) : undefined} commit={editor.commit} onDetails={onDetails} onConnect={() => setConnecting(node?.id ?? null)} onChild={() => addTopic(node)} onDelete={remove} /></div>}
      <div className={styles.zoom} onPointerDown={e => e.stopPropagation()}>
        <button aria-label="Diminuir zoom" onClick={() => zoom(1 / 1.2)}><Minus size={17} /></button><span>{Math.round(view.zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" onClick={() => zoom(1.2)}><Plus size={17} /></button><button aria-label="Enquadrar mapa" onClick={fit}><Maximize size={17} /></button>
      </div>
    </div>
    <footer className={styles.help}><span>Arraste balões ou o fundo • Shift + clique: seleção múltipla • roda: zoom • duplo clique no dispositivo: detalhes</span>
      <details><summary>Atalhos e informações</summary><p>N: tópico • Shift + N: subtópico • C: conectar • setas: mover seleção • Delete: excluir tópico/conexão • Ctrl + Z / Ctrl + Shift + Z: desfazer/refazer • Ctrl + S: salvar.</p><p>Conexões são organizadas manualmente e não comprovam ligações físicas descobertas por ping. O desenho inicial agrupa os dispositivos por setor. Salve para compartilhar o mapa com outras telas; recarregue nas demais telas para buscar alterações.</p></details>
    </footer>
  </section>
}
