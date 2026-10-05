import { createTopologyRouter } from './routes/topology.routes.js'
import { protectWrites } from './security/admin-access.js'
import cors from 'cors'
import express from 'express'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { createMonitorRouter } from './routes/monitor.routes.js'
import type { MonitorService } from './services/monitor.service.js'

export function createApp(monitorService: MonitorService, adminKey: string) {
  const app = express()
  app.disable('x-powered-by')
  if (process.env.NODE_ENV === 'production') app.use((_req, res, next) => { res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"); next() })
  app.use(cors({ origin: env.allowedOrigins }))
  app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }); next() })
  app.use('/api', protectWrites(adminKey))
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', application: 'painel-ping', timestamp: new Date().toISOString() })
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

  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 413 ? 413 : error.status === 400 ? 400 : 500).json({ message: error.status === 413 ? 'Corpo da requisição excede o limite' : error.status === 400 ? 'JSON inválido' : 'Erro interno' })
  })
  app.use((_request, response) => {
    response.status(404).json({ message: 'Rota não encontrada' })
  })

  return app
}
