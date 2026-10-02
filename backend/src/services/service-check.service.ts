import { createConnection } from 'node:net'
import { performance } from 'node:perf_hooks'
import { env } from '../config/env.js'
import type { ServiceCheck, ServiceResult } from '../types/monitor.js'

/** Service availability is independent of ICMP. HTTP doesn't follow redirects or disable TLS checks. */
export async function checkService(address: string, check: ServiceCheck): Promise<ServiceResult> {
  const start = performance.now(), checkedAt = new Date().toISOString()
  const base = { id: check.id, type: check.type, checkedAt }
  if (check.type === 'tcp') return new Promise(resolve => {
    const socket = createConnection({ host: address, port: check.port! })
    let finished = false
    const timer = setTimeout(() => finish(false, 'Tempo limite TCP'), env.PING_TIMEOUT_MS)
    const finish = (ok: boolean, error?: string) => {
      if (finished) return; finished = true; clearTimeout(timer); socket.destroy()
      resolve({ ...base, checkedAt: new Date().toISOString(), status: ok ? 'available' : /EACCES|EPERM|ENOTFOUND|EAI_AGAIN/.test(error ?? '') ? 'unknown' : 'unavailable', latencyMs: ok ? performance.now() - start : null, error, resolvedAddress: address })
    }
    socket.once('connect', () => finish(true)); socket.once('error', error => finish(false, `${(error as NodeJS.ErrnoException).code ?? ''}: ${error.message}`))
  })
  try {
    const response = await fetch(check.url!, { redirect: 'manual', signal: AbortSignal.timeout(env.PING_TIMEOUT_MS) })
    const ok = check.expectedStatus ? response.status === check.expectedStatus : response.status >= 200 && response.status < 400
    await response.body?.cancel()
    return { ...base, checkedAt: new Date().toISOString(), status: ok ? 'available' : 'unavailable', statusCode: response.status, latencyMs: performance.now() - start,
      error: ok ? undefined : `HTTP ${response.status}` }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? ''
    return { ...base, checkedAt: new Date().toISOString(), status: /EACCES|EPERM|ENOTFOUND|EAI_AGAIN|CERT|TLS|SELF_SIGNED/.test(cause) ? 'unknown' : 'unavailable', latencyMs: null, error: `${cause}: ${error instanceof Error ? error.message : String(error)}` }
  }
}
