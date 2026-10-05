import { checkServerIdentity } from 'node:tls'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { canonicalHost, safeServiceAddress } from '../security/service-target.js'
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
  if (!safeServiceAddress(address)) return { ...base, status: 'unknown', latencyMs: null, error: 'Destino HTTP não autorizado ou DNS indisponível' }
  let url: URL
  try { url = new URL(check.url!) } catch { return { ...base, status: 'unknown', latencyMs: null, error: 'URL inválida' } }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { ...base, status: 'unknown', latencyMs: null, error: 'URL não autorizada' }
  return new Promise(resolve => {
    let done = false
    const finish = (result: Partial<ServiceResult>) => { if (done) return; done = true; clearTimeout(timer); resolve({ ...base, checkedAt: new Date().toISOString(), status: 'unknown', latencyMs: null, ...result }) }
    // Pin the already-resolved IP. Preserve Host/SNI and validate HTTPS against the original hostname.
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)({ hostname: address, port: url.port || (url.protocol === 'https:' ? 443 : 80), method: 'GET', path: url.pathname + url.search,
      headers: { Host: url.host }, servername: canonicalHost(url.hostname), maxHeaderSize: 8192, agent: false, checkServerIdentity: (_hostname, cert) => checkServerIdentity(canonicalHost(url.hostname), cert) }, response => {
      const code = response.statusCode ?? 0
      const ok = check.expectedStatus ? code === check.expectedStatus : code >= 200 && code < 400
      finish({ status: ok ? 'available' : 'unavailable', statusCode: code, latencyMs: performance.now() - start, error: ok ? undefined : `HTTP ${code}` })
      response.destroy(); request.destroy()
    })
    const timer = setTimeout(() => { finish({ status: 'unavailable', error: 'Tempo limite HTTP' }); request.destroy() }, env.PING_TIMEOUT_MS)
    request.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      finish({ status: /EACCES|EPERM|ENOTFOUND|EAI_AGAIN|CERT|TLS|SELF_SIGNED/.test(code) ? 'unknown' : 'unavailable', error: `${code}: ${error.message}` })
    })
    request.end()
  })
}
