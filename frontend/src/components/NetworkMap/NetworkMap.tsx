import { MapValidationProblems } from './MapValidationProblems'
import { MapToolbar } from './MapToolbar'
import { useMapNodeCommands } from '../../features/topology/hooks/useMapNodeCommands'
import { useMapConnectionCommands } from '../../features/topology/hooks/useMapConnectionCommands'
import { handleMapShortcut } from '../../features/topology/interaction/map-shortcuts'
import { useMapGestures } from '../../features/topology/hooks/useMapGestures'
import type { ConnectionSource, MapGesture } from '../../features/topology/types'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { MapNodeView } from './MapNodeView'
import { MapEdges } from './MapEdges'
import { Plus, Minus, Maximize } from 'lucide-react'
import type { HostSnapshot } from '../../types/monitor'
import type { Graph, MapSide } from '../../types/topology'
import { useTopology } from '../../hooks/useTopology'
import {
  allFreePortChoices,
  GRID,
  resolvedEdges,
  freePortOffsets,
  branchSelection,
  initialGraph,
  fitNodes,
  insertBend,
  snap,
  worldPoint,
  zoomAt,
} from '../../features/topology/domain'
import { useMapViewport } from '../../features/topology/hooks/useMapViewport'
import { MapInspector } from './MapInspector'
import { MapAppearance } from './MapAppearance'
import styles from './NetworkMap.module.css'

interface Props {
  hosts: HostSnapshot[]
  visibleIds: string[]
  ready: boolean
  tv: boolean
  onDetails: (id: string) => void
  onDevices: () => void
  onExitTv: () => void
}
/** Compõe o editor: hooks controlam interações e o domínio calcula a geometria.
 * O documento é salvo por useTopology; o status dos dispositivos vem do inventário. */
export function NetworkMap({
  hosts,
  visibleIds,
  ready,
  tv,
  onDetails,
  onDevices,
  onExitTv,
}: Props) {
  const editor = useTopology(hosts, ready)
  const [selected, setSelected] = useState<string[]>([])
  const [locatedIds, setLocatedIds] = useState<string[]>([])
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<ConnectionSource | null>(null)
  const [tool, setTool] = useState<'select' | 'pan'>('select')
  const [pulses, setPulses] = useState(
    () => localStorage.getItem('painel-ping-map-pulses') !== 'off',
  )
  const [locked, setLocked] = useState(false)
  const [preview, setPreview] = useState<Graph | null>(null)
  const [hint, setHint] = useState('')
  const [marquee, setMarquee] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<MapGesture | null>(null)
  const graph = preview ?? editor.graph
  const editable = !tv && !locked && !editor.busy
  const hostMap = useMemo(() => new Map(hosts.map((h) => [h.id, h])), [hosts])
  const visibleSet = new Set(visibleIds)
  const nodes =
    graph?.nodes.filter(
      (n) => !n.hostId || visibleSet.has(n.hostId) || locatedIds.includes(n.id),
    ) ?? []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const routedEdges = useMemo(() => (graph ? resolvedEdges(graph) : []), [graph])
  const portChoices = useMemo(
    () => allFreePortChoices(routedEdges, graph?.nodes),
    [routedEdges, graph],
  )
  const freePorts = useMemo(() => freePortOffsets(routedEdges), [routedEdges])
  const freePort = (id: string, side: MapSide) => freePorts.get(`${id}:${side}`) ?? 0.5
  const edges = routedEdges.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
  const node = nodes.find((n) => selected.length === 1 && selected[0] === n.id)
  const edge = graph?.edges.find((e) => e.id === edgeId)
  const { view, setView, wheelPanning, setWheelPanning, fit, resetFit } = useMapViewport({
    graph,
    tv,
    visibleIds,
    canvas,
    gesture,
  })
  const { addTopic, remove, register, copySelection, paste, clipboard } = useMapNodeCommands({
    editor,
    editable,
    selected,
    edgeId,
    node,
    hosts,
    hostMap,
    view,
    canvas,
    setSelected,
    setEdgeId,
    setConnecting,
    setHint,
    setAppearanceOpen,
  })
  const { start, startBend, move, end } = useMapGestures({
    editor,
    editable,
    tool,
    selected,
    setSelected,
    setEdgeId,
    connecting,
    setConnecting,
    view,
    setView,
    setWheelPanning,
    setPreview,
    setMarquee,
    nodes,
    canvas,
    gesture,
  })
  const zoom = (factor: number) =>
    setView((v) =>
      zoomAt(v, v.zoom * factor, {
        x: (canvas.current?.clientWidth ?? 800) / 2,
        y: (canvas.current?.clientHeight ?? 600) / 2,
      }),
    )
  const { choose, selectPort, connectLine, addBend } = useMapConnectionCommands({
    editor,
    editable,
    tool,
    connecting,
    setConnecting,
    setSelected,
    setEdgeId,
    setHint,
    freePort,
    routedEdges,
    nodeMap,
    edge,
  })
  const invalidNodes = new Set(
    editor.issues.filter((i) => i.kind === 'node').map((i) => i.elementId ?? ''),
  )
  const invalidEdges = new Set(
    editor.issues.filter((i) => i.kind === 'edge').map((i) => i.elementId ?? ''),
  )
  const locateProblem = (kind: 'node' | 'edge', id: string) => {
    if (!graph) return
    const connection = kind === 'edge' ? graph.edges.find((e) => e.id === id) : undefined
    const ids = connection ? [connection.source, connection.target] : [id]
    const targets = graph.nodes.filter((n) => ids.includes(n.id))
    if (!targets.length) return
    // Localizar também revela dispositivos excluídos pelo filtro, sem alterar o filtro global.
    setLocatedIds(ids)
    setSelected(kind === 'node' ? [id] : [])
    setEdgeId(kind === 'edge' ? id : null)
    setAppearanceOpen(false)
    setConnecting(null)
    setTool('select')
    setLocked(false)
    setView(
      fitNodes(
        targets,
        Math.max(250, (canvas.current?.clientWidth ?? 800) - 340),
        canvas.current?.clientHeight ?? 600,
      ),
    )
    canvas.current?.focus({ preventScroll: true })
  }
  return (
    <section
      id="infrastructure-map"
      className={styles.map}
      data-tv={tv}
      aria-label="Mapa interativo da rede"
      onKeyDown={(event) =>
        handleMapShortcut(event, {
          editor,
          editable,
          nodes,
          node,
          selected,
          setSelected,
          setEdgeId,
          setConnecting,
          copySelection,
          paste,
          remove,
          addTopic,
        })
      }
    >
      <MapToolbar
        nodeCount={nodes.length}
        selectionCount={selected.length}
        editable={editable}
        tool={tool}
        wheelPanning={wheelPanning}
        hasGraph={Boolean(graph)}
        hasNode={Boolean(node)}
        hasClipboard={Boolean(clipboard)}
        appearanceOpen={appearanceOpen}
        isConnecting={Boolean(connecting)}
        locked={locked}
        tv={tv}
        editor={editor}
        onSelectTool={() => setTool('select')}
        onPanTool={() => {
          setTool('pan')
          setConnecting(null)
        }}
        onDuplicate={() => paste(copySelection())}
        onPaste={() => paste()}
        onSelectTree={() => {
          if (graph) setSelected(branchSelection(graph, selected).filter((id) => nodeMap.has(id)))
        }}
        onAddTopic={() => addTopic()}
        onAppearance={() => setAppearanceOpen((value) => !value)}
        onConnect={() => setConnecting(connecting ? null : node ? { id: node.id } : null)}
        onToggleLock={() => {
          setLocked(!locked)
          setConnecting(null)
        }}
      />
      <div className={styles.status}>
        <button
          type="button"
          aria-pressed={pulses}
          title="Efeito visual; não representa tráfego medido"
          onClick={() => {
            setPulses(!pulses)
            localStorage.setItem('painel-ping-map-pulses', pulses ? 'off' : 'on')
          }}
        >
          Pulsos {pulses ? 'ativados' : 'desativados'}
        </button>
        <span>
          {tv
            ? 'Apresentação • edição bloqueada'
            : editor.dirty
              ? 'Alterações não salvas'
              : 'Mapa salvo no servidor'}
        </span>
        <button
          disabled={editor.busy}
          onClick={() => {
            if (
              !editor.dirty ||
              window.confirm('Descartar alterações locais e recarregar o mapa salvo?')
            ) {
              resetFit()
              void editor.load()
            }
          }}
        >
          Recarregar
        </button>
        <button onClick={onDevices}>Gerenciar dispositivos</button>
        <button
          disabled={!editable || !graph}
          onClick={() => {
            if (
              !editor.graph ||
              !window.confirm(
                'Reorganizar as posições por setor? Tópicos e conexões personalizados serão preservados.',
              )
            )
              return
            const layout = initialGraph(hosts),
              positions = new Map(layout.nodes.map((n) => [n.id, n]))
            editor.commit({
              ...editor.graph,
              nodes: editor.graph.nodes.map((n, i) => ({
                ...n,
                x: snap(positions.get(n.id)?.x ?? 1100 + Math.floor(i / 8) * 312),
                y: snap(positions.get(n.id)?.y ?? (i % 8) * 144),
              })),
            })
          }}
        >
          Organizar por setor
        </button>
      </div>
      {!tv && editor.error && (
        <p className={styles.message} role="alert">
          {editor.error} As alterações locais foram mantidas.
        </p>
      )}
      {!tv && graph && editor.issues.length > 0 && (
        <MapValidationProblems graph={graph} issues={editor.issues} onLocate={locateProblem} />
      )}
      {!tv && hint && (
        <p className={styles.message} role="status">
          {hint} <button onClick={() => setHint('')}>Fechar</button>
        </p>
      )}
      {connecting && editable && (
        <p className={styles.message} role="status">
          Clique no balão ou no + de uma linha para conectar. Esc cancela.
        </p>
      )}
      {tv && (
        <button type="button" className={styles.exitTv} onClick={onExitTv}>
          Sair do modo TV
        </button>
      )}
      <div
        ref={canvas}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Área do mapa: Mouse seleciona; Hand move a câmera; dois dedos navegam; Ctrl + roda ajusta zoom"
        data-tool={wheelPanning ? 'pan' : tool}
        data-locked={!editable}
        style={
          {
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
            backgroundColor: graph?.appearance?.background ?? undefined,
            backgroundImage: graph?.appearance?.showGrid === false ? 'none' : undefined,
            '--grid-color': graph?.appearance?.gridColor ?? 'var(--border-soft)',
          } as CSSProperties
        }
        onPointerDown={(e) => start(e)}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onDoubleClick={(e) => {
          if (e.target !== canvas.current || !editable || tool !== 'select') return
          const rect = canvas.current.getBoundingClientRect()
          addTopic(
            undefined,
            worldPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top }, view),
          )
        }}
      >
        {!graph && (
          <p className={styles.loading}>
            {editor.busy
              ? 'Carregando o mapa…'
              : ready
                ? 'Recarregue para tentar abrir o mapa.'
                : 'Aguardando o monitoramento…'}
          </p>
        )}
        {graph && !nodes.length && (
          <p className={styles.loading}>
            Nenhum dispositivo visível. Cadastre dispositivos ou adicione um tópico.
          </p>
        )}
        <div
          className={styles.world}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {graph && (
            <MapEdges
              pulses={pulses}
              graph={graph}
              edges={edges}
              invalidIds={tv ? undefined : invalidEdges}
              nodeMap={nodeMap}
              connecting={Boolean(connecting)}
              edgeId={edgeId}
              selected={selected}
              editable={editable}
              tool={tool}
              canvas={canvas}
              view={view}
              start={start}
              startBend={startBend}
              connectLine={connectLine}
              onSelect={(id) => {
                canvas.current?.focus({ preventScroll: true })
                setEdgeId(id)
                setSelected([])
              }}
              onInsertBend={(geometry, point) => {
                if (!editor.graph) return
                editor.commit({
                  ...editor.graph,
                  edges: editor.graph.edges.map((item) =>
                    item.id === geometry.id
                      ? insertBend(
                          item,
                          nodeMap.get(geometry.source)!,
                          nodeMap.get(geometry.target)!,
                          point,
                          geometry,
                        )
                      : item,
                  ),
                })
              }}
              onRemoveBend={(id, index) => {
                if (!editor.graph) return
                editor.commit({
                  ...editor.graph,
                  edges: editor.graph.edges.map((item) =>
                    item.id === id
                      ? { ...item, bends: item.bends?.filter((_, i) => i !== index) }
                      : item,
                  ),
                })
              }}
            />
          )}
          {nodes.map((n) => (
            <MapNodeView
              key={n.id}
              n={n}
              host={n.hostId ? hostMap.get(n.hostId) : undefined}
              selected={selected.includes(n.id)}
              invalid={!tv && invalidNodes.has(n.id)}
              connecting={connecting}
              editable={editable}
              tool={tool}
              portChoices={portChoices}
              start={start}
              choose={choose}
              onDetails={onDetails}
              selectPort={selectPort}
            />
          ))}
        </div>
        {marquee && (
          <div
            className={styles.marquee}
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
        {editable && graph && appearanceOpen && (
          <MapAppearance
            graph={graph}
            commit={editor.commit}
            onClose={() => setAppearanceOpen(false)}
          />
        )}
        {editable && graph && !appearanceOpen && (node || edge) && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <MapInspector
              key={`${node?.id ?? edge?.id}:${node?.label ?? edge?.label}`}
              node={node}
              edge={edge}
              graph={graph}
              host={node?.hostId ? hostMap.get(node.hostId) : undefined}
              commit={editor.commit}
              onDetails={onDetails}
              onConnect={() => setConnecting(node ? { id: node.id } : null)}
              onChild={() => addTopic(node)}
              onDelete={remove}
              onAddBend={() => addBend()}
              onRegister={register}
            />
          </div>
        )}
        <div className={styles.zoom} onPointerDown={(e) => e.stopPropagation()}>
          <button aria-label="Diminuir zoom" onClick={() => zoom(1 / 1.2)}>
            <Minus size={17} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button aria-label="Aumentar zoom" onClick={() => zoom(1.2)}>
            <Plus size={17} />
          </button>
          <button aria-label="Enquadrar mapa" onClick={fit}>
            <Maximize size={17} />
          </button>
        </div>
      </div>
      <footer className={styles.help}>
        <span>
          Mouse: selecionar/arrastar balões e seleção por área • Hand: mover câmera • Dois dedos no
          touchpad: navegar • Ctrl + gesto/roda: zoom • + na linha: criar ramificação • Duplo clique
          na linha: criar dobra • Arraste o ponto azul em passos de meia célula para ajustar • Duplo
          clique no ponto: remover
        </span>
        <details>
          <summary>Atalhos e informações</summary>
          <p>
            Ctrl + A: selecionar tudo • Ctrl + C / V / D: copiar/colar/duplicar • Shift + clique:
            seleção múltipla • N: tópico • Shift + N: subtópico • C: conectar • setas: mover seleção
            • Delete: excluir tópico/conexão • Ctrl + Z / Ctrl + Shift + Z: desfazer/refazer • Ctrl
            + S: salvar.
          </p>
          <p>
            Conexões são organizadas manualmente e não comprovam ligações físicas descobertas por
            ping. Salve para compartilhar o mapa com outras telas.
          </p>
        </details>
      </footer>
    </section>
  )
}
