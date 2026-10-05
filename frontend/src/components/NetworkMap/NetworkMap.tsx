import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { privateLabel } from '../../utils/privacy'
import { Network, Plus, Minus, Maximize, Undo2, Redo2, Save, MousePointer2, Link2, Hand, Palette, Copy, ClipboardPaste } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import type { Graph, MapNode, MapSide, Viewport } from '../../types/topology'
import { useTopology } from '../../hooks/useTopology'
import { allFreePortChoices, junctionPoint, splitConnection, GRID, SNAP_STEP, CLOUD_VIEW_HEIGHT, CLOUD_PATH, anchor, resolvedEdges, freePortOffsets, translateSelection, rectangleSelection, selectionFragment, cloneFragment, branchSelection, connectNodes, edgePoints, edgeRoute, fitNodes, initialGraph, insertBend, nodeSize, snap, snapPoint, uniqueId, worldPoint, zoomAt } from '../../utils/topology'
import { createDevice } from '../../services/monitor-api'
import { wheelNavigation, isPanWheel } from '../../utils/map-navigation'
import { formatLatency } from '../../utils/formatters'
import { MapAppearance, MapInspector } from './MapInspector'
import styles from './NetworkMap.module.css'

interface Props { hosts: HostSnapshot[]; visibleIds: string[]; ready: boolean; tv: boolean; onDetails: (id: string) => void; onDevices: () => void; onExitTv: () => void }
type Gesture = { pointer: number; startX: number; startY: number; view: Viewport; graph: Graph; ids: string[]; mode?: 'pan' | 'marquee' | 'nodes'; additive?: string[]; bend?: { edgeId: string; index: number }; moved: boolean; capture: Element }
export function NetworkMap({ hosts, visibleIds, ready, tv, onDetails, onDevices, onExitTv }: Props) {
  const editor = useTopology(hosts, ready)
  const [view, setView] = useState<Viewport>({ x: 50, y: 50, zoom: .8 })
  const [selected, setSelected] = useState<string[]>([])
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<{ id: string; side?: MapSide; offset?: number } | null>(null)
  const [tool, setTool] = useState<'select' | 'pan'>('select')
  const [wheelPanning, setWheelPanning] = useState(false)
  const [locked, setLocked] = useState(false)
  const [preview, setPreview] = useState<Graph | null>(null)
  const [hint, setHint] = useState('')
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [clipboard, setClipboard] = useState<Graph | null>(null)
  const pasteCount = useRef(0)
  const [pendingHost, setPendingHost] = useState<{ nodeId: string; hostId: string } | null>(null)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
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
  const routedEdges = useMemo(() => graph ? resolvedEdges(graph) : [], [graph])
  const portChoices = useMemo(() => allFreePortChoices(routedEdges, graph?.nodes), [routedEdges, graph])
  const freePorts = useMemo(() => freePortOffsets(routedEdges), [routedEdges])
  const freePort = (id: string, side: MapSide) => freePorts.get(`${id}:${side}`) ?? .5
  const edges = routedEdges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
  const node = nodes.find(n => selected.length === 1 && selected[0] === n.id)
  const edge = graph?.edges.find(e => e.id === edgeId)
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
    let idle: ReturnType<typeof setTimeout> | undefined
    const wheel = (event: WheelEvent) => {
      const target = event.target as Element
      if (target.closest('aside,button,input,select,textarea')) return
      const text = target.closest('[data-map-text]')
      if (text && text.scrollHeight > text.clientHeight) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (gesture.current) return
      clearTimeout(idle)
      setWheelPanning(isPanWheel(event))
      idle = setTimeout(() => setWheelPanning(false), 160)
      setView(v => wheelNavigation(v, event, { x: event.clientX - rect.left, y: event.clientY - rect.top }, element.clientHeight).view)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { clearTimeout(idle); element.removeEventListener('wheel', wheel) }
  }, [])
  const addTopic = (parent?: MapNode, point?: { x: number; y: number }) => {
    if (!editor.graph || !editable) return
    if (editor.graph.nodes.length >= 600) { setHint('Limite de 600 balões atingido.'); return }
    const id = uniqueId(), center = point ?? worldPoint({ x: (canvas.current?.clientWidth ?? 800) / 2, y: (canvas.current?.clientHeight ?? 600) / 2 }, view)
    let next: Graph = { ...editor.graph, nodes: [...editor.graph.nodes, { id, label: 'Novo tópico', color: parent?.color ?? 'blue',
      x: snap(parent ? parent.x + nodeSize(parent).width + 96 : center.x - 108), y: snap(parent ? parent.y + nodeSize(parent).height + 48 : center.y - 48) }] }
    if (parent) next = connectNodes(next, parent.id, id, uniqueId())
    editor.commit(next); setSelected([id]); setEdgeId(null); setConnecting(null)
    setAppearanceOpen(false)
  }
  const remove = () => {
    if (!editor.graph || !editable) return
    const removable = new Set(editor.graph.nodes.filter(n => selected.includes(n.id) && !n.hostId).map(n => n.id))
    editor.commit({ ...editor.graph, nodes: editor.graph.nodes.filter(n => !removable.has(n.id)), edges: editor.graph.edges.filter(e => e.id !== edgeId && !removable.has(e.source) && !removable.has(e.target)) })
    if (selected.some(id => editor.graph!.nodes.some(n => n.id === id && n.hostId))) setHint('Remova ou oculte dispositivos em Dispositivos.')
    setSelected([]); setEdgeId(null)
  }
  // Registration becomes a binding only once the monitoring snapshot knows the new device.
  useEffect(() => {
    if (!pendingHost || !editor.graph || !hosts.some(h => h.id === pendingHost.hostId)) return
    const host = hosts.find(h => h.id === pendingHost.hostId)!
    editor.commit({ ...editor.graph, nodes: editor.graph.nodes.filter(n => n.hostId !== host.id).map(n => n.id === pendingHost.nodeId ? { ...n, hostId: host.id, label: host.name } : n) })
    setPendingHost(null)
  }, [pendingHost, hosts, editor])
  const register = async (name: string, address: string) => {
    if (!node || !editable || pendingHost) throw new Error('Aguarde a atualização do monitoramento.')
    const device = await createDevice({ name, address, group: 'Geral', location: '', description: '', enabled: true, maintenanceStart: null, maintenanceEnd: null })
    setPendingHost({ nodeId: node.id, hostId: device.id }); setHint('Dispositivo cadastrado. Aguardando o primeiro status para vincular este balão.')
  }
  const copySelection = () => {
    if (!editor.graph || !selected.length) return
    const fragment = selectionFragment(editor.graph, selected)
    fragment.nodes = fragment.nodes.map(n => n.hostId ? { ...n, subtitle: privateLabel(hostMap.get(n.hostId)?.group ?? '', hostMap.get(n.hostId)?.address), caption: 'Modelo — cadastre um novo IP' } : n)
    setClipboard(fragment); pasteCount.current = 0; setHint('Seleção copiada. Ctrl + V cola neste mapa.')
    return fragment
  }
  const paste = (fragment = clipboard) => {
    if (!editor.graph || !editable || !fragment?.nodes.length) return
    if (editor.graph.nodes.length + fragment.nodes.length > 600 || editor.graph.edges.length + fragment.edges.length > 2000) { setHint('A cópia excede o limite do mapa.'); return }
    const clone = cloneFragment(fragment, GRID * 2 * (++pasteCount.current))
    editor.commit({ ...editor.graph, nodes: [...editor.graph.nodes, ...clone.nodes], edges: [...editor.graph.edges, ...clone.edges] })
    setSelected(clone.nodes.map(n => n.id)); setEdgeId(null); setAppearanceOpen(false)
    setHint('Cópia criada. Balões de dispositivos são modelos: informe um novo IP no painel para cadastrá-los.')
  }
  const start = (event: ReactPointerEvent, id?: string) => {
    if (!editor.graph || event.button !== 0 || gesture.current) return
    event.stopPropagation()
    setWheelPanning(false)
    canvas.current?.focus({ preventScroll: true })
    if (connecting && id && editable && tool === 'select') {
      editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side, undefined, connecting.offset)); setConnecting(null); return
    }
    const dragging = id && editable && tool === 'select'
    let ids = dragging ? (selected.includes(id) ? selected : event.shiftKey ? [...selected, id] : [id]) : []
    if (dragging && event.shiftKey && selected.includes(id)) ids = selected.filter(x => x !== id)
    if (dragging) { setSelected(ids); setEdgeId(null) }
    else if (!id && tool === 'select') { if (!event.shiftKey) setSelected([]); setEdgeId(null) }
    gesture.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, view, graph: editor.graph, ids, mode: tool === 'pan' ? 'pan' : id ? 'nodes' : 'marquee', additive: event.shiftKey ? selected : [], moved: false, capture: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startBend = (event: ReactPointerEvent<SVGCircleElement>, edgeId: string, index: number) => {
    if (!editor.graph || !editable || tool !== 'select' || gesture.current || event.button !== 0) return
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
    else if (g.mode === 'marquee') {
      const rect = canvas.current!.getBoundingClientRect()
      const start = { x: g.startX - rect.left, y: g.startY - rect.top }, end = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setMarquee({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })
      setSelected([...new Set([...g.additive ?? [], ...rectangleSelection(nodes, worldPoint(start, g.view), worldPoint(end, g.view))])])
    }
    else if (g.mode === 'pan') setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
    else setPreview(translateSelection(g.graph, g.ids, dx / g.view.zoom, dy / g.view.zoom))
  }
  const end = (event: ReactPointerEvent, cancelled = false) => {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    if (!cancelled && g.moved && g.bend) editor.commit(moveBend(g.graph, g.bend.edgeId, g.bend.index, event.clientX - g.startX, event.clientY - g.startY, g.view.zoom))
    else if (!cancelled && g.moved && g.mode === 'nodes' && g.ids.length) {
      const dx = (event.clientX - g.startX) / g.view.zoom, dy = (event.clientY - g.startY) / g.view.zoom
      editor.commit(translateSelection(g.graph, g.ids, dx, dy))
    }
    if (cancelled && g.mode === 'pan') setView(g.view)
    if (cancelled && g.mode === 'marquee') setSelected(g.additive ?? [])
    gesture.current = null; setPreview(null); setMarquee(null)
    if (g.capture.hasPointerCapture(event.pointerId)) g.capture.releasePointerCapture(event.pointerId)
  }
  const zoom = (factor: number) => setView(v => zoomAt(v, v.zoom * factor, { x: (canvas.current?.clientWidth ?? 800) / 2, y: (canvas.current?.clientHeight ?? 600) / 2 }))
  const choose = (id: string) => {
    if (tool !== 'select') return
    if (connecting && editable && editor.graph) { editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side, undefined, connecting.offset)); setConnecting(null) }
    else { setSelected([id]); setEdgeId(null) }
  }
  const selectPort = (id: string, side: MapSide, offset = freePort(id, side)) => {
    if (!editable || !editor.graph) return
    if (connecting && connecting.id !== id) {
      editor.commit(connectNodes(editor.graph, connecting.id, id, uniqueId(), connecting.side, side, connecting.offset, offset)); setConnecting(null)
    } else setConnecting(connecting?.id === id && connecting.side === side && connecting.offset === offset ? null : { id, side, offset })
    setSelected([id]); setEdgeId(null)
  }
  const connectLine = (id: string) => {
    if (!editable || !editor.graph) return
    const geometry = routedEdges.find(e => e.id === id)
    if (!geometry) return
    if (editor.graph.edges.length + (connecting ? 2 : 1) > 2000) { setHint('Limite de conexões atingido.'); return }
    const junctionId = uniqueId()
    let next = splitConnection(editor.graph, geometry, junctionId, uniqueId())
    if (next === editor.graph) { setHint('Sem espaço para outra junção nesta linha.'); return }
    if (connecting) next = connectNodes(next, connecting.id, junctionId, uniqueId(), connecting.side, undefined, connecting.offset)
    editor.commit(next); setSelected([junctionId]); setEdgeId(null)
    setConnecting(connecting ? null : { id: junctionId })
    setHint('Junção criada. Conecte a um balão ou ao + de outra linha. Salve o mapa para manter a ramificação.')
  }
  const addBend = (raw?: { x: number; y: number }) => {
    if (!editor.graph || !edge || !editable) return
    const source = nodeMap.get(edge.source), target = nodeMap.get(edge.target)
    if (!source || !target) return
    const geometry = routedEdges.find(e => e.id === edge.id) ?? edge
    const points = edgePoints(source, target, geometry)
    let start = points[0]!, end = points[1]!, distance = -1
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!, d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d > distance) { distance = d; start = a; end = b }
    }
    const point = raw ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    editor.commit({ ...editor.graph, edges: editor.graph.edges.map(e => e.id === edge.id ? insertBend(e, source, target, point, geometry) : e) })
  }
  return <section id="infrastructure-map" className={styles.map} data-tv={tv} aria-label="Mapa interativo da rede" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')) return
    if (event.key === 'Escape') { setConnecting(null); setSelected([]); setEdgeId(null); return }
    if (!editable || !editor.graph) return
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'd'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      const key = event.key.toLowerCase()
      if (key === 'a') { setSelected(nodes.map(n => n.id)); setEdgeId(null) }
      else if (key === 'c') copySelection()
      else if (key === 'v') paste()
      else paste(copySelection())
    }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void editor.save() }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
    else if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && node) { setConnecting({ id: node.id }) }
    else if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); addTopic(event.shiftKey ? node : undefined) }
    else if (event.key.startsWith('Arrow') && selected.length) {
      event.preventDefault(); const step = event.shiftKey ? SNAP_STEP * 4 : SNAP_STEP
      editor.commit(translateSelection(editor.graph, selected,
        event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0,
        event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
    }
  }}>
    <header className={styles.toolbar}>
      <div className={styles.brand}><Network size={19} /><strong>Mapa da rede</strong><span>{nodes.length} balões</span></div>
      <div className={styles.tools}>
        <button aria-label="Selecionar e arrastar balões" aria-pressed={tool === 'select' && !wheelPanning} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
        <button aria-label="Mover o mapa" aria-pressed={tool === 'pan' || wheelPanning} onClick={() => { setTool('pan'); setConnecting(null) }}><Hand size={17} /></button>
        <button disabled={!editable || !selected.length} title="Duplicar (Ctrl + D)" onClick={() => paste(copySelection())}><Copy size={16} /> Duplicar</button>
        <button disabled={!editable || !clipboard} title="Colar (Ctrl + V)" onClick={() => paste()}><ClipboardPaste size={16} /> Colar</button>
        <button disabled={!editable || !selected.length} onClick={() => { if (graph) setSelected(branchSelection(graph, selected).filter(id => nodeMap.has(id))) }}>Selecionar árvore</button>
        <button disabled={!editable || !graph} onClick={() => addTopic()}><Plus size={16} /> Tópico</button>
        <button disabled={!editable || !graph} aria-pressed={appearanceOpen} onClick={() => setAppearanceOpen(value => !value)}><Palette size={16} /> Fundo e grade</button>
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
    {connecting && editable && <p className={styles.message} role="status">Clique no balão ou no + de uma linha para conectar. Esc cancela.</p>}
    {tv && <button type="button" className={styles.exitTv} onClick={onExitTv}>Sair do modo TV</button>}
    <div ref={canvas} className={styles.canvas} tabIndex={0} aria-label="Área do mapa: Mouse seleciona; Hand move a câmera; dois dedos navegam; Ctrl + roda ajusta zoom" data-tool={wheelPanning ? 'pan' : tool} data-locked={!editable}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
        backgroundColor: graph?.appearance?.background ?? undefined, backgroundImage: graph?.appearance?.showGrid === false ? 'none' : undefined,
        '--grid-color': graph?.appearance?.gridColor ?? 'var(--border-soft)' } as CSSProperties}
      onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)}
      onDoubleClick={e => {
        if (e.target !== canvas.current || !editable || tool !== 'select') return
        const rect = canvas.current.getBoundingClientRect()
        addTopic(undefined, worldPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view))
      }}>
      {!graph && <p className={styles.loading}>{editor.busy ? 'Carregando o mapa…' : ready ? 'Recarregue para tentar abrir o mapa.' : 'Aguardando o monitoramento…'}</p>}
      {graph && !nodes.length && <p className={styles.loading}>Nenhum dispositivo visível. Cadastre dispositivos ou adicione um tópico.</p>}
      <div className={styles.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className={styles.edges} data-connecting={Boolean(connecting)} aria-label="Conexões do mapa">
          {edges.map(e => {
            const port = junctionPoint(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
            const curve = edgeRoute(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e)
            return <g key={e.id} data-selected={e.id === edgeId}>
              <path className={styles.edgeLine} d={curve.path} style={{ stroke: e.stroke ?? undefined, strokeWidth: e.lineWidth ?? undefined,
                strokeDasharray: e.lineStyle === 'dashed' ? '10 7' : e.lineStyle === 'dotted' ? '2 6' : undefined }} />
              <path className={styles.edgeHit} d={curve.path} role="button" tabIndex={0} aria-label={privateLabel(`Conexão ${e.label || `${nodeMap.get(e.source)!.label} para ${nodeMap.get(e.target)!.label}`}`)}
                onPointerDown={event => { if (tool === 'pan' || !editable) { start(event); return }; event.stopPropagation(); canvas.current?.focus({ preventScroll: true }); setEdgeId(e.id); setSelected([]) }}
                onDoubleClick={event => {
                  event.stopPropagation()
                  if (!editable || tool !== 'select' || !editor.graph) return
                  const rect = canvas.current!.getBoundingClientRect()
                  const point = worldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, view)
                  editor.commit({ ...editor.graph, edges: editor.graph.edges.map(item => item.id === e.id ? insertBend(item, nodeMap.get(e.source)!, nodeMap.get(e.target)!, point, e) : item) })
                }}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEdgeId(e.id); setSelected([]) } }} />
              {editable && tool === 'select' && (e.id === edgeId || selected.includes(e.source) || selected.includes(e.target)) && edgePoints(nodeMap.get(e.source)!, nodeMap.get(e.target)!, e).filter((_, i, points) => i === 0 || i === points.length - 1).map((point, index) => <circle key={`anchor-${index}`} className={styles.endpoint} cx={point.x} cy={point.y} r={4} />)}
              {editable && tool === 'select' && port && <foreignObject x={port.x - 12} y={port.y - 12} width={24} height={24} className={styles.linePort}>
                <button type="button" title="Criar junção nesta linha" aria-label="Conectar nesta linha" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); connectLine(e.id) }}><Plus size={14} /></button>
              </foreignObject>}
              {e.label && <text x={curve.x} y={curve.y - 10} textAnchor="middle" className={styles.edgeLabel} style={{ fill: e.labelColor ?? undefined, stroke: graph.appearance?.background ?? undefined }}>{e.label.split("\n").map((line, index) => <tspan key={index} x={curve.x} dy={index ? 15 : 0}>{privateLabel(line)}</tspan>)}</text>}
              {e.id === edgeId && editable && tool === 'select' && e.bends?.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={10} className={styles.bend}
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
          const size = nodeSize(n)
          return <div key={n.id} className={styles.node} data-kind={n.kind} data-color={n.color} data-shape={n.shape ?? 'rounded'} data-selected={selected.includes(n.id)} data-source={connecting?.id === n.id} data-node-id={n.id} data-text-align={n.textAlign ?? (['ellipse', 'circle', 'cloud', 'diamond'].includes(n.shape ?? '') ? 'center' : 'left')}
            style={{ left: n.x, top: n.y, width: size.width, height: size.height,
              '--node-fill': n.fill ?? 'var(--surface)', '--node-outline': n.outline ?? 'var(--node-color)', '--node-text': n.textColor ?? 'var(--text)' } as CSSProperties}
            role="button" tabIndex={0} aria-label={`${privateLabel(host?.name ?? n.label, host?.address)}, ${status}`} aria-pressed={selected.includes(n.id)}
            onPointerDown={e => start(e, n.id)} onDoubleClick={e => { e.stopPropagation(); if (tool !== 'select') return; if (host) onDetails(host.id); else choose(n.id) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(n.id) } }}>
            {n.shape === 'cloud' && <svg className={styles.cloudOutline} viewBox={`0 0 216 ${CLOUD_VIEW_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={CLOUD_PATH} /></svg>}
            <div className={styles.nodeContent} data-map-text>
            <span className={styles.nodeTitle}>{host && <i className={styles.dot} data-status={host.suspended ? 'unknown' : host.status} />}<strong>{privateLabel(host?.name ?? n.label, host?.address)}</strong></span>
            {(host ? 'Dispositivo monitorado' : privateLabel(n.subtitle ?? 'Tópico de organização')) && <span className={styles.address}>{host ? 'Dispositivo monitorado' : privateLabel(n.subtitle ?? 'Tópico de organização')}</span>}
            <span className={styles.nodeBottom}><span>{host ? status : privateLabel(n.caption ?? 'Tópico')}</span>{host && <b>{formatLatency(host.latencyMs)}</b>}</span>
            {n.texts?.filter(text => text.text).map(text => <div key={text.id} className={styles.extraText} data-kind={text.kind} style={{ textAlign: text.align }}>{privateLabel(text.text)}</div>)}
            </div>
            {editable && tool === 'select' && (n.kind === 'junction' ? ['top', 'left', 'right', 'bottom'] as const : ['top', 'right', 'bottom', 'left'] as const).flatMap(side => (n.kind === 'junction' ? [.5] : (portChoices.get(`${n.id}:${side}`) ?? [.5])).map(offset => <button key={`${side}:${offset}`} type="button" className={styles.port} data-side={side} style={{ left: anchor(n, side, offset).x - n.x + (n.kind === 'junction' ? side === 'left' ? -24 : side === 'right' ? 24 : 0 : 0), top: anchor(n, side, offset).y - n.y + (n.kind === 'junction' ? side === 'top' ? -24 : side === 'bottom' ? 24 : 0 : 0) }} title={`Conectar pelo lado ${ { top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
              aria-label={`Conectar ${privateLabel(n.label)} pelo lado ${ { top: 'superior', right: 'direito', bottom: 'inferior', left: 'esquerdo' }[side]}`}
              aria-pressed={connecting?.id === n.id && connecting.side === side && connecting.offset === offset}
              onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); selectPort(n.id, side, offset) }}><Plus size={13} /></button>))}
          </div>
        })}
      </div>
      {marquee && <div className={styles.marquee} style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      {editable && graph && appearanceOpen && <MapAppearance graph={graph} commit={editor.commit} onClose={() => setAppearanceOpen(false)} />}
      {editable && graph && !appearanceOpen && (node || edge) && <div onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><MapInspector key={`${node?.id ?? edge?.id}:${node?.label ?? edge?.label}`} node={node} edge={edge} graph={graph} host={node?.hostId ? hostMap.get(node.hostId) : undefined} commit={editor.commit} onDetails={onDetails} onConnect={() => setConnecting(node ? { id: node.id } : null)} onChild={() => addTopic(node)} onDelete={remove} onAddBend={() => addBend()} onRegister={register} /></div>}
      <div className={styles.zoom} onPointerDown={e => e.stopPropagation()}>
        <button aria-label="Diminuir zoom" onClick={() => zoom(1 / 1.2)}><Minus size={17} /></button><span>{Math.round(view.zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" onClick={() => zoom(1.2)}><Plus size={17} /></button><button aria-label="Enquadrar mapa" onClick={fit}><Maximize size={17} /></button>
      </div>
    </div>
    <footer className={styles.help}><span>Mouse: selecionar/arrastar balões e seleção por área • Hand: mover câmera • Dois dedos no touchpad: navegar • Ctrl + gesto/roda: zoom • + na linha: criar ramificação • Duplo clique na linha: criar dobra • Arraste o ponto azul em passos de meia célula para ajustar • Duplo clique no ponto: remover</span>
      <details><summary>Atalhos e informações</summary><p>Ctrl + A: selecionar tudo • Ctrl + C / V / D: copiar/colar/duplicar • Shift + clique: seleção múltipla • N: tópico • Shift + N: subtópico • C: conectar • setas: mover seleção • Delete: excluir tópico/conexão • Ctrl + Z / Ctrl + Shift + Z: desfazer/refazer • Ctrl + S: salvar.</p><p>Conexões são organizadas manualmente e não comprovam ligações físicas descobertas por ping. Salve para compartilhar o mapa com outras telas.</p></details>
    </footer>
  </section>
}
