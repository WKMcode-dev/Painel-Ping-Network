import {
  Network,
  Plus,
  Undo2,
  Redo2,
  Save,
  MousePointer2,
  Link2,
  Hand,
  Palette,
  Copy,
  ClipboardPaste,
} from 'lucide-react'
import styles from './NetworkMap.module.css'
interface Props {
  nodeCount: number
  selectionCount: number
  editable: boolean
  tool: 'select' | 'pan'
  wheelPanning: boolean
  hasGraph: boolean
  hasNode: boolean
  hasClipboard: boolean
  appearanceOpen: boolean
  isConnecting: boolean
  locked: boolean
  tv: boolean
  editor: {
    canUndo: boolean
    canRedo: boolean
    dirty: boolean
    busy: boolean
    undo: () => void
    redo: () => void
    save: () => Promise<void>
  }
  onSelectTool: () => void
  onPanTool: () => void
  onDuplicate: () => void
  onPaste: () => void
  onSelectTree: () => void
  onAddTopic: () => void
  onAppearance: () => void
  onConnect: () => void
  onToggleLock: () => void
}
/** Barra de ferramentas recebe apenas disponibilidade de comandos e callbacks. */
export function MapToolbar({
  nodeCount,
  selectionCount,
  editable,
  tool,
  wheelPanning,
  hasGraph,
  hasNode,
  hasClipboard,
  appearanceOpen,
  isConnecting,
  locked,
  tv,
  editor,
  onSelectTool,
  onPanTool,
  onDuplicate,
  onPaste,
  onSelectTree,
  onAddTopic,
  onAppearance,
  onConnect,
  onToggleLock,
}: Props) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.brand}>
        <Network size={19} />
        <strong>Mapa da rede</strong>
        <span>{nodeCount} balões</span>
      </div>
      <div className={styles.tools}>
        <button
          aria-label="Selecionar e arrastar balões"
          aria-pressed={tool === 'select' && !wheelPanning}
          onClick={onSelectTool}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          aria-label="Mover o mapa"
          aria-pressed={tool === 'pan' || wheelPanning}
          onClick={onPanTool}
        >
          <Hand size={17} />
        </button>
        <button
          disabled={!editable || !selectionCount}
          title="Duplicar (Ctrl + D)"
          onClick={onDuplicate}
        >
          <Copy size={16} /> Duplicar
        </button>
        <button disabled={!editable || !hasClipboard} title="Colar (Ctrl + V)" onClick={onPaste}>
          <ClipboardPaste size={16} /> Colar
        </button>
        <button disabled={!editable || !selectionCount} onClick={onSelectTree}>
          Selecionar árvore
        </button>
        <button disabled={!editable || !hasGraph} onClick={onAddTopic}>
          <Plus size={16} /> Tópico
        </button>
        <button
          disabled={!editable || !hasGraph}
          aria-pressed={appearanceOpen}
          onClick={onAppearance}
        >
          <Palette size={16} /> Fundo e grade
        </button>
        <button disabled={!editable || !hasNode} aria-pressed={isConnecting} onClick={onConnect}>
          <Link2 size={16} /> Conectar
        </button>
        <button disabled={!editable || !editor.canUndo} aria-label="Desfazer" onClick={editor.undo}>
          <Undo2 size={17} />
        </button>
        <button disabled={!editable || !editor.canRedo} aria-label="Refazer" onClick={editor.redo}>
          <Redo2 size={17} />
        </button>
        {!tv && (
          <button onClick={onToggleLock} aria-pressed={locked}>
            {locked ? 'Editar mapa' : 'Bloquear edição'}
          </button>
        )}
        <button
          className={styles.save}
          disabled={!editor.dirty || editor.busy || tv}
          onClick={() => void editor.save()}
        >
          <Save size={16} />
          {editor.busy ? 'Aguarde…' : 'Salvar mapa'}
        </button>
      </div>
    </header>
  )
}
