import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { MonitorService } from '../services/monitor.service.js'

export function createStatusGateway(server: Server, monitorService: MonitorService): WebSocketServer {
  const gateway = new WebSocketServer({ server, path: '/ws/status' })

  const sendSnapshot = (client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'snapshot', payload: monitorService.getSnapshot() }))
    }
  }

  gateway.on('connection', (client) => sendSnapshot(client))
  monitorService.subscribe((snapshot) => {
    const message = JSON.stringify({ type: 'snapshot', payload: snapshot })
    gateway.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message)
    })
  })

  return gateway
}
