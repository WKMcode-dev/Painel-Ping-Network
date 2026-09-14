import { createServer } from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { MonitorService } from './services/monitor.service.js'
import { createStatusGateway } from './websocket/status.gateway.js'

const monitorService = new MonitorService()
await monitorService.initialize()

const server = createServer(createApp(monitorService))
const gateway = createStatusGateway(server, monitorService)

server.listen(env.PORT, () => {
  console.log(`Painel Ping disponível em http://localhost:${env.PORT}`)
})

async function shutdown(): Promise<void> {
  gateway.clients.forEach((client) => client.terminate())
  gateway.close()
  await monitorService.stop()
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
