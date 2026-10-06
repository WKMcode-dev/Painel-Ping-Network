import { adminRequest } from './admin-request'
import type { TopologyDocument, MapValidationIssue } from '../types/topology'
const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
/** Preserva diagnósticos estruturados para destacar o desenho sem perder edições. */
export class TopologyValidationError extends Error {
  readonly issues: MapValidationIssue[]
  constructor(message: string, issues: MapValidationIssue[]) {
    super(message)
    this.issues = issues
  }
}
export async function topologyRequest(document?: TopologyDocument): Promise<TopologyDocument> {
  const response = await (document ? adminRequest : fetch)(`${base}/api/topology`, {
    method: document ? 'PUT' : 'GET',
    headers: document ? { 'Content-Type': 'application/json' } : undefined,
    body: document ? JSON.stringify(document) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 400 && Array.isArray(data.issues))
      throw new TopologyValidationError(data.message ?? 'Mapa inválido', data.issues)
    throw new Error(data.message ?? 'Mapa indisponível')
  }
  return data
}
