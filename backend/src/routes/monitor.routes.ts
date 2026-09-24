import { configSchema } from '../repositories/config.repository.js'
import { env } from '../config/env.js'
import { Router } from 'express'
import { MonitorController } from '../controllers/monitor.controller.js'
import type { MonitorService } from '../services/monitor.service.js'

export function createMonitorRouter(monitorService: MonitorService): Router {
  const router = Router()
  const controller = new MonitorController(monitorService)

  router.get('/config', (_req, res) => { res.json(monitorService.getConfiguration()) })
  router.put('/config', async (req, res) => {
    // Browser writes must come from this server or an explicitly allowed frontend.
    const origin = req.get('origin')
    if (origin && origin !== `${req.protocol}://${req.get('host')}` && !env.allowedOrigins.includes(origin)) {
      res.status(403).json({ message: 'Origem não autorizada' }); return
    }
    if (!req.is('application/json')) { res.status(415).json({ message: 'JSON obrigatório' }); return }
    const parsed = configSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ message: parsed.error.issues.map(i => i.message).join('; ') }); return }
    try { await monitorService.saveConfiguration(parsed.data); res.json(parsed.data) }
    catch { res.status(500).json({ message: 'Não foi possível salvar a configuração' }) }
  })
  router.get('/status', controller.status)
  router.get('/hosts/:hostId/events', controller.events)
  router.post('/refresh', controller.refresh)

  return router
}
