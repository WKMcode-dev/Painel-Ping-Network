import { Router } from 'express'
import { env } from '../config/env.js'
import { TopologyRepository, TopologyConflict, topologyDocumentSchema } from '../repositories/topology.repository.js'

export function createTopologyRouter(repository = new TopologyRepository()): Router {
  const router = Router()
  router.get('/', async (_req, res) => {
    try { res.json(await repository.load()) }
    catch { res.status(500).json({ message: 'Não foi possível ler o mapa salvo' }) }
  })
  router.put('/', async (req, res) => {
    const origin = req.get('origin')
    if (origin && origin !== `${req.protocol}://${req.get('host')}` && !env.allowedOrigins.includes(origin)) {
      res.status(403).json({ message: 'Origem não autorizada' }); return
    }
    if (!req.is('application/json')) { res.status(415).json({ message: 'JSON obrigatório' }); return }
    const parsed = topologyDocumentSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ message: 'Mapa inválido: ' + parsed.error.issues.map(i => i.message).join('; ') }); return }
    try { res.json(await repository.save(parsed.data)) }
    catch (error) { res.status(error instanceof TopologyConflict ? 409 : 500).json({ message: error instanceof TopologyConflict ? error.message : 'Falha ao gravar o mapa' }) }
  })
  return router
}
