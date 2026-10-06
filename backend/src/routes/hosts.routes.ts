import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { allowedOrigin } from '../security/origin.js'
import { storedConfigSchema, hostSchema } from '../validation/config.schema.js'
import type { MonitorService } from '../services/monitor.service.js'

/** CRUD altera configuração por operações serializadas do serviço, nunca o inventário diretamente. */
export function createHostsRouter(monitorService: MonitorService): Router {
  const router = Router()
  const canWrite = (req: Request) => {
    const origin = req.get('origin')
    return allowedOrigin(origin, req.get('host'))
  }
  router.post('/hosts', async (req, res) => {
    if (!canWrite(req)) {
      res.status(403).json({ message: 'Origem não autorizada' })
      return
    }
    if (!req.is('application/json')) {
      res.status(415).json({ message: 'JSON obrigatório' })
      return
    }
    const parsed = hostSchema.safeParse({ ...req.body, id: randomUUID() })
    if (!parsed.success) {
      res
        .status(400)
        .json({ message: parsed.error.issues.map((issue) => issue.message).join('; ') })
      return
    }
    try {
      await monitorService.updateConfiguration((current) =>
        storedConfigSchema.parse({ ...current, hosts: [...current.hosts, parsed.data] }),
      )
      res.status(201).json(parsed.data)
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : 'Falha ao adicionar dispositivo',
      })
    }
  })
  router.patch('/hosts/:hostId', async (req, res) => {
    if (!canWrite(req)) {
      res.status(403).json({ message: 'Origem não autorizada' })
      return
    }
    if (!req.is('application/json')) {
      res.status(415).json({ message: 'JSON obrigatório' })
      return
    }
    const hostId = String(req.params.hostId)
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body) ||
      ('id' in req.body && req.body.id !== hostId)
    ) {
      res.status(400).json({ message: 'ID do dispositivo não pode ser alterado' })
      return
    }
    let updated: ReturnType<typeof hostSchema.parse> | undefined
    try {
      await monitorService.updateConfiguration((current) => {
        if (!current.hosts.some((host) => host.id === hostId))
          throw new Error('Dispositivo não encontrado')
        return storedConfigSchema.parse({
          ...current,
          hosts: current.hosts.map((host) => {
            if (host.id !== hostId) return host
            updated = hostSchema.parse({ ...host, ...req.body, id: hostId })
            return updated
          }),
        })
      })
      res.json(updated)
    } catch (error) {
      res
        .status(
          error instanceof Error && error.message === 'Dispositivo não encontrado' ? 404 : 400,
        )
        .json({ message: error instanceof Error ? error.message : 'Falha ao editar dispositivo' })
    }
  })
  router.delete('/hosts/:hostId', async (req, res) => {
    if (!canWrite(req)) {
      res.status(403).json({ message: 'Origem não autorizada' })
      return
    }
    const hostId = String(req.params.hostId)
    try {
      await monitorService.updateConfiguration((current) => {
        if (!current.hosts.some((host) => host.id === hostId))
          throw new Error('Dispositivo não encontrado')
        return { ...current, hosts: current.hosts.filter((host) => host.id !== hostId) }
      })
      res.status(204).end()
    } catch (error) {
      res
        .status(
          error instanceof Error && error.message === 'Dispositivo não encontrado' ? 404 : 500,
        )
        .json({ message: error instanceof Error ? error.message : 'Falha ao remover dispositivo' })
    }
  })

  return router
}
