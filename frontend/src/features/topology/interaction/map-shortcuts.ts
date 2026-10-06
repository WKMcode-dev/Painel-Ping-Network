import type { KeyboardEvent, Dispatch, SetStateAction } from 'react'
import type { Graph, MapNode } from '../../../types/topology'
import type { ConnectionSource } from '../types'
import { SNAP_STEP, translateSelection } from '../domain'
type Setter<T> = Dispatch<SetStateAction<T>>
interface Context {
  editor: {
    graph: Graph | null
    commit: (graph: Graph) => void
    undo: () => void
    redo: () => void
    save: () => Promise<void>
  }
  editable: boolean
  nodes: MapNode[]
  node?: MapNode
  selected: string[]
  setSelected: Setter<string[]>
  setEdgeId: Setter<string | null>
  setConnecting: Setter<ConnectionSource | null>
  copySelection: () => Graph | undefined
  paste: (fragment?: Graph | null) => void
  remove: () => void
  addTopic: (parent?: MapNode) => void
}
/** Atalhos só atuam no mapa: inputs e textos editáveis mantêm seus atalhos nativos. */
export function handleMapShortcut(
  event: KeyboardEvent,
  {
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
  }: Context,
) {
  if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')) return
  if (event.key === 'Escape') {
    setConnecting(null)
    setSelected([])
    setEdgeId(null)
    return
  }
  if (!editable || !editor.graph) return
  if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'd'].includes(event.key.toLowerCase())) {
    event.preventDefault()
    const key = event.key.toLowerCase()
    if (key === 'a') {
      setSelected(nodes.map((n) => n.id))
      setEdgeId(null)
    } else if (key === 'c') copySelection()
    else if (key === 'v') paste()
    else paste(copySelection())
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) editor.redo()
    else editor.undo()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    editor.redo()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void editor.save()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    remove()
  } else if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && node) {
    setConnecting({ id: node.id })
  } else if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    addTopic(event.shiftKey ? node : undefined)
  } else if (event.key.startsWith('Arrow') && selected.length) {
    event.preventDefault()
    const step = event.shiftKey ? SNAP_STEP * 4 : SNAP_STEP
    editor.commit(
      translateSelection(
        editor.graph,
        selected,
        event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0,
        event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0,
      ),
    )
  }
}
