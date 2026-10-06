import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dataFile } from '../storage/data-directory.js'

import { topologyDocumentSchema } from '../validation/topology.schema.js'
import type { TopologyDocument } from '../validation/topology.schema.js'
// Compatibilidade para integrações existentes; novas regras pertencem a validation.
export {
  topologySchema,
  topologyDocumentSchema,
  editableTopologySchema,
  editableTopologyDocumentSchema,
} from '../validation/topology.schema.js'
export type { TopologyDocument } from '../validation/topology.schema.js'

export class TopologyConflict extends Error {}

/** Single-process optimistic concurrency: stale editors cannot overwrite a newer map. */
export class TopologyRepository {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path = dataFile('topology.json')) {}
  async load(): Promise<TopologyDocument> {
    try {
      return topologyDocumentSchema.parse(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { revision: 0, graph: { nodes: [], edges: [] } }
    }
  }
  save(document: TopologyDocument): Promise<TopologyDocument> {
    const operation = this.queue.then(async () => {
      const current = await this.load()
      if (current.revision !== document.revision)
        throw new TopologyConflict('Outra sessão alterou o mapa. Recarregue antes de salvar.')
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
