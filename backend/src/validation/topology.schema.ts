import { z } from 'zod'
import { safeDisplayText } from '../utils/display-text.js'

/** Leitura legada preserva dados; esquemas de edição aplicam as regras atuais. */
const id = z.string().min(1).max(160)
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal #RRGGBB')
export const topologySchema = z
  .object({
    nodes: z
      .array(
        z.object({
          id,
          kind: z.literal('junction').optional(),
          hostId: z.string().min(1).max(80).optional(),
          label: z.string().trim().min(1).max(1000),
          subtitle: z.string().max(2000).optional(),
          caption: z.string().max(2000).optional(),
          textAlign: z.enum(['left', 'center', 'right']).optional(),
          texts: z
            .array(
              z.object({
                id,
                kind: z.enum(['title', 'subtitle', 'text']),
                text: z.string().max(4000),
                align: z.enum(['left', 'center', 'right']).optional(),
              }),
            )
            .max(30)
            .refine(
              (texts) => new Set(texts.map((t) => t.id)).size === texts.length,
              'IDs de texto duplicados',
            )
            .optional(),
          x: z.number().finite().min(-200000).max(200000),
          y: z.number().finite().min(-200000).max(200000),
          color: z
            .enum(['neutral', 'blue', 'green', 'orange', 'purple', 'pink'])
            .default('neutral'),
          shape: z
            .enum(['rounded', 'rectangle', 'pill', 'ellipse', 'circle', 'cloud', 'diamond'])
            .optional(),
          width: z.number().int().min(96).max(576).optional(),
          height: z.number().int().min(72).max(576).optional(),
          fill: hexColor.optional(),
          outline: hexColor.optional(),
          textColor: hexColor.optional(),
        }),
      )
      .max(600),
    edges: z
      .array(
        z.object({
          id,
          source: id,
          target: id,
          label: z.string().max(80).default(''),
          sourceSide: z.enum(['top', 'right', 'bottom', 'left']).optional(),
          targetSide: z.enum(['top', 'right', 'bottom', 'left']).optional(),
          sourceOffset: z.number().finite().min(0.05).max(0.95).optional(),
          targetOffset: z.number().finite().min(0.05).max(0.95).optional(),
          stroke: hexColor.optional(),
          labelColor: hexColor.optional(),
          lineWidth: z.number().int().min(1).max(8).optional(),
          lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
          bends: z
            .array(
              z.object({
                x: z.number().finite().min(-200000).max(200000),
                y: z.number().finite().min(-200000).max(200000),
              }),
            )
            .max(24)
            .optional(),
        }),
      )
      .max(2000),
    appearance: z
      .object({
        background: hexColor.optional(),
        gridColor: hexColor.optional(),
        showGrid: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((graph, ctx) => {
    if (graph.nodes.some((n) => n.kind === 'junction' && n.hostId))
      ctx.addIssue({ code: 'custom', message: 'Junções não podem ser dispositivos' })
    const ids = new Set(graph.nodes.map((n) => n.id))
    const hosts = graph.nodes.flatMap((n) => (n.hostId ? [n.hostId] : []))
    if (
      ids.size !== graph.nodes.length ||
      new Set(hosts).size !== hosts.length ||
      new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length
    ) {
      ctx.addIssue({ code: 'custom', message: 'Nós ou conexões duplicados' })
    }
    if (
      graph.edges.some((e) => e.source === e.target || !ids.has(e.source) || !ids.has(e.target))
    ) {
      ctx.addIssue({ code: 'custom', message: 'Conexão sem origem/destino válido' })
    }
  })
/** Erros por campo permitem localizar cada elemento sem devolver seu texto sensível. */
export const editableTopologySchema = topologySchema.superRefine((graph, ctx) => {
  const check = (text: string, path: (string | number)[]) => {
    if (!safeDisplayText(text))
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'Use IPs somente no cadastro do endereço, não nos textos do mapa',
      })
  }
  graph.nodes.forEach((node, index) => {
    check(node.label, ['nodes', index, 'label'])
    check(node.subtitle ?? '', ['nodes', index, 'subtitle'])
    check(node.caption ?? '', ['nodes', index, 'caption'])
    node.texts?.forEach((block, blockIndex) =>
      check(block.text, ['nodes', index, 'texts', blockIndex, 'text']),
    )
  })
  graph.edges.forEach((edge, index) => check(edge.label, ['edges', index, 'label']))
})
export const editableTopologyDocumentSchema = z.object({
  revision: z.number().int().nonnegative(),
  graph: editableTopologySchema,
})
export const topologyDocumentSchema = z.object({
  revision: z.number().int().nonnegative(),
  graph: topologySchema,
})
export type TopologyDocument = z.infer<typeof topologyDocumentSchema>
