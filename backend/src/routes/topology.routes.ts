import { allowedOrigin } from '../security/origin.js'
import { Router } from 'express'
import {
  TopologyRepository,
  TopologyConflict,
  editableTopologyDocumentSchema,
} from '../repositories/topology.repository.js'

export function createTopologyRouter(repository = new TopologyRepository()): Router {
  const router = Router()
  router.get('/', async (_req, res) => {
    try {
      res.json(await repository.load())
    } catch {
      res.status(500).json({ message: 'Não foi possível ler o mapa salvo' })
    }
  })
  router.put('/', async (req, res) => {
    const origin = req.get('origin')
    if (!allowedOrigin(origin, req.get('host'))) {
      res.status(403).json({ message: 'Origem não autorizada' })
      return
    }
    if (!req.is('application/json')) {
      res.status(415).json({ message: 'JSON obrigatório' })
      return
    }
    const parsed = editableTopologyDocumentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        message:
          'Mapa inválido: ' + [...new Set(parsed.error.issues.map((i) => i.message))].join('; '),
        issues: parsed.error.issues.map((issue) => {
          const [, collection, index, ...field] = issue.path
          const kind = collection === 'nodes' ? 'node' : collection === 'edges' ? 'edge' : undefined
          const element =
            kind && typeof index === 'number'
              ? req.body.graph?.[collection as string]?.[index]
              : undefined
          return {
            kind,
            elementId: typeof element?.id === 'string' ? element.id : undefined,
            field: field.join('.'),
            message: issue.message,
          }
        }),
      })
      return
    }
    try {
      res.json(await repository.save(parsed.data))
    } catch (error) {
      res.status(error instanceof TopologyConflict ? 409 : 500).json({
        message: error instanceof TopologyConflict ? error.message : 'Falha ao gravar o mapa',
      })
    }
  })
  return router
}
