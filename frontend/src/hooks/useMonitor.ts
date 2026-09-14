import { useCallback, useEffect, useState } from 'react'
import { fetchSnapshot, getWebSocketUrl, requestRefresh } from '../services/monitor-api'
import type { ConnectionState, DashboardSnapshot } from '../types/monitor'

const emptySnapshot: DashboardSnapshot = {
  generatedAt: '', hosts: [], recentEvents: [],
  summary: { total: 0, online: 0, offline: 0, unknown: 0, availabilityPct: 0, averageLatencyMs: null, activeIncidents: 0 },
}

export function useMonitor() {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [connection, setConnection] = useState<ConnectionState>('connecting')

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let retry: number | undefined
    let lastMessage = Date.now()
    let staleAfter = 30000
    let connecting = false
    const controller = new AbortController()
    const accept = (value: DashboardSnapshot) => {
      if (disposed) return
      lastMessage = Date.now()
      staleAfter = Math.max(30000, (value.intervalMs ?? 5000) * 3)
      setSnapshot(value)
      setConnection('live')
    }
    const connect = async () => {
      if (disposed || connecting) return
      connecting = true
      try {
        accept(await fetchSnapshot(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])))
        if (disposed) return
        socket = new WebSocket(getWebSocketUrl())
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'snapshot' && Array.isArray(message.payload?.hosts) && message.payload?.summary) accept(message.payload)
          } catch { setConnection('reconnecting') }
        }
        socket.onerror = () => socket?.close()
        socket.onclose = () => {
          if (disposed) return
          setConnection('reconnecting')
          retry = window.setTimeout(connect, 5000)
        }
      } catch {
        if (!disposed) {
          setConnection('reconnecting')
          retry = window.setTimeout(connect, 5000)
        }
      } finally { connecting = false }
    }
    void connect()
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastMessage > staleAfter) {
        setConnection('reconnecting')
        socket?.close()
      }
    }, 5000)
    return () => {
      disposed = true
      controller.abort()
      socket?.close()
      window.clearTimeout(retry)
      window.clearInterval(watchdog)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (connection !== 'live') return
    setSnapshot(await requestRefresh())
  }, [connection])
  return { snapshot, connection, refresh }
}
