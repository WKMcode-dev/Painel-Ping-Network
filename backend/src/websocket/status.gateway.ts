import type { Server } from 'node:http'
import { allowedOrigin } from '../security/origin.js'
import { WebSocket, WebSocketServer } from 'ws'
import type { MonitorService } from '../services/monitor.service.js'

export function createStatusGateway(server: Server, monitorService: MonitorService): WebSocketServer {
  const gateway = new WebSocketServer({ server, path: '/ws/status', maxPayload: 1024, perMessageDeflate: false, verifyClient: ({ req }, done) => {
    const origin = req.headers.origin
    const allowed = allowedOrigin(origin, req.headers.host)
    done(allowed && gateway.clients.size < 32, allowed ? 503 : 403)
  } })

  const sendSnapshot = (client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 2097152) { client.terminate(); return }
      client.send(JSON.stringify({ type: 'snapshot', payload: monitorService.getSnapshot() }))
    }
  }

  gateway.on('connection', (client) => { client.on('error', () => client.terminate()); client.on('message', () => client.close(1008, 'Canal somente de leitura')); sendSnapshot(client) })
  monitorService.subscribe((snapshot) => {
    const message = JSON.stringify({ type: 'snapshot', payload: snapshot })
    gateway.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message)
    })
  })

  return gateway
}
