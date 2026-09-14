import type { DashboardSnapshot } from '../types/monitor'

const configuredBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

export async function fetchSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  const response = await fetch(`${configuredBase}/api/monitor/status`, { signal })
  if (!response.ok) throw new Error('Não foi possível carregar o monitoramento')
  return response.json() as Promise<DashboardSnapshot>
}

export async function requestRefresh(): Promise<DashboardSnapshot> {
  const response = await fetch(`${configuredBase}/api/monitor/refresh`, { method: 'POST', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Não foi possível atualizar os dispositivos')
  return response.json() as Promise<DashboardSnapshot>
}

export function getWebSocketUrl(): string {
  if (configuredBase) {
    const url = new URL(configuredBase)
    return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws/status`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/status`
}


export async function fetchHostEvents(id: string, signal: AbortSignal): Promise<import('../types/monitor').StatusEvent[]> {
  const response = await fetch(`${configuredBase}/api/monitor/hosts/${encodeURIComponent(id)}/events`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) })
  if (!response.ok) throw new Error('Histórico indisponível')
  return response.json()
}
