import type { PingResult } from '../types/monitor.js'

/** A timed reply is required on every platform; summaries and unreachable messages aren't replies. */
export function parsePing(output: string, code: number | null, _windows: boolean): Omit<PingResult, 'checkedAt'> {
  const reply = output.split(/\r?\n/).find(line => /(?:time|tempo|temps|zeit|tiempo|время|时间|時間)\s*[=<]\s*\d+(?:[.,]\d+)?\s*(?:ms|мс|毫秒)/i.test(line))
  const latency = reply?.match(/(?:time|tempo|temps|zeit|tiempo|время|时间|時間)\s*([=<])\s*(\d+(?:[.,]\d+)?)\s*(?:ms|мс|毫秒)/i)
  const ttl = reply?.match(/(?:ttl|hlim)[=:]\s*(\d+)/i)
  const rejected = /unreachable|inacess[ií]vel|inaccesible|nicht erreichbar|injoignable|timed? out|esgotad|agotad|zeitüberschreitung|d[eé]lai.*attente|превышен|недоступ|请求超时|无法访问|100%|100,0%|100\.0%|0 received|0 recebidos/i.test(output)
  const alive = code === 0 && Boolean(latency) && !rejected
  const unsupported = code === null || (!alive && !rejected)
  return { alive, latencyMs: alive ? latency![1] === '<' ? 0 : Number(latency![2]!.replace(',', '.')) : null,
    ttl: alive && ttl?.[1] ? Number(ttl[1]) : null, probeError: unsupported,
    error: alive ? undefined : unsupported ? 'Resposta do coletor não reconhecida; disponibilidade desconhecida' : 'Host não respondeu ao ICMP' }
}
