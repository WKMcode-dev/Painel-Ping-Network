import { Router } from 'express'
import { MonitorController } from '../controllers/monitor.controller.js'
import type { MonitorService } from '../services/monitor.service.js'

export function createMonitorRouter(monitorService: MonitorService): Router {
  const router = Router()
  const controller = new MonitorController(monitorService)

  router.get('/status', controller.status)
  router.get('/hosts/:hostId/events', controller.events)
  router.post('/refresh', controller.refresh)

  return router
}
