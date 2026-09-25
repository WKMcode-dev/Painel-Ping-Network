import { configSchema, hostSchema } from '../repositories/config.repository.js'
import { randomUUID } from 'node:crypto'
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
  const canWrite = (req: Parameters<typeof controller.status>[0]) => {
    const origin = req.get('origin')
    return !origin || origin === `${req.protocol}://${req.get('host')}` || env.allowedOrigins.includes(origin)
  }
  router.post('/hosts', async (req, res) => {
    if (!canWrite(req)) { res.status(403).json({ message: 'Origem não autorizada' }); return }
    if (!req.is('application/json')) { res.status(415).json({ message: 'JSON obrigatório' }); return }
    const parsed = hostSchema.safeParse({ ...req.body, id: randomUUID() })
    if (!parsed.success) { res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join('; ') }); return }
    try {
      await monitorService.updateConfiguration(current => configSchema.parse({ ...current, hosts: [...current.hosts, parsed.data] }))
      res.status(201).json(parsed.data)
    } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao adicionar dispositivo' }) }
  })
  router.patch('/hosts/:hostId', async (req, res) => {
    if (!canWrite(req)) { res.status(403).json({ message: 'Origem não autorizada' }); return }
    if (!req.is('application/json')) { res.status(415).json({ message: 'JSON obrigatório' }); return }
    const hostId = String(req.params.hostId)
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || ('id' in req.body && req.body.id !== hostId)) {
      res.status(400).json({ message: 'ID do dispositivo não pode ser alterado' }); return
    }
    let updated: ReturnType<typeof hostSchema.parse> | undefined
    try {
      await monitorService.updateConfiguration(current => {
        if (!current.hosts.some(host => host.id === hostId)) throw new Error('Dispositivo não encontrado')
        return configSchema.parse({ ...current, hosts: current.hosts.map(host => {
          if (host.id !== hostId) return host
          updated = hostSchema.parse({ ...host, ...req.body, id: hostId })
          return updated
        }) })
      })
      res.json(updated)
    } catch (error) { res.status(error instanceof Error && error.message === 'Dispositivo não encontrado' ? 404 : 400).json({ message: error instanceof Error ? error.message : 'Falha ao editar dispositivo' }) }
  })
  router.delete('/hosts/:hostId', async (req, res) => {
    if (!canWrite(req)) { res.status(403).json({ message: 'Origem não autorizada' }); return }
    const hostId = String(req.params.hostId)
    try {
      await monitorService.updateConfiguration(current => {
        if (!current.hosts.some(host => host.id === hostId)) throw new Error('Dispositivo não encontrado')
        return { ...current, hosts: current.hosts.filter(host => host.id !== hostId) }
      })
      res.status(204).end()
    } catch (error) { res.status(error instanceof Error && error.message === 'Dispositivo não encontrado' ? 404 : 500).json({ message: error instanceof Error ? error.message : 'Falha ao remover dispositivo' }) }
  })
  router.get('/status', controller.status)
  router.get('/hosts/:hostId/events', controller.events)
  router.post('/refresh', controller.refresh)

  return router
}
