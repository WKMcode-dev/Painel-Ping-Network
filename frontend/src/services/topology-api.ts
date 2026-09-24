import type { TopologyDocument } from '../types/topology'
const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
export async function topologyRequest(document?: TopologyDocument): Promise<TopologyDocument> {
  const response = await fetch(`${base}/api/topology`, {
    method: document ? 'PUT' : 'GET', headers: document ? { 'Content-Type': 'application/json' } : undefined,
    body: document ? JSON.stringify(document) : undefined, signal: AbortSignal.timeout(15000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message ?? 'Mapa indisponível')
  return data
}
