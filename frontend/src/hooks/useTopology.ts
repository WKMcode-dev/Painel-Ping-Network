import { useCallback, useEffect, useRef, useState } from 'react'
import type { Graph, TopologyDocument } from '../types/topology'
import { initialGraph, reconcileGraph } from '../utils/topology'
import { topologyRequest } from '../services/topology-api'
interface History { past: Graph[]; present: Graph; future: Graph[] }
export function useTopology(hosts: { id: string; name: string; group: string }[], ready: boolean) {
  const [history, setHistory] = useState<History | null>(null)
  const [remote, setRemote] = useState<TopologyDocument | null>(null)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const inventory = JSON.stringify(hosts.map(({ id, name, group }) => ({ id, name, group })).sort((a, b) => a.id.localeCompare(b.id)))
  const load = useCallback(async () => {
    const token = ++generation.current
    setBusy(true); setError('')
    try {
      const result = await topologyRequest()
      if (generation.current !== token) return
      setRemote(result); setSaved(JSON.stringify(result.graph)); setHistory(null)
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Falha ao carregar') }
    finally { if (generation.current === token) setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!remote || !ready) return
    const devices: typeof hosts = JSON.parse(inventory)
    setHistory(previous => {
      const base = previous?.present ?? remote.graph
      const next = !previous && remote.revision === 0 && !base.nodes.length ? initialGraph(devices) : reconcileGraph(base, devices)
      if (previous && JSON.stringify(next) === JSON.stringify(base)) return previous
      // Inventory changes invalidate redo snapshots that could resurrect removed devices.
      return { past: [], present: next, future: [] }
    })
  }, [inventory, ready, remote])
  const commit = useCallback((candidate: Graph) => {
    const graph = reconcileGraph(candidate, JSON.parse(inventory))
    setHistory(h => !h || JSON.stringify(graph) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-60), present: graph, future: [] })
  }, [inventory])
  const undo = () => setHistory(h => h?.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h)
  const redo = () => setHistory(h => h?.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h)
  const save = async () => {
    if (!history || !remote || busy) return
    setBusy(true); setError('')
    const graph = history.present
    try {
      const result = await topologyRequest({ revision: remote.revision, graph })
      // Updating revision must not reset undo or edits made during the request.
      setRemote(previous => previous && ({ ...previous, revision: result.revision }))
      setSaved(JSON.stringify(graph))
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar') }
    finally { setBusy(false) }
  }
  const dirty = Boolean(history && JSON.stringify(history.present) !== saved)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return { graph: history?.present ?? null, commit, undo, redo, canUndo: Boolean(history?.past.length), canRedo: Boolean(history?.future.length), dirty, busy, error, save, load }
}
