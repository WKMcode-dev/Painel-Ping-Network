import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from 'react'
import type { HostSnapshot } from '../../../types/monitor'
import type { Graph, MapNode, Viewport } from '../../../types/topology'
import type { ConnectionSource } from '../types'
import {
  GRID,
  snap,
  nodeSize,
  uniqueId,
  worldPoint,
  connectNodes,
  selectionFragment,
  cloneFragment,
} from '../domain'
import { privateLabel } from '../../../utils/privacy'
import { createDevice } from '../../../services/monitor-api'
type Setter<T> = Dispatch<SetStateAction<T>>
interface Props {
  editor: { graph: Graph | null; commit: (graph: Graph) => void }
  editable: boolean
  selected: string[]
  edgeId: string | null
  node?: MapNode
  hosts: HostSnapshot[]
  hostMap: Map<string, HostSnapshot>
  view: Viewport
  canvas: RefObject<HTMLDivElement | null>
  setSelected: Setter<string[]>
  setEdgeId: Setter<string | null>
  setConnecting: Setter<ConnectionSource | null>
  setHint: Setter<string>
  setAppearanceOpen: Setter<boolean>
}
/** Comandos de tópicos e cópias. Cadastro só vincula um balão após receber o inventário atualizado. */
export function useMapNodeCommands({
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
}: Props) {
  const [clipboard, setClipboard] = useState<Graph | null>(null)
  const pasteCount = useRef(0)
  const [pendingHost, setPendingHost] = useState<{ nodeId: string; hostId: string } | null>(null)
  const addTopic = (parent?: MapNode, point?: { x: number; y: number }) => {
    if (!editor.graph || !editable) return
    if (editor.graph.nodes.length >= 600) {
      setHint('Limite de 600 balões atingido.')
      return
    }
    const id = uniqueId(),
      center =
        point ??
        worldPoint(
          {
            x: (canvas.current?.clientWidth ?? 800) / 2,
            y: (canvas.current?.clientHeight ?? 600) / 2,
          },
          view,
        )
    let next: Graph = {
      ...editor.graph,
      nodes: [
        ...editor.graph.nodes,
        {
          id,
          label: 'Novo tópico',
          color: parent?.color ?? 'blue',
          x: snap(parent ? parent.x + nodeSize(parent).width + 96 : center.x - 108),
          y: snap(parent ? parent.y + nodeSize(parent).height + 48 : center.y - 48),
        },
      ],
    }
    if (parent) next = connectNodes(next, parent.id, id, uniqueId())
    editor.commit(next)
    setSelected([id])
    setEdgeId(null)
    setConnecting(null)
    setAppearanceOpen(false)
  }
  const remove = () => {
    if (!editor.graph || !editable) return
    const removable = new Set(
      editor.graph.nodes.filter((n) => selected.includes(n.id) && !n.hostId).map((n) => n.id),
    )
    editor.commit({
      ...editor.graph,
      nodes: editor.graph.nodes.filter((n) => !removable.has(n.id)),
      edges: editor.graph.edges.filter(
        (e) => e.id !== edgeId && !removable.has(e.source) && !removable.has(e.target),
      ),
    })
    if (selected.some((id) => editor.graph!.nodes.some((n) => n.id === id && n.hostId)))
      setHint('Remova ou oculte dispositivos em Dispositivos.')
    setSelected([])
    setEdgeId(null)
  }
  // Registration becomes a binding only once the monitoring snapshot knows the new device.
  useEffect(() => {
    if (!pendingHost || !editor.graph || !hosts.some((h) => h.id === pendingHost.hostId)) return
    const host = hosts.find((h) => h.id === pendingHost.hostId)!
    editor.commit({
      ...editor.graph,
      nodes: editor.graph.nodes
        .filter((n) => n.hostId !== host.id)
        .map((n) =>
          n.id === pendingHost.nodeId ? { ...n, hostId: host.id, label: host.name } : n,
        ),
    })
    setPendingHost(null)
  }, [pendingHost, hosts, editor])
  const register = async (name: string, address: string) => {
    if (!node || !editable || pendingHost)
      throw new Error('Aguarde a atualização do monitoramento.')
    const device = await createDevice({
      name,
      address,
      group: 'Geral',
      location: '',
      description: '',
      enabled: true,
      maintenanceStart: null,
      maintenanceEnd: null,
    })
    setPendingHost({ nodeId: node.id, hostId: device.id })
    setHint('Dispositivo cadastrado. Aguardando o primeiro status para vincular este balão.')
  }
  const copySelection = () => {
    if (!editor.graph || !selected.length) return
    const fragment = selectionFragment(editor.graph, selected)
    fragment.nodes = fragment.nodes.map((n) =>
      n.hostId
        ? {
            ...n,
            subtitle: privateLabel(
              hostMap.get(n.hostId)?.group ?? '',
              hostMap.get(n.hostId)?.address,
            ),
            caption: 'Modelo — cadastre um novo IP',
          }
        : n,
    )
    setClipboard(fragment)
    pasteCount.current = 0
    setHint('Seleção copiada. Ctrl + V cola neste mapa.')
    return fragment
  }
  const paste = (fragment = clipboard) => {
    if (!editor.graph || !editable || !fragment?.nodes.length) return
    if (
      editor.graph.nodes.length + fragment.nodes.length > 600 ||
      editor.graph.edges.length + fragment.edges.length > 2000
    ) {
      setHint('A cópia excede o limite do mapa.')
      return
    }
    const clone = cloneFragment(fragment, GRID * 2 * ++pasteCount.current)
    editor.commit({
      ...editor.graph,
      nodes: [...editor.graph.nodes, ...clone.nodes],
      edges: [...editor.graph.edges, ...clone.edges],
    })
    setSelected(clone.nodes.map((n) => n.id))
    setEdgeId(null)
    setAppearanceOpen(false)
    setHint(
      'Cópia criada. Balões de dispositivos são modelos: informe um novo IP no painel para cadastrá-los.',
    )
  }

  return { addTopic, remove, register, copySelection, paste, clipboard }
}
