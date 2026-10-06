import type { Graph, MapValidationIssue, MapNode } from '../../types/topology'
import { privateLabel } from '../../utils/privacy'
import styles from './NetworkMap.module.css'
interface Props {
  graph: Graph
  issues: MapValidationIssue[]
  onLocate: (kind: 'node' | 'edge', id: string) => void
}
const fieldName = (field: string) => {
  const block = /^texts\.(\d+)\.text$/.exec(field)
  if (block) return `Bloco adicional ${Number(block[1]) + 1}`
  return (
    (
      { label: 'Título', subtitle: 'Subtítulo', caption: 'Texto inferior' } as Record<
        string,
        string
      >
    )[field] ?? field
  )
}
/** A lista mantém o diagnóstico acessível mesmo sem animação ou fora da área visível. */
export function MapValidationProblems({ graph, issues, onLocate }: Props) {
  const groups = new Map<string, { kind: 'node' | 'edge'; id: string; fields: string[] }>()
  for (const issue of issues) {
    if (!issue.kind || !issue.elementId) continue
    const key = `${issue.kind}:${issue.elementId}`
    const group = groups.get(key) ?? { kind: issue.kind, id: issue.elementId, fields: [] }
    group.fields.push(fieldName(issue.field))
    groups.set(key, group)
  }
  if (!groups.size) return null
  return (
    <div className={styles.validationProblems} aria-label="Elementos com erro de validação">
      <p>
        {groups.size} elemento(s) precisam de correção. Os destaques vermelhos indicam os problemas
        da última tentativa de salvar. Corrija os campos e salve novamente.
      </p>
      <ul>
        {[...groups.values()].map(({ kind, id, fields }) => {
          const element =
            kind === 'node'
              ? graph.nodes.find((n) => n.id === id)
              : graph.edges.find((e) => e.id === id)
          const fromInventory =
            kind === 'node' &&
            Boolean((element as MapNode | undefined)?.hostId) &&
            fields.includes('Título')
          const label = privateLabel(element?.label || (kind === 'node' ? 'Balão' : 'Ligação'))
          return (
            <li key={`${kind}:${id}`}>
              <span>
                {kind === 'node' ? 'Balão' : 'Ligação'}: {label} — {[...new Set(fields)].join(', ')}
                {fromInventory && ' (corrija o nome em Gerenciar dispositivos)'}
              </span>
              <button type="button" disabled={!element} onClick={() => onLocate(kind, id)}>
                Localizar
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
