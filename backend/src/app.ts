import { createTopologyRouter } from './routes/topology.routes.js'
import cors from 'cors'
import express from 'express'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { createMonitorRouter } from './routes/monitor.routes.js'
import type { MonitorService } from './services/monitor.service.js'

export function createApp(monitorService: MonitorService) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.allowedOrigins }))
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', timestamp: new Date().toISOString() })
  })
  app.use('/api/topology', createTopologyRouter())
  app.use('/api/monitor', createMonitorRouter(monitorService))
  app.use('/api', (_req, res) => { res.status(404).json({ message: 'Rota não encontrada' }) })

  if (process.env.NODE_ENV === 'production') {
    const currentDirectory = dirname(fileURLToPath(import.meta.url))
    const frontendPath = resolve(currentDirectory, '../../frontend/dist')
    app.use(express.static(frontendPath))
    app.get('{*path}', (_request, response) => response.sendFile(resolve(frontendPath, 'index.html')))
  }

  app.use((_request, response) => {
    response.status(404).json({ message: 'Rota não encontrada' })
  })

  return app
}
