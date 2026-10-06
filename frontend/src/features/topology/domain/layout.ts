import type { Graph } from '../../../types/topology'
import { nodeSize, snap, snapPoint } from './nodes'

/** Device names/status remain owned by monitoring, not by this visual document. */
export function reconcileGraph(
  graph: Graph,
  hosts: { id: string; name: string; group: string }[],
): Graph {
  const hostIds = new Set(hosts.map((h) => h.id))
  const nodes = graph.nodes
    .filter((n) => !n.hostId || hostIds.has(n.hostId))
    .map((n) => ({
      ...n,
      x: n.kind === 'junction' ? snap(n.x + 6) - 6 : snap(n.x),
      y: n.kind === 'junction' ? snap(n.y + 6) - 6 : snap(n.y),
      label: n.hostId ? hosts.find((h) => h.id === n.hostId)!.name : n.label,
    }))
  const existing = new Set(nodes.flatMap((n) => (n.hostId ? [n.hostId] : [])))
  const right = nodes.length ? Math.max(...nodes.map((n) => n.x + nodeSize(n).width)) + 84 : 0
  const missing = hosts.filter((h) => !existing.has(h.id))
  missing.forEach((host, index) =>
    nodes.push({
      id: `host:${host.id}`,
      hostId: host.id,
      label: host.name,
      x: snap(right + Math.floor(index / 8) * 312),
      y: snap((index % 8) * 144),
      color: 'neutral',
    }),
  )
  const ids = new Set(nodes.map((n) => n.id))
  return {
    ...graph,
    nodes,
    edges: graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => (e.bends?.length ? { ...e, bends: e.bends.map(snapPoint) } : e)),
  }
}

/** A starting organizational diagram; these edges never claim physical discovery. */
export function initialGraph(hosts: { id: string; name: string; group: string }[]): Graph {
  if (!hosts.length) return { nodes: [], edges: [] }
  const graph: Graph = {
    nodes: [{ id: 'root', label: 'Minha rede', x: 0, y: 0, color: 'blue' }],
    edges: [],
  }
  const groups = [...new Set(hosts.map((h) => h.group))].sort()
  let row = 0
  groups.forEach((group, index) => {
    const members = hosts.filter((h) => h.group === group)
    const id = `sector:${index}`,
      y = snap(row * 144 + (members.length - 1) * 72)
    graph.nodes.push({ id, label: group, x: 336, y, color: 'purple' })
    graph.edges.push({ id: `root:${index}`, source: 'root', target: id, label: '' })
    members.forEach((host, i) => {
      const nodeId = `host:${host.id}`
      graph.nodes.push({
        id: nodeId,
        hostId: host.id,
        label: host.name,
        x: 696,
        y: (row + i) * 144,
        color: 'neutral',
      })
      graph.edges.push({ id: `member:${host.id}`, source: id, target: nodeId, label: '' })
    })
    row += members.length + 1
  })
  graph.nodes[0]!.y = snap(Math.max(0, (row - 2) * 72))
  return graph
}
