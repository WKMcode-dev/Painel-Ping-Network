import type { MapNode, NodeColor, NodeShape } from '../../types/topology'
import { snap, nodeSize } from '../../features/topology/domain'
import { readableText } from '../../features/topology/domain/colors'
import { ColorControl } from './ColorControl'
import styles from './NetworkMap.module.css'
const shapes: { value: NodeShape; label: string }[] = [
  { value: 'rounded', label: 'Retângulo arredondado' },
  { value: 'rectangle', label: 'Retângulo' },
  { value: 'pill', label: 'Cápsula' },
  { value: 'ellipse', label: 'Elipse' },
  { value: 'circle', label: 'Círculo' },
  { value: 'cloud', label: 'Nuvem' },
  { value: 'diamond', label: 'Losango' },
]
interface Props {
  node: MapNode
  onChange: (changes: Partial<MapNode>) => void
  onChild: () => void
  onConnect: () => void
}
/** Aparência do balão; cores de status são mantidas exclusivamente pelo monitoramento. */
export function MapNodeProperties({ node, onChange: changeNode, onChild, onConnect }: Props) {
  const dimensions = nodeSize(node)
  return (
    <>
      <small>
        Se faltar espaço para novos pontos de ligação, aumente a largura ou a altura do elemento.
      </small>
      <label>
        Forma
        <select
          value={node.shape ?? 'rounded'}
          onChange={(e) =>
            changeNode({
              shape: e.target.value as NodeShape,
              width: undefined,
              height: undefined,
            })
          }
        >
          {shapes.map((shape) => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.dimensions}>
        <label>
          Largura
          <input
            type="number"
            min={96}
            max={576}
            step={12}
            value={dimensions!.width}
            onChange={(e) => {
              const width = Number(e.target.value)
              if (width >= 96 && width <= 576) changeNode({ width: snap(width) })
            }}
          />
        </label>
        <label>
          Altura
          <input
            type="number"
            min={72}
            max={576}
            step={12}
            value={dimensions!.height}
            onChange={(e) => {
              const height = Number(e.target.value)
              if (height >= 72 && height <= 576) changeNode({ height: snap(height) })
            }}
          />
        </label>
      </div>
      <label>
        Cor de referência
        <select
          value={node.color}
          onChange={(e) => changeNode({ color: e.target.value as NodeColor })}
        >
          {(['neutral', 'blue', 'green', 'orange', 'purple', 'pink'] as const).map((color, i) => (
            <option key={color} value={color}>
              {['Padrão', 'Azul', 'Verde', 'Laranja', 'Roxo', 'Rosa'][i]}
            </option>
          ))}
        </select>
      </label>
      <ColorControl
        label="Preenchimento"
        value={node.fill}
        fallback="#ffffff"
        presets
        onChange={(fill) => changeNode({ fill, textColor: readableText(fill) })}
        onClear={() => changeNode({ fill: undefined, textColor: undefined })}
      />
      <ColorControl
        label="Borda"
        value={node.outline}
        fallback="#6a9ec4"
        onChange={(outline) => changeNode({ outline })}
        onClear={() => changeNode({ outline: undefined })}
      />
      <ColorControl
        label="Texto"
        value={node.textColor}
        fallback="#202124"
        onChange={(textColor) => changeNode({ textColor })}
        onClear={() => changeNode({ textColor: undefined })}
      />
      <button onClick={onChild}>Adicionar subtópico</button>
      <button onClick={onConnect}>Conectar a outro balão</button>
    </>
  )
}
