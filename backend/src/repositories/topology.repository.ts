import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const id = z.string().min(1).max(160)
export const topologySchema = z.object({
  nodes: z.array(z.object({
    id, hostId: z.string().min(1).max(80).optional(), label: z.string().trim().min(1).max(100),
    x: z.number().finite().min(-200000).max(200000), y: z.number().finite().min(-200000).max(200000),
    color: z.enum(['neutral', 'blue', 'green', 'orange', 'purple', 'pink']).default('neutral'),
  })).max(600),
  edges: z.array(z.object({ id, source: id, target: id, label: z.string().max(80).default('') })).max(2000),
}).superRefine((graph, ctx) => {
  const ids = new Set(graph.nodes.map(n => n.id))
  const hosts = graph.nodes.flatMap(n => n.hostId ? [n.hostId] : [])
  const pairs = graph.edges.map(e => JSON.stringify([e.source, e.target].sort()))
  if (ids.size !== graph.nodes.length || new Set(hosts).size !== hosts.length || new Set(graph.edges.map(e => e.id)).size !== graph.edges.length || new Set(pairs).size !== pairs.length) {
    ctx.addIssue({ code: 'custom', message: 'Nós ou conexões duplicados' })
  }
  if (graph.edges.some(e => e.source === e.target || !ids.has(e.source) || !ids.has(e.target))) {
    ctx.addIssue({ code: 'custom', message: 'Conexão sem origem/destino válido' })
  }
})
export const topologyDocumentSchema = z.object({ revision: z.number().int().nonnegative(), graph: topologySchema })
export type TopologyDocument = z.infer<typeof topologyDocumentSchema>
export class TopologyConflict extends Error {}

/** Single-process optimistic concurrency: stale editors cannot overwrite a newer map. */
export class TopologyRepository {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path = resolve(dirname(fileURLToPath(import.meta.url)), '../../storage/topology.json')) {}
  async load(): Promise<TopologyDocument> {
    try { return topologyDocumentSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { revision: 0, graph: { nodes: [], edges: [] } }
    }
  }
  save(document: TopologyDocument): Promise<TopologyDocument> {
    const operation = this.queue.then(async () => {
      const current = await this.load()
      if (current.revision !== document.revision) throw new TopologyConflict('Outra sessão alterou o mapa. Recarregue antes de salvar.')
      const next = topologyDocumentSchema.parse({ ...document, revision: current.revision + 1 })
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(this.path + '.tmp', JSON.stringify(next, null, 2))
      await rename(this.path + '.tmp', this.path)
      return next
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}
