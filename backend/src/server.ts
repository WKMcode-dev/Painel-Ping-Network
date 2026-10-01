import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDirectory } from './storage/data-directory.js'
import { acquireStorageLock, initializeStorage } from './storage/initialize-storage.js'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { MonitorService } from './services/monitor.service.js'
import { createStatusGateway } from './websocket/status.gateway.js'

import { ConfigRepository } from './repositories/config.repository.js'

const releaseStorage = await acquireStorageLock(dataDirectory)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
try {
  await initializeStorage({ directory: dataDirectory, projectRoot, legacyDirectory: process.env.LEGACY_DATA_DIR })
} catch (error) { await releaseStorage(); throw error }
const monitorService = new MonitorService()
try {
  await monitorService.configure(new ConfigRepository())
  await monitorService.initialize()
} catch (error) { await releaseStorage(); throw error }

const server = createServer(createApp(monitorService))
const gateway = createStatusGateway(server, monitorService)

server.on('error', error => { process.exitCode = 1; console.error(error); void shutdown() })
server.listen(env.PORT, () => {
  console.log(`Painel Ping disponível em http://localhost:${env.PORT}`)
})

let stopping = false
async function shutdown(): Promise<void> {
  if (stopping) return
  stopping = true
  gateway.clients.forEach((client) => client.terminate())
  gateway.close()
  await monitorService.stop()
  await new Promise<void>(done => server.close(() => done()))
  await releaseStorage()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
