import type { Dispatch, SetStateAction } from 'react'
import type { MapText, TextAlign } from '../../types/topology'
import { uniqueId } from '../../features/topology/domain'
import styles from './NetworkMap.module.css'
interface Props {
  texts: MapText[]
  setTexts: Dispatch<SetStateAction<MapText[]>>
  onApply: () => void
}
/** Blocos são rascunhos até Aplicar: não salvam o mapa nem alteram textos ao digitar. */
export function MapTextBlocks({ texts, setTexts, onApply }: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onApply()
      }}
    >
      <strong>Blocos adicionais</strong>
      {texts.map((text, index) => (
        <fieldset className={styles.textBlockEditor} key={text.id}>
          <legend>Bloco {index + 1}</legend>
          <label>
            Tipo
            <select
              value={text.kind}
              onChange={(e) =>
                setTexts((list) =>
                  list.map((t) =>
                    t.id === text.id ? { ...t, kind: e.target.value as MapText['kind'] } : t,
                  ),
                )
              }
            >
              <option value="title">Título</option>
              <option value="subtitle">Subtítulo</option>
              <option value="text">Texto</option>
            </select>
          </label>
          <label>
            Conteúdo
            <textarea
              rows={3}
              maxLength={4000}
              value={text.text}
              onChange={(e) =>
                setTexts((list) =>
                  list.map((t) => (t.id === text.id ? { ...t, text: e.target.value } : t)),
                )
              }
            />
          </label>
          <label>
            Alinhamento do bloco
            <select
              value={text.align ?? ''}
              onChange={(e) =>
                setTexts((list) =>
                  list.map((t) =>
                    t.id === text.id
                      ? {
                          ...t,
                          align: (e.target.value || undefined) as TextAlign | undefined,
                        }
                      : t,
                  ),
                )
              }
            >
              <option value="">Usar alinhamento do balão</option>
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <div className={styles.blockActions}>
            <button
              type="button"
              disabled={index === 0}
              onClick={() =>
                setTexts((list) => {
                  const next = [...list]
                  ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                  return next
                })
              }
            >
              Subir
            </button>
            <button
              type="button"
              disabled={index === texts.length - 1}
              onClick={() =>
                setTexts((list) => {
                  const next = [...list]
                  ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
                  return next
                })
              }
            >
              Descer
            </button>
            <button
              type="button"
              onClick={() => setTexts((list) => list.filter((t) => t.id !== text.id))}
            >
              Remover
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={texts.length >= 30}
        onClick={() => setTexts((list) => [...list, { id: uniqueId(), kind: 'text', text: '' }])}
      >
        Adicionar bloco de texto
      </button>
      <small>
        Shift + Enter cria uma nova linha. Clique em Aplicar blocos e depois Salvar mapa. Até 30
        blocos por balão.
      </small>
      <button type="submit">Aplicar blocos</button>
    </form>
  )
}
