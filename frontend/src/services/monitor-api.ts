import type { DashboardSnapshot } from '../types/monitor'

import type { MonitorConfig, DeviceConfig } from '../types/config'

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

export async function configurationRequest(config?: MonitorConfig): Promise<MonitorConfig> {
  const response = await fetch(`${configuredBase}/api/monitor/config`, {
    method: config ? 'PUT' : 'GET', headers: config ? { 'Content-Type': 'application/json' } : undefined,
    body: config ? JSON.stringify(config) : undefined, signal: AbortSignal.timeout(15000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message ?? 'Configuração indisponível')
  return data
}

async function deviceRequest(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Partial<DeviceConfig>): Promise<DeviceConfig | null> {
  const response = await fetch(`${configuredBase}/api/monitor/hosts${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message ?? 'Não foi possível salvar o dispositivo')
  }
  return response.status === 204 ? null : response.json() as Promise<DeviceConfig>
}
export const createDevice = (input: Omit<DeviceConfig, 'id'>) => deviceRequest('', 'POST', input) as Promise<DeviceConfig>
export const editDevice = (id: string, input: Partial<DeviceConfig>) => deviceRequest(`/${encodeURIComponent(id)}`, 'PATCH', input) as Promise<DeviceConfig>
export const removeDevice = (id: string) => deviceRequest(`/${encodeURIComponent(id)}`, 'DELETE')
